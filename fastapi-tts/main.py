import time
import os
import json
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

load_dotenv()  # loads OPENAI_API_KEY from .env

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
from scene_demo_tts import create_scene_demo_router


UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("outputs")

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
app.include_router(create_scene_demo_router(client, OUTPUT_DIR))


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

        # emotional TTS
        tts_response = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="coral",
            input=spoken_text,
            instructions=f"Speak in a {emotion} tone.",
        )

        audio_bytes = tts_response.read()

        output_file = OUTPUT_DIR / f"converted-{int(time.time())}.mp3"

        with open(output_file, "wb") as f:
            f.write(audio_bytes)

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
    voice: Optional[str] = "coral"


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


# ─────────────────────────────────────────────────────────────
# GENERATE AUDIOBOOK
# ─────────────────────────────────────────────────────────────

@app.post("/api/audiobook")
async def generate_audiobook(payload: AudiobookRequest):

    if not payload.chapters:
        raise HTTPException(status_code=400, detail="No chapters provided")

    safe_book_id = "".join(
        c if c.isalnum() or c in ("-", "_") else "_"
        for c in payload.book_id
    )

    # Create a dedicated folder per book (e.g. outputs/frankenstein)
    book_dir = OUTPUT_DIR / safe_book_id
    book_dir.mkdir(exist_ok=True)

    # Split chapters into up to 5 contiguous parts
    total_chapters = len(payload.chapters)
    num_parts = min(5, max(1, total_chapters))

    # Ensure at least 1 chapter per part
    base_size = total_chapters // num_parts
    remainder = total_chapters % num_parts

    part_files: list[str] = []
    idx = 0

    try:
        for part_idx in range(num_parts):
            # Distribute remainder chapters one by one into the first parts
            size = base_size + (1 if part_idx < remainder else 0)
            if size <= 0:
                continue

            part_chapters = payload.chapters[idx : idx + size]
            idx += size

            if not part_chapters:
                continue

            part_name = f"part-{part_idx + 1}.mp3"
            output_file = book_dir / part_name

            with open(output_file, "wb") as out_f:
                for chapter in part_chapters:
                    paragraphs = [
                        p.strip()
                        for p in chapter.content.split("\n\n")
                        if p.strip()
                    ]

                    for para in paragraphs:
                        for chunk in _split_into_chunks(para):
                            instructions = _build_narration_instructions(chunk)

                            tts_response = client.audio.speech.create(
                                model="gpt-4o-mini-tts",
                                voice=payload.voice or "coral",
                                input=chunk,
                                instructions=instructions,
                            )

                            audio_bytes = tts_response.read()

                            if audio_bytes:
                                out_f.write(audio_bytes)

            part_files.append(f"{safe_book_id}/{part_name}")

        if not part_files:
            raise HTTPException(
                status_code=500, detail="Failed to generate any audiobook parts"
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
