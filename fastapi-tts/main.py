import hashlib
import time
import os
import json
import logging
import re
import torch
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

torch.set_num_threads(4)
logger = logging.getLogger("uvicorn.error")

load_dotenv()  # loads OPENAI_API_KEY from .env

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from scene_demo_tts import (
    create_scene_demo_router,
    generate_emotional_wav_chunks,
    write_emotional_wav_file,
    write_kokoro_wav_file,
    write_emotional_wav_file_with_timestamps,
    split_sentences,
    get_sentence_speed,
    get_sentence_emotion_profile,
    detect_emotion,
    detect_delivery_context,
    synthesize_texts_to_wav_bytes,
    apply_emotion_effects,
    _wav_bytes_apply_effects,
    EMOTION_PROFILE,
    DEFAULT_KOKORO_VOICE,
)


UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")
PREVIEW_PAGE_COUNT = 4
PREVIEW_CHAR_BUDGET = 12000

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.error(f"Validation error: {exc.errors()}")
    logger.error(f"Body: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": (await request.body()).decode("utf-8", errors="ignore")},
    )

# Enable CORS for local frontend (Vite/Next) and general development.
# Adjust origins as needed for production deployments.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# expose generated audio files
app.mount("/tts", StaticFiles(directory=str(OUTPUT_DIR)), name="tts")
app.include_router(create_scene_demo_router(OUTPUT_DIR))


# ─────────────────────────────────────────────────────────────
# AUDIOBOOK GENERATION
# ─────────────────────────────────────────────────────────────


class Chapter(BaseModel):
    id: str
    title: str
    page: Optional[int] = None
    content: str


class AudiobookRequest(BaseModel):
    book_id: str
    title: str
    author: str
    chapters: List[Chapter]
    voice: Optional[str] = "af_heart"


# ─────────────────────────────────────────────────────────────
# CONTEXT DETECTION
# ─────────────────────────────────────────────────────────────

def _detect_sentence_context(text: str) -> str:
    t = text.strip()
    lower = t.lower()

    is_dialogue = t.startswith(("\"", "“", "'")) or t.endswith(("\"", "”", "'"))

    if is_dialogue and any(
        kw in lower for kw in ["whisper", "murmur", "softly", "quietly"]
    ):
        return "whisper"

    if is_dialogue and any(
        kw in lower for kw in ["shout", "scream", "yell", "cried out", "roar"]
    ):
        return "shout"

    if is_dialogue:
        return "dialogue"

    if t.endswith("?"):
        return "question"

    if t.endswith("!"):
        return "exclamation"

    if any(kw in lower for kw in ["death", "darkness", "shadow", "fate", "doom"]):
        return "dramatic"

    if any(kw in lower for kw in ["remember", "thought", "wondered", "heart", "soul"]):
        return "reflective"

    return "narration"


def _build_narration_instructions(text: str) -> str:
    base = (
        "You are narrating a high quality audiobook. "
        "Use natural pacing, expressive delivery, and subtle pauses."
    )

    ctx = _detect_sentence_context(text)

    if ctx == "dialogue":
        extra = " This is character dialogue. Speak conversationally."
    elif ctx == "question":
        extra = " This is a question. Use a curious tone."
    elif ctx == "exclamation":
        extra = " This is an exclamation. Add energy."
    elif ctx == "whisper":
        extra = " Speak softly like a whisper."
    elif ctx == "shout":
        extra = " Speak loudly with intensity."
    elif ctx == "dramatic":
        extra = " Add dramatic tension."
    elif ctx == "reflective":
        extra = " Speak slowly and thoughtfully."
    else:
        extra = " Maintain a clear storytelling tone."

    return base + extra


# ─────────────────────────────────────────────────────────────
# TEXT CHUNKING
# ─────────────────────────────────────────────────────────────

