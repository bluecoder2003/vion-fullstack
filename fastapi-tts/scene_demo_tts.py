import hashlib
import io
import wave
import logging
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from scipy.signal import resample as scipy_resample
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("uvicorn.error")


DEFAULT_KOKORO_VOICE = "af_heart"

# Voice blends per emotion.
# Mixing embeddings changes the fundamental timbre at the model level —
# af_nicole adds hardness/edge (anger), af_bella adds brightness/warmth (joy).
# Weights must sum to 1.0.
EMOTION_VOICE_BLEND: dict[str, dict[str, float]] = {
    "anger":    {"af_heart": 0.55, "af_nicole": 0.45},
    "sadness":  {"af_heart": 0.80, "af_bella":  0.20},
    "fear":     {"af_heart": 0.65, "af_bella":  0.35},
    "neutral":  {"af_heart": 1.00},
}

# Emotions that skip blending entirely and use a direct named voice.
# This is more reliable than blending when load_voice() is unavailable.
EMOTION_VOICE_DIRECT: dict[str, str] = {
    "joy":      "bm_george",
    "surprise": "bm_george",
}

# Per-emotion audio post-processing profile applied AFTER synthesis.
#   speed           — Kokoro generation speed multiplier
#   pitch_semitones — scipy resample pitch shift (+ve = higher)
#   volume          — amplitude multiplier
#   tremolo         — optional {rate_hz, depth} amplitude modulation for fear
EMOTION_PROFILE: dict[str, dict] = {
    # Positive pitch shifts via resampling create a chipmunk artefact — avoid them.
    # Joy and surprise convey energy through speed + volume instead.
    # af_heart neutral is reduced to 0.88 for a more measured, deliberate delivery.
    "anger":    {"speed": 1.38, "pitch_semitones":  0.0, "volume": 1.18, "tremolo": None},
    "joy":      {"speed": 1.22, "pitch_semitones":  0.0, "volume": 1.12, "tremolo": None},
    "sadness":  {"speed": 0.68, "pitch_semitones": -3.0, "volume": 0.82, "tremolo": None},
    "fear":     {"speed": 0.72, "pitch_semitones": -1.5, "volume": 0.75, "tremolo": {"rate_hz": 5.5, "depth": 0.30}},
    "surprise": {"speed": 1.42, "pitch_semitones":  0.0, "volume": 1.08, "tremolo": None},
    "neutral":  {"speed": 0.88, "pitch_semitones":  0.0, "volume": 1.00, "tremolo": None},
}

# Per-voice speed multiplier applied on top of the emotion-based speed.
# Keeps the emotion delivery intact while letting each voice feel natural.
VOICE_SPEED_MULTIPLIER: dict[str, float] = {
    "af_bella":  1.08,   # bella: slightly faster, energetic
    "bm_george": 0.92,   # george: British male — measured, authoritative
    "bm_lewis":  0.90,   # lewis: British male, slower
    "am_adam":   0.95,   # adam: American male
    "am_michael":0.95,
}

# Context-based speed nudge layered on top of the emotion profile speed.
CONTEXT_SPEED: dict[str, float] = {
    "exclamation":     1.10,
    "question":        0.94,
    "shout":           1.15,
    "whisper":         0.82,
    "dramatic":        0.89,
    "reflective":      0.87,
    "gentle_dialogue": 0.93,
    "dialogue":        1.02,
    "narration":       1.0,
}

# In-process cache for loaded voice tensors so we only load each once.
_VOICE_CACHE: dict[str, "np.ndarray"] = {}
VOICE_ALIASES = {
    "af_heart": "af_heart",
    "af_bella": "af_bella",
    "af_nicole": "af_nicole",
    "coral": "af_heart",
    "marin": "af_heart",
    "sage": "af_heart",
    "nova": "af_bella",
    "shimmer": "af_bella",
    "alloy": "af_nicole",
    "ash": "af_nicole",
    "ballad": "af_heart",
    "cedar": "af_nicole",
    "echo": "af_nicole",
    "fable": "af_bella",
    "onyx": "af_nicole",
    "verse": "af_bella",
}


class SceneDemoTtsRequest(BaseModel):
    text: str
    voice: str = DEFAULT_KOKORO_VOICE
    instructions: Optional[str] = None


@lru_cache(maxsize=1)
def _get_kokoro_pipeline():
    try:
        from kokoro import KPipeline
    except ImportError as exc:
        raise RuntimeError(
            "Kokoro is not installed. Install the `kokoro` package in the FastAPI environment."
        ) from exc

    return KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")


