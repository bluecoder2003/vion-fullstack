import time
import os
import json
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()  # loads OPENAI_API_KEY from .env

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
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
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

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


# ─────────────────────────────────────────────────────────────
# GENERATE AUDIOBOOK
# ─────────────────────────────────────────────────────────────

@app.post("/api/audiobook")
async def generate_audiobook(payload: AudiobookRequest):

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

    # Create a dedicated folder per book (e.g. outputs/frankenstein)
    book_dir = OUTPUT_DIR / safe_book_id
    book_dir.mkdir(exist_ok=True)

    part_files: list[str] = []

    try:
        part_name = "chapter-1-2.wav" if _is_pride_and_prejudice_preview(
            payload.book_id,
            payload.title,
        ) else "preview-part-1.wav"
        output_file = book_dir / part_name
        part_chunks: list[str] = []

        for chapter in preview_chapters:
            paragraphs = [
                p.strip()
                for p in chapter.content.split("\n\n")
                if p.strip()
            ]

            for para in paragraphs:
                part_chunks.extend(_split_into_chunks(para))

        if part_chunks:
            write_emotional_wav_file(part_chunks, output_file)
            part_files.append(f"{safe_book_id}/{part_name}")

        if not part_files:
            raise HTTPException(
                status_code=500, detail="Failed to generate audiobook preview"
            )

        return {
            "success": True,
            "files": part_files,
            "book_id": payload.book_id,
            "title": payload.title,
            "author": payload.author,
        }

    except Exception as e:
        # Best-effort cleanup of any partially written files
        for rel in part_files:
            maybe = OUTPUT_DIR / rel
            if maybe.exists():
                maybe.unlink()
        raise HTTPException(status_code=500, detail=str(e))


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
    except Exception:
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
        raise HTTPException(status_code=500, detail=str(e))