def _split_into_chunks(text: str, max_chars: int = 4000) -> list[str]:

    text = text.strip()

    if not text:
        return []

    import re

    raw_sentences = re.findall(r"[^.!?]+[.!?]+[\s]*", text) or [text]
    sentences = [s.strip() for s in raw_sentences if s.strip()]

    chunks = []
    current = []
    current_len = 0

    for sent in sentences:

        if current and current_len + len(sent) > max_chars:
            chunks.append(" ".join(current).strip())
            current = [sent]
            current_len = len(sent)

        else:
            current.append(sent)
            current_len += len(sent)

    if current:
        chunks.append(" ".join(current).strip())

    return chunks


def _trim_text_to_chars(text: str, max_chars: int) -> str:

    stripped = text.strip()
    if len(stripped) <= max_chars:
        return stripped

    paragraphs = [p.strip() for p in stripped.split("\n\n") if p.strip()]
    if not paragraphs:
        shortened = stripped[:max_chars]
        return shortened.rsplit(" ", 1)[0].strip() or shortened.strip()

    kept: list[str] = []
    used = 0

    for para in paragraphs:
        addition = len(para) + (2 if kept else 0)
        if used + addition <= max_chars:
            kept.append(para)
            used += addition
            continue

        remaining = max_chars - used - (2 if kept else 0)
        if remaining > 120:
            shortened = para[:remaining].rsplit(" ", 1)[0].strip() or para[:remaining].strip()
            if shortened:
                kept.append(shortened)
        break

    return "\n\n".join(kept).strip()


def _select_preview_chapters(chapters: list[Chapter]) -> list[Chapter]:

    if not chapters:
        return []

    first_page = next((ch.page for ch in chapters if ch.page is not None), None)
    page_cutoff = None if first_page is None else first_page + PREVIEW_PAGE_COUNT - 1

    preview_candidates = [
        ch for ch in chapters
        if page_cutoff is None or ch.page is None or ch.page <= page_cutoff
    ]

    if not preview_candidates:
        preview_candidates = chapters[:1]

    preview: list[Chapter] = []
    used_chars = 0

    for chapter in preview_candidates:
        remaining = PREVIEW_CHAR_BUDGET - used_chars
        if remaining <= 0:
            break

        trimmed = _trim_text_to_chars(chapter.content, remaining)
        if not trimmed:
            continue

        preview.append(
            Chapter(
                id=chapter.id,
                title=chapter.title,
                page=chapter.page,
                content=trimmed,
            )
        )
        used_chars += len(trimmed)

        if len(trimmed) < len(chapter.content):
            break

    if preview:
        return preview

    first = chapters[0]
    return [
        Chapter(
            id=first.id,
            title=first.title,
            page=first.page,
            content=_trim_text_to_chars(first.content, PREVIEW_CHAR_BUDGET),
        )
    ]