def _load_voice(voice_name: str) -> "np.ndarray":
    """Load a Kokoro voice embedding, cached in _VOICE_CACHE."""
    if voice_name not in _VOICE_CACHE:
        pipeline = _get_kokoro_pipeline()
        _VOICE_CACHE[voice_name] = pipeline.load_voice(voice_name)
    return _VOICE_CACHE[voice_name]


def _get_emotion_voice(emotion: str) -> "np.ndarray":
    """Return a blended voice embedding for the given emotion.

    Blending happens at the embedding level inside Kokoro — the model itself
    generates audio with the mixed vocal character, not post-processed audio.
    Falls back to af_heart string name if voice loading fails.
    """
    blend = EMOTION_VOICE_BLEND.get(emotion, EMOTION_VOICE_BLEND["neutral"])
    try:
        result = None
        for voice_name, weight in blend.items():
            v = _load_voice(voice_name)
            result = v * weight if result is None else result + v * weight
        return result
    except Exception as exc:
        logger.warning("Voice blending failed (%s), falling back to af_heart: %s", emotion, exc)
        return DEFAULT_KOKORO_VOICE  # type: ignore[return-value]


@lru_cache(maxsize=1)
def _get_spacy_nlp():
    try:
        import spacy
    except ImportError as exc:
        raise RuntimeError(
            "spaCy is not installed. Install `spacy` and the `en_core_web_sm` model."
        ) from exc

    try:
        return spacy.load("en_core_web_sm")
    except OSError as exc:
        raise RuntimeError(
            "spaCy model `en_core_web_sm` is not installed. Run `python -m spacy download en_core_web_sm`."
        ) from exc


@lru_cache(maxsize=1)
def _get_emotion_classifier():
    try:
        from transformers import pipeline as hf_pipeline
    except ImportError as exc:
        raise RuntimeError(
            "transformers is not installed. Install `transformers` to enable emotion-aware narration."
        ) from exc

    return hf_pipeline(
        "text-classification",
        model="j-hartmann/emotion-english-distilroberta-base",
    )


def _normalize_audio(audio: np.ndarray) -> np.ndarray:
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767).astype(np.int16)


def _write_wav_bytes(audio_chunks: list[np.ndarray], sample_rate: int = 24000) -> bytes:
    if not audio_chunks:
        raise ValueError("No audio chunks were generated")

    final_audio = np.concatenate(audio_chunks, axis=0)
    pcm_audio = _normalize_audio(final_audio)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_audio.tobytes())

    return buffer.getvalue()


def combine_wav_chunks(chunks: list[bytes], pause_ms: int = 180) -> bytes:
    if not chunks:
        raise ValueError("No WAV chunks were generated")

    combined_audio: list[np.ndarray] = []
    sample_rate: Optional[int] = None
    dtype = np.int16

    for index, chunk in enumerate(chunks):
        with wave.open(io.BytesIO(chunk), "rb") as wav_file:
            current_rate = wav_file.getframerate()
            sample_width = wav_file.getsampwidth()
            frames = wav_file.readframes(wav_file.getnframes())

        current_dtype = np.int16 if sample_width == 2 else np.uint8
        audio = np.frombuffer(frames, dtype=current_dtype)

        if sample_rate is None:
            sample_rate = current_rate
            dtype = current_dtype
        elif current_rate != sample_rate:
            raise ValueError(
                f"Incompatible sample rate in chunk {index}: {current_rate} != {sample_rate}"
            )

        if current_dtype != dtype:
            audio = audio.astype(dtype)

        combined_audio.append(audio)

        if index < len(chunks) - 1:
            silence_frames = int(sample_rate * (pause_ms / 1000))
            combined_audio.append(np.zeros(silence_frames, dtype=dtype))

    if sample_rate is None:
        raise ValueError("No audio chunks were generated")

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(np.concatenate(combined_audio, axis=0).astype(np.int16).tobytes())

    return buffer.getvalue()


