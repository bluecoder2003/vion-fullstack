import time
import os
import json
import logging
import re
import torch
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
from openai import OpenAI
from pydantic import BaseModel
from scene_demo_tts import (
    create_scene_demo_router,
    generate_emotional_wav_chunks,
    write_emotional_wav_file,
    write_kokoro_wav_file,
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

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", "dummy-key-not-set"))

# expose generated audio files
app.mount("/tts", StaticFiles(directory=str(OUTPUT_DIR)), name="tts")
app.include_router(create_scene_demo_router(OUTPUT_DIR))


# ─────────────────────────────────────────────────────────────
# AUDIO → TRANSCRIBE → EMOTIONAL TTS
# ─────────────────────────────────────────────────────────────

@app.post("/api/tts")
async def tts(audio: UploadFile = File(...), emotion: str = Form("neutral")):
    try:
        if not audio.filename:
            raise HTTPException(status_code=400, detail="Invalid audio file")

        file_path = UPLOAD_DIR / audio.filename

        with open(file_path, "wb") as buffer:
            buffer.write(await audio.read())

        # transcription
        with open(file_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
            )

        spoken_text = transcription.text

        if not spoken_text.strip():
            raise HTTPException(status_code=400, detail="Empty transcription")

        voice = "af_nicole" if emotion.lower() in {"anger", "angry", "shout"} else "af_heart"
        output_file = OUTPUT_DIR / f"converted-{int(time.time())}.wav"
        write_kokoro_wav_file(spoken_text, voice, output_file)

        return {
            "success": True,
            "file": output_file.name,
            "transcription": spoken_text,
        }

    except Exception as e:
        logger.exception("Error in /api/tts:")
        raise HTTPException(status_code=500, detail=str(e))


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


def process_audiobook_job(job_id: str, safe_book_id: str, preview_chapters: list[Chapter]):
    book_dir = OUTPUT_DIR / safe_book_id
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
                rel_path = f"{safe_book_id}/{chapter_filename}"
                if rel_path not in jobs_db[job_id]["ready_files"]:
                    jobs_db[job_id]["ready_files"].append(rel_path)
                continue
                
            # Clean formatting, bracketed illustrations, cover art, and captions
            cleaned_content = chapter.content
            cleaned_content = re.sub(r"\[Illustration:[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r"\[Frontispiece:[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r"\[Image:[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
            cleaned_content = re.sub(r"\[[Cc]over [Aa]rt\]", "", cleaned_content)
            cleaned_content = cleaned_content.replace("_", "")

            raw_paragraphs = [
                p.strip()
                for p in cleaned_content.split("\n\n")
                if p.strip()
            ]

            # Group paragraphs to avoid tiny WAV files and transition gaps
            paragraphs = []
            current = []
            current_len = 0
            min_chars = 400

            for p in raw_paragraphs:
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
                    write_emotional_wav_file(para, output_file)
                else:
                    logger.info(f"[Job {job_id}] Paragraph part {part_filename} already exists, skipping synthesis.")
                
                rel_path = f"{safe_book_id}/{part_filename}"
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

    # Check if there is already an active job for this safe_book_id
    existing_job_id = None
    for j_id, j_info in jobs_db.items():
        if j_info.get("safe_book_id") == safe_book_id and j_info["status"] in ("processing", "queued"):
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
        cleaned_content = re.sub(r"\[Illustration:[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = re.sub(r"\[Frontispiece:[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = re.sub(r"\[Image:[^\]]*\]", "", cleaned_content, flags=re.IGNORECASE)
        cleaned_content = re.sub(r"\[[Cc]over [Aa]rt\]", "", cleaned_content)
        cleaned_content = cleaned_content.replace("_", "")
        raw_paragraphs = [p.strip() for p in cleaned_content.split("\n\n") if p.strip()]
        paragraphs = []
        current = []
        current_len = 0
        min_chars = 400
        for p in raw_paragraphs:
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
        "ready_files": [],
        "total": total_parts,
        "error": None
    }
    
    background_tasks.add_task(
        process_audiobook_job,
        job_id,
        safe_book_id,
        preview_chapters
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
    }


@app.get("/api/audiobook/{job_id}/status")
async def get_audiobook_status(job_id: str):
    job = jobs_db.get(job_id)
    if not job:
        # Fallback for old/direct requests or server restart
        safe_book_id = job_id.replace("job-", "").rsplit("-", 1)[0]
        # Check output directory files
        book_dir = OUTPUT_DIR / safe_book_id
        ready_files = []
        if book_dir.exists():
            for f in sorted(book_dir.glob("*.wav")):
                ready_files.append(f"{safe_book_id}/{f.name}")
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
    Transcribe an audio file with Whisper word-level timestamps.
    Result is cached as <filename>.timestamps.json alongside the audio file.
    """
    # Resolve paths safely (no directory traversal)
    cache_path = OUTPUT_DIR / f"{filename}.timestamps.json"
    mp3_path = OUTPUT_DIR / filename

    # Serve cached version if available
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    if not mp3_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    try:
        with open(mp3_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                response_format="verbose_json",
                timestamp_granularities=["word"],
            )

        words = [
            {"word": w.word, "start": w.start, "end": w.end}
            for w in (transcription.words or [])
        ]

        # Cache to disk for subsequent requests
        cache_path.write_text(json.dumps(words))
        return words

    except Exception as e:
        logger.exception("Error in /api/word-timestamps:")
        raise HTTPException(status_code=500, detail=str(e))