def is_special_paragraph(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return True
    # Strip surrounding underscores/asterisks that Gutenberg uses for formatting
    trimmed = trimmed.strip("_* \t\n\r")
    # Illustration/Frontispiece/Image/Cover Art
    if re.match(r"^\[illustration\b", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[frontispiece\b", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[image\b", trimmed, re.IGNORECASE):
        return True
    if re.match(r"^\[cover art\]", trimmed, re.IGNORECASE):
        return True
    # Page numbers
    if re.match(r"^\[page\s+\d+\]", trimmed, re.IGNORECASE):
        return True
    # Dividers like * * * or ---
    if re.match(r"^\*[ \t*]*\*[ \t*]*\*", trimmed):
        return True
    if re.match(r"^[-_]{3,}$", trimmed):
        return True
    return False


def _is_pride_and_prejudice_preview(book_id: str, title: str) -> bool:
    book_key = f"{book_id} {title}".lower()
    return "pride" in book_key and "prejudice" in book_key


def _select_demo_audiobook_chapters(
    book_id: str,
    title: str,
    chapters: list[Chapter],
) -> list[Chapter]:
    if _is_pride_and_prejudice_preview(book_id, title):
        return chapters[:2]
    return _select_preview_chapters(chapters)


# In-memory database of active jobs
jobs_db = {}


def process_audiobook_job(job_id: str, safe_book_id: str, preview_chapters: list[Chapter], voice: str = "af_heart"):
    safe_voice = "".join(c if c.isalnum() or c in ("-", "_") else "_" for c in voice) or "af_heart"
    book_dir = OUTPUT_DIR / f"{safe_book_id}-{safe_voice}"
    book_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        for index, chapter in enumerate(preview_chapters):
            if jobs_db.get(job_id, {}).get("status") == "cancelled":
                logger.info(f"[Job {job_id}] Cancelled by request.")
                break
            logger.info(f"[Job {job_id}] Processing chapter {index + 1}/{len(preview_chapters)}: {chapter.title} (ID: {chapter.id}, {len(chapter.content)} chars)...")
            is_pride = _is_pride_and_prejudice_preview(safe_book_id, chapter.title)
            
            if is_pride:
                chapter_filename = "chapter-1-2.wav"
                rel_path = f"{safe_book_id}-{safe_voice}/{chapter_filename}"
                if rel_path not in jobs_db[job_id]["ready_files"]:
                    jobs_db[job_id]["ready_files"].append(rel_path)
                continue
                
            # Clean formatting, bracketed illustrations, cover art, and captions
            cleaned_content = chapter.content
            cleaned_content = re.sub(r"\[Illustration\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r"\[Frontispiece\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r"\[Image\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r"\[Cover Art\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = cleaned_content.replace("_", "")

            raw_paragraphs = [
                p.strip()
                for p in cleaned_content.split("\n\n")
                if p.strip()
            ]

            filtered_paragraphs = [p for p in raw_paragraphs if not is_special_paragraph(p)]

            # Group paragraphs to avoid tiny WAV files and transition gaps
            paragraphs = []
            current = []
            current_len = 0
            min_chars = 400

            for p in filtered_paragraphs:
                if current and current_len + len(p) > min_chars * 2.5:
                    paragraphs.append("\n\n".join(current))
                    current = [p]
                    current_len = len(p)
                elif current_len >= min_chars:
                    paragraphs.append("\n\n".join(current))
                    current = [p]
                    current_len = len(p)
                else:
                    current.append(p)
                    current_len += len(p)

            if current:
                paragraphs.append("\n\n".join(current))
            
            for para_idx, para in enumerate(paragraphs):
                if jobs_db.get(job_id, {}).get("status") == "cancelled":
                    break
                    
                part_filename = f"chapter-{chapter.id}-part-{para_idx:04d}.wav"
                output_file = book_dir / part_filename
                
                if not output_file.exists():
                    logger.info(f"[Job {job_id}] Synthesizing paragraph {para_idx + 1}/{len(paragraphs)} for chapter {chapter.id}...")
                    write_emotional_wav_file_with_timestamps(para, output_file, voice=voice)
                else:
                    logger.info(f"[Job {job_id}] Paragraph part {part_filename} already exists, skipping synthesis.")
                
                rel_path = f"{safe_book_id}-{safe_voice}/{part_filename}"
                if rel_path not in jobs_db[job_id]["ready_files"]:
                    jobs_db[job_id]["ready_files"].append(rel_path)
                
        jobs_db[job_id]["status"] = "complete"
        logger.info(f"[Job {job_id}] Completed successfully!")
        
    except Exception as e:
        logger.exception(f"Error in background task for job {job_id}:")
        jobs_db[job_id]["status"] = "error"
        jobs_db[job_id]["error"] = str(e)


# ─────────────────────────────────────────────────────────────
# GENERATE AUDIOBOOK
# ─────────────────────────────────────────────────────────────

def get_chapter_paragraphs_structure(content: str) -> list[dict]:
    raw_paras = [p.strip() for p in content.split("\n\n") if p.strip()]
    paragraphs_struct = []
    
    for p in raw_paras:
        if is_special_paragraph(p):
            paragraphs_struct.append({
                "sentences": [],
                "isSpecial": True,
                "rawText": p
            })
        else:
            sentences = split_sentences(p)
            paragraphs_struct.append({
                "sentences": sentences,
                "isSpecial": False,
                "rawText": p
            })
            
    return paragraphs_struct


@app.post("/api/audiobook")
async def generate_audiobook(payload: AudiobookRequest, background_tasks: BackgroundTasks):

    if not payload.chapters:
        raise HTTPException(status_code=400, detail="No chapters provided")

    preview_chapters = _select_demo_audiobook_chapters(
        payload.book_id,
        payload.title,
        payload.chapters,
    )
    if not preview_chapters:
        raise HTTPException(status_code=400, detail="No previewable chapters provided")

    safe_book_id = "".join(
        c if c.isalnum() or c in ("-", "_") else "_"
        for c in payload.book_id
    )

    response_chapters = []
    for chapter in preview_chapters:
        response_chapters.append({
            "id": chapter.id,
            "paragraphs": get_chapter_paragraphs_structure(chapter.content)
        })

    # Resolve the requested voice BEFORE the dedup check so it can be compared.
    resolved_voice = payload.voice or "af_heart"

    # Check if there is already an active job for this book + voice combination.
    # A different voice must start a fresh job even for the same book.
    existing_job_id = None
    for j_id, j_info in jobs_db.items():
        if (
            j_info.get("safe_book_id") == safe_book_id
            and j_info.get("voice") == resolved_voice
            and j_info["status"] in ("processing", "queued")
        ):
            existing_job_id = j_id
            break
            
    if existing_job_id:
        logger.info(f"Reusing existing active job {existing_job_id} for book {safe_book_id} to prevent CPU overload")
        return {
            "success": True,
            "status": jobs_db[existing_job_id]["status"],
            "job_id": existing_job_id,
            "total": jobs_db[existing_job_id]["total"],
            "ready_files": jobs_db[existing_job_id]["ready_files"],
            "files": jobs_db[existing_job_id]["ready_files"],
            "book_id": payload.book_id,
            "title": payload.title,
            "author": payload.author,
            "chapters": response_chapters,
        }

    job_id = f"job-{safe_book_id}-{int(time.time())}"

    # Count total paragraphs (parts) to be generated
    total_parts = 0
    for chapter in preview_chapters:
        is_pride = _is_pride_and_prejudice_preview(safe_book_id, chapter.title)
        if is_pride:
            total_parts += 1
            continue
        cleaned_content = chapter.content
        cleaned_content = re.sub(r"\[Illustration\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = re.sub(r"\[Frontispiece\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = re.sub(r"\[Image\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = re.sub(r"\[Cover Art\b[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = cleaned_content.replace("_", "")
        raw_paragraphs = [p.strip() for p in cleaned_content.split("\n\n") if p.strip()]
        filtered_paragraphs = [p for p in raw_paragraphs if not is_special_paragraph(p)]
        paragraphs = []
        current = []
        current_len = 0
        min_chars = 400
        for p in filtered_paragraphs:
            if current and current_len + len(p) > min_chars * 2.5:
                paragraphs.append("\n\n".join(current))
                current = [p]
                current_len = len(p)
            elif current_len >= min_chars:
                paragraphs.append("\n\n".join(current))
                current = [p]
                current_len = len(p)
            else:
                current.append(p)
                current_len += len(p)
        if current:
            paragraphs.append("\n\n".join(current))

        total_parts += len(paragraphs)

    jobs_db[job_id] = {
        "status": "processing",
        "safe_book_id": safe_book_id,
        "voice": resolved_voice,
        "ready_files": [],
        "total": total_parts,
        "error": None
    }

    background_tasks.add_task(
        process_audiobook_job,
        job_id,
        safe_book_id,
        preview_chapters,
        resolved_voice,
    )
    
    return {
        "success": True,
        "status": "processing",
        "job_id": job_id,
        "total": total_parts,
        "ready_files": [],
        "files": [],
        "book_id": payload.book_id,
        "title": payload.title,
        "author": payload.author,
        "chapters": response_chapters,
    }


@app.get("/api/audiobook/{job_id}/status")
async def get_audiobook_status(job_id: str):
    job = jobs_db.get(job_id)
    if not job:
        # Fallback for server restart — scan all dirs matching the book prefix
        safe_book_id = job_id.replace("job-", "").rsplit("-", 1)[0]
        ready_files = []
        for book_dir in sorted(OUTPUT_DIR.glob(f"{safe_book_id}-*")):
            if book_dir.is_dir():
                dir_name = book_dir.name
                for f in sorted(book_dir.glob("*.wav")):
                    ready_files.append(f"{dir_name}/{f.name}")
        return {
            "status": "complete" if ready_files else "error",
            "job_id": job_id,
            "total": len(ready_files) or 1,
            "ready_files": ready_files,
            "error": None if ready_files else "Job not found"
        }
        
    return {
        "status": job["status"],
        "job_id": job_id,
        "total": job["total"],
        "ready_files": job["ready_files"],
        "error": job["error"]
    }


@app.post("/api/audiobook/{job_id}/cancel")
async def cancel_audiobook_job(job_id: str):
    if job_id in jobs_db:
        if jobs_db[job_id]["status"] in ("processing", "queued"):
            jobs_db[job_id]["status"] = "cancelled"
            logger.info(f"Job {job_id} cancellation requested by client.")
            return {"success": True, "detail": "Job cancellation requested"}
    return {"success": False, "detail": "Job not active or not found"}


@app.websocket("/stream")
async def stream_audio(ws: WebSocket):
    await ws.accept()

    try:
        text = (await ws.receive_text()).strip()
        if not text:
            await ws.close(code=1003)
            return

        for chunk in generate_emotional_wav_chunks(text):
            await ws.send_bytes(chunk)

        await ws.send_text("END")
    except Exception as e:
        logger.exception("Error in /stream WebSocket:")
        await ws.close(code=1011)
        return
    finally:
        if ws.client_state.name != "DISCONNECTED":
            await ws.close()


# ─────────────────────────────────────────────────────────────
# WORD-LEVEL TIMESTAMPS (for karaoke-style sync)
# ─────────────────────────────────────────────────────────────

@app.get("/api/word-timestamps/{filename:path}")
async def get_word_timestamps(filename: str):
    """
    Serve pre-generated word-level timestamps JSON sidecar file.
    """
    cache_path = OUTPUT_DIR / f"{filename}.timestamps.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    raise HTTPException(
        status_code=404,
        detail="Word timestamps not pre-generated for this file"
    )


# ─────────────────────────────────────────────────────────────
# EMOTION DEMO — single-sentence TTS with emotion metadata
# ─────────────────────────────────────────────────────────────

EMOTION_DEMO_DIR = OUTPUT_DIR / "emotion-demo"
EMOTION_DEMO_DIR.mkdir(exist_ok=True)


class EmotionDemoRequest(BaseModel):
    text: str
    emotion: Optional[str] = None   # frontend can force an emotion, skipping ML detection


# Voices that must be used directly for specific emotions — no blending.
_EMOTION_VOICE_FORCE: dict[str, str] = {
    "joy":      "bm_george",
    "surprise": "bm_george",
}

@app.post("/api/emotion-demo/tts")
async def emotion_demo_tts(payload: EmotionDemoRequest):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    prof = get_sentence_emotion_profile(text)
    # Use the emotion the frontend explicitly selected; fall back to ML detection.
    emotion = payload.emotion if payload.emotion else prof["emotion"]
    context = prof["context"]
    speed   = prof["speed"]
    ep      = EMOTION_PROFILE.get(emotion, EMOTION_PROFILE["neutral"])

    # Forced voice for specific emotions — guaranteed, no blending fallback.
    forced_voice = _EMOTION_VOICE_FORCE.get(emotion)

    digest = hashlib.sha1(f"{emotion}:{text}".encode("utf-8")).hexdigest()
    filename = f"{emotion}-{digest[:12]}.wav"
    output_file = EMOTION_DEMO_DIR / filename

    if not output_file.exists():
        try:
            if forced_voice:
                # Use the forced voice directly — completely bypasses blending
                _, wav_bytes = synthesize_texts_to_wav_bytes([text], forced_voice, speed)
            else:
                _, wav_bytes = synthesize_texts_to_wav_bytes(
                    [text], DEFAULT_KOKORO_VOICE, speed, emotion=emotion
                )
                wav_bytes = _wav_bytes_apply_effects(wav_bytes, emotion)
            output_file.write_bytes(wav_bytes)
        except Exception as exc:
            logger.exception("Error in emotion_demo_tts:")
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "url": f"/tts/emotion-demo/{filename}",
        "emotion": emotion,
        "context": context,
        "speed": speed,
        "pitch_semitones": ep["pitch_semitones"],
        "has_tremolo": ep.get("tremolo") is not None,
    }


# ─────────────────────────────────────────────────────────────
# TRANSLATION — English → target language via Helsinki-NLP
# ─────────────────────────────────────────────────────────────

TRANSLATIONS_DIR = OUTPUT_DIR / "translations"
TRANSLATIONS_DIR.mkdir(exist_ok=True)

# Supported ISO 639-1 codes → Google Translate codes.
# Google Translate returns near-instant, high-quality translations for all
# supported languages. Requires internet, but no model download.
_TRANSLATION_MODELS = {
    "en": "en",
    "bn": "bn",
    "hi": "hi",
    "fr": "fr",
    "es": "es",
    "de": "de",
}


def _translate_chunk(text: str, target_lang: str) -> str:
    """Translate a single chunk using Google Translate via deep-translator."""
    from deep_translator import GoogleTranslator
    target = _TRANSLATION_MODELS.get(target_lang)
    if not target:
        raise ValueError(f"Unsupported target language: {target_lang}")
    translator = GoogleTranslator(source="en", target=target)
    # Google's per-request cap is ~5000 chars — we chunk smaller upstream
    return translator.translate(text)


def _split_for_translation(text: str, max_chars: int = 600) -> list[str]:
    """Split text into chunks that fit inside the translation model context."""
    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for p in paragraphs:
        if len(p) > max_chars:
            # Split very long paragraphs on sentence boundaries
            for sent in split_sentences(p) or [p]:
                if current_len + len(sent) > max_chars and current:
                    chunks.append(" ".join(current))
                    current = [sent]
                    current_len = len(sent)
                else:
                    current.append(sent)
                    current_len += len(sent)
            continue
        if current_len + len(p) > max_chars and current:
            chunks.append("\n\n".join(current))
            current = [p]
            current_len = len(p)
        else:
            current.append(p)
            current_len += len(p)
    if current:
        chunks.append("\n\n".join(current))
    return chunks


class TranslateRequest(BaseModel):
    text: str
    target_lang: str = "bn"


@app.post("/api/translate")
async def translate_endpoint(payload: TranslateRequest):
    text = payload.text.strip()
    target = (payload.target_lang or "bn").strip().lower()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if target == "en":
        return {"translated": text, "target_lang": "en", "cached": False}

    if target not in _TRANSLATION_MODELS:
        raise HTTPException(status_code=400, detail=f"Language not supported: {target}")

    # Cache by (target, text) hash on disk
    digest = hashlib.sha1(f"{target}:{text}".encode("utf-8")).hexdigest()
    cache_file = TRANSLATIONS_DIR / f"{target}-{digest}.txt"

    if cache_file.exists():
        return {
            "translated": cache_file.read_text(encoding="utf-8"),
            "target_lang": target,
            "cached": True,
        }

    try:
        chunks = _split_for_translation(text)
        translated_chunks: list[str] = []
        for idx, chunk in enumerate(chunks):
            logger.info(f"Translating chunk {idx + 1}/{len(chunks)} to {target}")
            translated_chunks.append(_translate_chunk(chunk, target))

        joined = "\n\n".join(translated_chunks)
        cache_file.write_text(joined, encoding="utf-8")
        return {
            "translated": joined,
            "target_lang": target,
            "cached": False,
        }
    except Exception as exc:
        logger.exception("Translation failed:")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
