import hashlib
import io
import wave
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


DEFAULT_KOKORO_VOICE = "af_heart"
EMOTION_VOICE_MAP = {
    "joy": "af_bella",
    "anger": "af_nicole",
    "sadness": "af_heart",
    "fear": "af_heart",
    "surprise": "af_bella",
    "neutral": "af_heart",
}
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
    doc = _get_spacy_nlp()(text)
    return [sent.text.strip() for sent in doc.sents if sent.text.strip()]


def detect_emotion(text: str) -> str:
    try:
        result = _get_emotion_classifier()(text)
        label = str(result[0]["label"]).lower()
        return label if label in EMOTION_VOICE_MAP else "neutral"
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


def choose_voice_for_sentence(text: str) -> str:
    emotion = detect_emotion(text)
    context = detect_delivery_context(text)

    if context == "gentle_dialogue":
        return "af_bella"
    if context == "question":
        return "af_bella"
    if context == "exclamation":
        return "af_nicole"
    if context == "dialogue":
        if emotion in {"anger", "surprise"}:
            return "af_nicole" if emotion == "anger" else "af_bella"
        return "af_bella"
    if emotion in {"joy", "surprise"}:
        return "af_bella"
    if emotion == "anger":
        return "af_nicole"
    return "af_heart"


def resolve_kokoro_voice(voice: Optional[str]) -> str:
    requested = (voice or DEFAULT_KOKORO_VOICE).strip().lower()
    return VOICE_ALIASES.get(requested, requested or DEFAULT_KOKORO_VOICE)


def synthesize_texts_to_wav_bytes(texts: list[str], voice: Optional[str]) -> tuple[str, bytes]:
    resolved_voice = resolve_kokoro_voice(voice)
    pipeline = _get_kokoro_pipeline()
    audio_chunks: list[np.ndarray] = []

    for text in texts:
        stripped = text.strip()
        if not stripped:
            continue

        generator = pipeline(stripped, voice=resolved_voice)
        audio_chunks.extend(
            np.asarray(audio, dtype=np.float32) for _, _, audio in generator
        )

    return resolved_voice, _write_wav_bytes(audio_chunks)


def generate_emotional_wav_chunks(text: str) -> list[bytes]:
    sentences = split_sentences(text)
    if not sentences:
        sentences = [text.strip()]

    chunks: list[bytes] = []
    for sentence in sentences:
        voice = choose_voice_for_sentence(sentence)
        _, wav_bytes = synthesize_texts_to_wav_bytes([sentence], voice)
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
                raise HTTPException(status_code=500, detail=str(exc)) from exc

        return {
            "success": True,
            "file": f"scene-demo/{safe_voice}/{filename}",
            "url": f"/tts/scene-demo/{safe_voice}/{filename}",
            "voice": safe_voice,
        }

    return router