def trim_wav_leading_seconds(wav_bytes: bytes, skip_seconds: float) -> bytes:
    if skip_seconds <= 0:
        return wav_bytes

    with wave.open(io.BytesIO(wav_bytes), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        channels = wav_file.getnchannels()
        frames = wav_file.readframes(wav_file.getnframes())

    dtype = np.int16 if sample_width == 2 else np.uint8
    audio = np.frombuffer(frames, dtype=dtype)
    frame_stride = max(1, channels)
    skip_frames = int(sample_rate * skip_seconds) * frame_stride
    trimmed = audio[min(skip_frames, len(audio)):]

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(trimmed.tobytes())

    return buffer.getvalue()


def split_sentences(text: str) -> list[str]:
    if not text:
        return []
        
    abbreviations = {
        "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "vs", "etc", "eg", "ie", "al",
        "col", "gen", "lt", "capt", "sgt", "st", "ave", "rd", "jan", "feb", "mar",
        "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"
    }
    
    # Capture punctuation and trailing quotes/whitespace
    parts = re.split(r"([.!?]+[\s\"')\]}\u201d\u2019]*)", text)
    sentences = []
    current = ""
    
    for i in range(0, len(parts) - 1, 2):
        chunk = parts[i]
        punct = parts[i+1]
        current += chunk + punct
        
        # Rule 1 & 2: check preceding word
        # Get words in the current chunk
        words = re.findall(r"[a-zA-Z]+", chunk)
        last_word = words[-1] if words else ""
        last_word_lower = last_word.lower()
        is_period = punct.startswith(".")
        
        # Rule 1: Abbreviations
        if is_period and last_word_lower in abbreviations:
            continue
            
        # Rule 2: Initials (e.g. J. F. Kennedy)
        if is_period and len(last_word) == 1 and last_word.isupper():
            continue
            
        # Rule 3: Decimals / digits (e.g., 3.14)
        next_chunk = parts[i+2] if i + 2 < len(parts) else ""
        if is_period and next_chunk and next_chunk[0].isdigit():
            continue
            
        sentences.append(current.strip())
        current = ""
        
    if len(parts) % 2 != 0:
        current += parts[-1]
    if current.strip():
        sentences.append(current.strip())
        
    return [s for s in sentences if s]


def detect_emotion(text: str) -> str:
    try:
        result = _get_emotion_classifier()(text)
        label = str(result[0]["label"]).lower()
        return label if label in EMOTION_PROFILE else "neutral"
    except Exception:
        return "neutral"


def detect_delivery_context(text: str) -> str:
    stripped = text.strip()
    lower = stripped.lower()
    is_dialogue = stripped.startswith(("\"", "“", "'")) or "”" in stripped or "\"" in stripped

    if stripped.endswith("?"):
        return "question"
    if stripped.endswith("!"):
        return "exclamation"
    if is_dialogue and any(
        token in lower
        for token in ["my dear", "dear mr.", "dear mrs.", "said his lady", "returned she", "cried his wife", "cried she"]
    ):
        return "gentle_dialogue"
    if is_dialogue:
        return "dialogue"
    return "narration"


def _shift_pitch(audio: np.ndarray, semitones: float, sample_rate: int = 24000) -> np.ndarray:
    """Pitch-shift audio by resampling. Positive semitones = higher pitch."""
    if abs(semitones) < 0.05:
        return audio
    factor = 2.0 ** (semitones / 12.0)
    new_len = max(1, int(round(len(audio) / factor)))
    return scipy_resample(audio, new_len).astype(np.float32)


def _apply_tremolo(audio: np.ndarray, rate_hz: float, depth: float, sample_rate: int = 24000) -> np.ndarray:
    """Amplitude modulation — creates a trembling/nervous effect."""
    t = np.arange(len(audio), dtype=np.float32) / sample_rate
    lfo = 1.0 - depth * (0.5 + 0.5 * np.sin(2.0 * np.pi * rate_hz * t))
    return (audio * lfo).astype(np.float32)


def apply_emotion_effects(audio: np.ndarray, emotion: str, sample_rate: int = 24000) -> np.ndarray:
    """Apply pitch shift, volume, and optional tremolo based on the emotion profile."""
    profile = EMOTION_PROFILE.get(emotion, EMOTION_PROFILE["neutral"])

    audio = _shift_pitch(audio, profile["pitch_semitones"], sample_rate)

    vol = profile["volume"]
    if vol != 1.0:
        audio = np.clip(audio * vol, -1.0, 1.0)

    tremolo = profile.get("tremolo")
    if tremolo:
        audio = _apply_tremolo(audio, tremolo["rate_hz"], tremolo["depth"], sample_rate)

    return audio


def get_sentence_emotion_profile(text: str) -> dict:
    """Return the full emotion+context profile for one sentence."""
    emotion = detect_emotion(text)
    context = detect_delivery_context(text)
    base_speed = EMOTION_PROFILE.get(emotion, EMOTION_PROFILE["neutral"])["speed"]
    c_delta = CONTEXT_SPEED.get(context, 1.0) - 1.0
    speed = round(max(0.60, min(1.50, base_speed + c_delta * 0.25)), 3)
    return {"emotion": emotion, "context": context, "speed": speed}


def get_sentence_speed(text: str) -> float:
    """Backward-compatible wrapper — returns only the speed multiplier."""
    return get_sentence_emotion_profile(text)["speed"]


def resolve_kokoro_voice(voice: Optional[str]) -> str:
    requested = (voice or DEFAULT_KOKORO_VOICE).strip().lower()
    return VOICE_ALIASES.get(requested, requested or DEFAULT_KOKORO_VOICE)


def synthesize_texts_to_wav_bytes(
    texts: list[str],
    voice: Optional[str],
    speed: float = 1.0,
    emotion: Optional[str] = None,
) -> tuple[str, bytes]:
    pipeline = _get_kokoro_pipeline()
    audio_chunks: list[np.ndarray] = []

    # 1. Direct voice override (bypasses blending — most reliable)
    if emotion and emotion in EMOTION_VOICE_DIRECT:
        kokoro_voice: str | np.ndarray = EMOTION_VOICE_DIRECT[emotion]
    # 2. Blended embedding (may fall back to af_heart if load_voice unavailable)
    elif emotion and emotion in EMOTION_VOICE_BLEND:
        kokoro_voice = _get_emotion_voice(emotion)
    else:
        kokoro_voice = resolve_kokoro_voice(voice)

    for text in texts:
        stripped = text.strip()
        if not stripped:
            continue

        generator = pipeline(stripped, voice=kokoro_voice, speed=speed)
        audio_chunks.extend(
            np.asarray(audio, dtype=np.float32) for _, _, audio in generator
        )

    return voice or DEFAULT_KOKORO_VOICE, _write_wav_bytes(audio_chunks)


def _wav_bytes_apply_effects(wav_bytes: bytes, emotion: str) -> bytes:
    """Decode WAV bytes, apply emotion effects, re-encode to WAV bytes."""
    with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
        sample_rate = wf.getframerate()
        raw = wf.readframes(wf.getnframes())
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32767.0
    audio = apply_emotion_effects(audio, emotion, sample_rate)
    return _write_wav_bytes([audio], sample_rate)


def generate_emotional_wav_chunks(text: str, voice: str = DEFAULT_KOKORO_VOICE) -> list[bytes]:
    sentences = split_sentences(text)
    if not sentences:
        sentences = [text.strip()]

    chunks: list[bytes] = []
    for sentence in sentences:
        if voice != DEFAULT_KOKORO_VOICE:
            speed = VOICE_SPEED_MULTIPLIER.get(voice, 1.0)
            _, wav_bytes = synthesize_texts_to_wav_bytes([sentence], voice, speed)
        else:
            prof = get_sentence_emotion_profile(sentence)
            _, wav_bytes = synthesize_texts_to_wav_bytes(
                [sentence], DEFAULT_KOKORO_VOICE, prof["speed"], emotion=prof["emotion"]
            )
            wav_bytes = _wav_bytes_apply_effects(wav_bytes, prof["emotion"])
        chunks.append(wav_bytes)

    return chunks


def write_emotional_wav_file(text: str | list[str], output_file: Path, pause_ms: int = 180) -> None:
    if isinstance(text, str):
        parts = [text]
    else:
        parts = text

    wav_chunks: list[bytes] = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        wav_chunks.extend(generate_emotional_wav_chunks(stripped))

    output_file.write_bytes(combine_wav_chunks(wav_chunks, pause_ms=pause_ms))


def write_emotional_wav_file_with_timestamps(text: str | list[str], output_file: Path, pause_ms: int = 180, voice: str = DEFAULT_KOKORO_VOICE) -> None:
    if isinstance(text, str):
        parts = [text]
    else:
        parts = text

    sentences: list[str] = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        sents = split_sentences(stripped)
        if not sents:
            sents = [stripped]
        sentences.extend(sents)

    # Synthesize each sentence to get exact sample durations
    wav_chunks: list[bytes] = []
    words_timestamps = []
    current_time = 0.0

    nlp = _get_spacy_nlp()

    for index, sentence in enumerate(sentences):
        if voice != DEFAULT_KOKORO_VOICE:
            # Non-default voice: use it pure — no blending, no pitch/tremolo effects.
            # A fixed speed from the multiplier map keeps delivery consistent.
            speed = VOICE_SPEED_MULTIPLIER.get(voice, 1.0)
            _, wav_bytes = synthesize_texts_to_wav_bytes([sentence], voice, speed)
        else:
            prof = get_sentence_emotion_profile(sentence)
            _, wav_bytes = synthesize_texts_to_wav_bytes(
                [sentence], DEFAULT_KOKORO_VOICE, prof["speed"], emotion=prof["emotion"]
            )
            wav_bytes = _wav_bytes_apply_effects(wav_bytes, prof["emotion"])
        wav_chunks.append(wav_bytes)

        # Calculate exact duration
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav_file:
            sample_rate = wav_file.getframerate()
            n_frames = wav_file.getnframes()
        duration = n_frames / sample_rate

        # Get spaCy tokens for word-level timestamps
        doc = nlp(sentence)
        tokens = [t for t in doc if t.text.strip()]
        sentence_len = len(sentence)

        if sentence_len > 0 and tokens:
            for token in tokens:
                start_char = token.idx
                end_char = token.idx + len(token.text)
                
                t_start = current_time + (start_char / sentence_len) * duration
                t_end = current_time + (end_char / sentence_len) * duration
                
                words_timestamps.append({
                    "word": token.text,
                    "start": round(t_start, 3),
                    "end": round(t_end, 3)
                })
        elif tokens:
            for i_tok, token in enumerate(tokens):
                t_start = current_time + (i_tok / len(tokens)) * duration
                t_end = current_time + ((i_tok + 1) / len(tokens)) * duration
                words_timestamps.append({
                    "word": token.text,
                    "start": round(t_start, 3),
                    "end": round(t_end, 3)
                })

        current_time += duration
        if index < len(sentences) - 1:
            current_time += pause_ms / 1000.0

    output_file.write_bytes(combine_wav_chunks(wav_chunks, pause_ms=pause_ms))

    timestamps_path = output_file.parent / f"{output_file.name}.timestamps.json"
    timestamps_path.write_text(json.dumps(words_timestamps))


def write_trimmed_emotional_wav_file(
    text: str | list[str],
    output_file: Path,
    skip_seconds: float,
    pause_ms: int = 180,
) -> None:
    if isinstance(text, str):
        parts = [text]
    else:
        parts = text

    wav_chunks: list[bytes] = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        wav_chunks.extend(generate_emotional_wav_chunks(stripped))

    combined = combine_wav_chunks(wav_chunks, pause_ms=pause_ms)
    output_file.write_bytes(trim_wav_leading_seconds(combined, skip_seconds))


def write_kokoro_wav_file(texts: str | list[str], voice: Optional[str], output_file: Path) -> str:
    if isinstance(texts, str):
        payload = [texts]
    else:
        payload = texts

    resolved_voice, audio_bytes = synthesize_texts_to_wav_bytes(payload, voice)
    output_file.write_bytes(audio_bytes)
    return resolved_voice


def create_scene_demo_router(output_dir: Path) -> APIRouter:
    router = APIRouter()
    scene_demo_dir = output_dir / "scene-demo"
    scene_demo_dir.mkdir(exist_ok=True)

    @router.post("/api/scene-demo/tts")
    async def generate_scene_demo_tts(payload: SceneDemoTtsRequest):
        text = payload.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")

        resolved_voice = resolve_kokoro_voice(payload.voice)
        safe_voice = "".join(
            c if c.isalnum() or c in ("-", "_") else "_"
            for c in resolved_voice
        ) or DEFAULT_KOKORO_VOICE

        voice_dir = scene_demo_dir / safe_voice
        voice_dir.mkdir(exist_ok=True)

        digest = hashlib.sha1(
            f"{safe_voice}\n{payload.instructions or ''}\n{text}".encode("utf-8")
        ).hexdigest()
        filename = f"{digest}.wav"
        output_file = voice_dir / filename

        if not output_file.exists():
            try:
                write_kokoro_wav_file(text, safe_voice, output_file)
            except HTTPException:
                raise
            except Exception as exc:
                logger.exception("Error in generate_scene_demo_tts:")
                raise HTTPException(status_code=500, detail=str(exc)) from exc

        return {
            "success": True,
            "file": f"scene-demo/{safe_voice}/{filename}",
            "url": f"/tts/scene-demo/{safe_voice}/{filename}",
            "voice": safe_voice,
        }

    return router
