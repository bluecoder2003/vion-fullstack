# Vion Backend — Viva Guide

> Date: 2026-07-09 | Focus: How the backend works, why decisions were made, and how to explain it in a viva.

---

## 1. Tech Stack

| Technology | Role |
|-----------|------|
| **FastAPI** | Python web framework — handles all HTTP and WebSocket routes |
| **Uvicorn** | ASGI server that runs FastAPI |
| **Kokoro-82M** | The TTS (text-to-speech) model — converts text to audio |
| **spaCy (`en_core_web_sm`)** | NLP library — tokenises sentences into words for timestamps |
| **DistilRoBERTa** (HuggingFace Transformers) | Emotion classification model — detects emotion per sentence |
| **PyTorch** | Runs the Kokoro model on CPU |
| **NumPy** | Audio array manipulation (concatenation, normalisation) |
| **Python `wave`** | Writes PCM audio data into WAV file format |
| **python-dotenv** | Loads API keys from `.env` file |
| **pydantic** | Validates incoming request bodies |

---

## 2. The Three AI Models — and why each one exists

The backend runs three separate AI models in a pipeline for every sentence.

### Model 1 — Emotion Classifier (`j-hartmann/emotion-english-distilroberta-base`)

Before synthesising audio for a sentence, the backend classifies its emotion. It uses a DistilRoBERTa model fine-tuned for 6-class emotion detection:

`joy → anger → sadness → fear → surprise → neutral`

**Why:** Different emotions should sound different. A sentence about grief should not sound the same as a shout of anger. This model tells the system which voice to pick.

**Speed:** Under 50ms per sentence on CPU. It's a "distilled" model — much smaller and faster than full RoBERTa, with similar accuracy.

### Model 2 — Kokoro-82M TTS (`hexgrad/Kokoro-82M`)

This converts the sentence text into a raw audio waveform.

**Why Kokoro specifically:** It is an open-source, Apache 2.0 licensed, 82-million-parameter flow-matching model. It runs entirely locally — no API key, no cloud call, no cost. Its real-time factor (RTF) on CPU is **0.2–0.4**, meaning it generates 1 second of audio in only 0.2–0.4 seconds — 2.5 to 5 times faster than real-time.

**Output:** 24,000 Hz mono audio as a NumPy float32 array.

### Model 3 — spaCy (`en_core_web_sm`)

After the WAV is generated, spaCy tokenises the original sentence into individual words. Each word's character position within the sentence is used to estimate when that word is spoken in the audio (by proportional mapping to the audio duration).

**Why:** This produces the `.timestamps.json` sidecar file — enabling word-level karaoke highlighting in the frontend.

### Caching — all three models loaded only once

All three models use Python's `@lru_cache(maxsize=1)`:

```python
@lru_cache(maxsize=1)
def _get_kokoro_pipeline(): ...

@lru_cache(maxsize=1)
def _get_spacy_nlp(): ...

@lru_cache(maxsize=1)
def _get_emotion_classifier(): ...
```

The first request to the backend loads all three models into RAM. Every request after that gets the cached instance instantly — **0ms model loading time**. This is critical because loading ML models takes seconds; you cannot afford to do it per request.

---

## 3. The Sentence Splitting Engine (SBD)

**File:** `scene_demo_tts.py` — `split_sentences()`

Before any audio is generated, text is split into sentences. A naive splitter would just split on every `.` — which breaks on:
- `Mr. Smith` → wrongly split into two sentences
- `J. F. Kennedy` → wrongly split into three sentences
- `3.14` → wrongly split at the decimal

The backend uses a **rule-based Sentence Boundary Disambiguation (SBD)** engine with three rules:

**Rule 1 — Abbreviations:** A period does NOT end a sentence if the word before it is in the protected list of 31 abbreviations:
`mr, mrs, ms, dr, prof, sr, jr, vs, etc, eg, ie, al, col, gen, lt, capt, sgt, st, ave, rd, jan, feb, mar, apr, jun, jul, aug, sep, oct, nov, dec`

**Rule 2 — Single-letter initials:** A period does NOT end a sentence if the preceding "word" is a single uppercase letter (like `J.` or `F.` in a name).

**Rule 3 — Decimals:** A period does NOT end a sentence if the character immediately following it is a digit.

**The same logic is ported identically to TypeScript in the frontend** (`audioUtils.ts` → `splitSentences()`). This parity is critical — if the two sides disagree on where a sentence boundary is, the `data-sentence-idx` attributes in the HTML won't match the audio cues, breaking synchronisation.

---

## 4. The Voice Selection System

For each sentence, the backend chooses one of three Kokoro voices based on emotion + context:

| Voice | Character |
|-------|-----------|
| `af_heart` | Default narrator — warm, steady |
| `af_bella` | Lighter, expressive — joy, questions, gentle dialogue |
| `af_nicole` | Stronger, dramatic — anger, exclamations |

**Step 1 — Emotion detection:** Run the DistilRoBERTa classifier on the sentence text.

**Step 2 — Context detection:** Check whether the sentence is dialogue (starts/ends with quotes), a question (ends with `?`), an exclamation (`!`), or specific dialogue patterns like "my dear", "said his lady", "returned she" (→ `gentle_dialogue`).

**Step 3 — Voice assignment:**
```
gentle_dialogue → af_bella
question        → af_bella
exclamation     → af_nicole
dialogue + anger   → af_nicole
dialogue + other   → af_bella
narration + joy    → af_bella
narration + anger  → af_nicole
everything else    → af_heart
```

**Why 16 voice aliases exist:** The system also accepts OpenAI-style voice names (`nova`, `shimmer`, `alloy`, `coral`, `sage`, etc.) and maps them to the nearest Kokoro voice. This means the frontend can request any OpenAI voice name and the backend handles it gracefully.

---

## 5. The Audiobook Generation Job Pipeline

This is the core of the backend. When the frontend sends `POST /api/audiobook`:

### Step 1 — Preview selection

The backend does NOT generate the entire book. It selects only a **preview** — the first 4 pages or up to **12,000 characters** — whichever comes first. This is the `_select_preview_chapters()` function.

Why a preview? Generating a full audiobook could take hours. The preview gives users 16 minutes of audio (~2,400 words) which is enough to evaluate the book without blocking the server for a long time.

### Step 2 — Content cleaning

Before splitting into audio chunks, the chapter text is cleaned:
- `[Illustration: ...]` markers removed (regex)
- `[Frontispiece: ...]` markers removed
- `[Image: ...]` markers removed
- `[Cover Art]` markers removed
- Underscore characters removed (Gutenberg italic formatting)

### Step 3 — Special paragraph filtering

Each paragraph is checked by `is_special_paragraph()`. Paragraphs that pass are skipped (not synthesised):
- Empty or whitespace-only
- Illustration/frontispiece/image/cover art markers
- Page number markers like `[Page 42]`
- Dividers like `* * *` or `---`

### Step 4 — Paragraph grouping

Individual paragraphs are grouped into chunks before synthesis to avoid creating hundreds of tiny WAV files (which would cause gaps during playback). Grouping rules:
- Minimum chunk size: **400 characters**
- Maximum chunk size: **1,000 characters** (2.5× the minimum)

Once a group reaches the minimum, the next paragraph starts a new group. If adding a paragraph would exceed the maximum, a new group starts immediately.

### Step 5 — Per-chunk synthesis

For each grouped chunk, `write_emotional_wav_file_with_timestamps(para, output_file)` is called. This function:

1. Splits the chunk into sentences using the SBD engine
2. For each sentence:
   - Runs the emotion classifier
   - Selects a voice
   - Calls Kokoro to generate a NumPy audio array
3. Concatenates all sentence arrays
4. Inserts **180ms of silence** between each sentence (using `np.zeros`)
5. Normalises audio: clips to `[-1.0, 1.0]`, converts to 16-bit integers (`×32767`)
6. Writes a `.wav` file: 24,000 Hz, mono, 16-bit PCM
7. Runs spaCy on each sentence to get word tokens → maps character positions to timestamps → writes `.wav.timestamps.json` sidecar

### Step 6 — Streaming delivery

As soon as each chunk is written to disk, its filename is added to `jobs_db[job_id]["ready_files"]`. The frontend polling every 2,500ms picks this up immediately. The user hears the first chunk **within 10–16 seconds** of pressing play, while the rest is still generating in the background.

### Step 7 — Completion

When all chunks are processed, `jobs_db[job_id]["status"]` is set to `"complete"`. The frontend stops polling.

---

## 6. Caching — Why the Same Book Never Gets Re-generated

Before synthesising each paragraph chunk:

```python
if not output_file.exists():
    write_emotional_wav_file_with_timestamps(para, output_file)
```

If the WAV file already exists on disk — synthesis is skipped entirely. The file is immediately added to `ready_files` at 0ms cost.

**What this means in practice:**
- User opens the same book a second time → instant playback, no waiting
- Server restarts mid-generation → already-completed chunks are recovered from disk and served immediately
- Only truly new paragraphs (or changed content) ever get synthesised

The file naming convention `chapter-{id}-part-{index:04d}.wav` ensures each paragraph chunk has a unique, deterministic filename tied to both the chapter and its position.

---

## 7. Job Management — In-Memory Database

The backend uses a simple Python dictionary `jobs_db` as an in-memory store:

```python
jobs_db[job_id] = {
    "status": "processing",
    "safe_book_id": safe_book_id,
    "ready_files": [],
    "total": total_parts,
    "error": None
}
```

**Why not a real database?** This is a single-user local application. SQLite or Postgres would add complexity with no benefit.

**Duplicate job prevention:** Before creating a new job, the backend checks if an active job for the same `safe_book_id` already exists. If it does, it returns the existing job ID instead of starting a duplicate — preventing the CPU from being hit twice for the same book.

**Job cancellation:** The frontend can send `POST /api/audiobook/{job_id}/cancel`. The background thread checks `jobs_db[job_id]["status"]` before each paragraph and stops immediately if it sees `"cancelled"`. The frontend sends this with `keepalive: true` so the cancel request reaches the backend even if the browser tab is closed.

---

## 8. Audio Format — Why These Numbers

| Spec | Value | Why |
|------|-------|-----|
| Sample rate | 24,000 Hz | Kokoro's native output rate; broadcast quality (above phone quality of 8kHz, efficient vs CD quality 44.1kHz) |
| Bit depth | 16-bit PCM | Standard for voice; 2 bytes per sample |
| Channels | Mono | Voice narration is always mono; stereo would double file size with no benefit |
| Sentence gap | 180ms | Natural pause between sentences; not so long it sounds robotic |
| PyTorch threads | 4 | Set via `torch.set_num_threads(4)` — prevents Kokoro from consuming all CPU cores and starving other processes |

**WAV vs MP3:** Raw WAV is used for generated audio because WAV requires no encoding/decoding step. Speed matters more than file size here. The ambient loop files (delivered to the frontend separately) are MP3 because those are static assets where load time matters.

---

## 9. The WebSocket Streaming Endpoint

`/stream` (WebSocket) — for real-time single-sentence TTS, used in the Scene Demo page.

Flow:
1. Frontend opens a WebSocket connection
2. Sends a single text string
3. Backend calls `generate_emotional_wav_chunks(text)` — splits into sentences, synthesises each one individually
4. Each sentence's WAV bytes are sent back immediately as they're generated (`ws.send_bytes(chunk)`)
5. When all sentences are done, the backend sends the string `"END"` to signal completion
6. Connection is closed

This is different from the audiobook endpoint which uses HTTP polling. WebSocket is used here because the scene demo needs sub-second latency for individual sentences, while the full audiobook pipeline is designed for background batch processing.

---

## 10. The Scene Demo TTS Endpoint

`POST /api/scene-demo/tts` — generates audio for a single sentence with a specific voice and optional instructions. Used for the voice demonstration page.

**Caching by content hash:** The output file is named using a SHA-1 hash of `voice + instructions + text`. If the exact same text+voice+instructions combination has been requested before, the cached file is returned instantly without re-synthesis.

```python
digest = hashlib.sha1(
    f"{safe_voice}\n{payload.instructions or ''}\n{text}".encode("utf-8")
).hexdigest()
```

---

## 11. The Word Timestamp System

`GET /api/word-timestamps/{filename}` — serves the `.timestamps.json` sidecar for a generated WAV.

The sidecar file format is an array of word objects:
```json
[
  { "word": "It",  "start": 0.0,  "end": 0.12 },
  { "word": "was", "start": 0.13, "end": 0.28 },
  ...
]
```

**How timestamps are calculated:**

For each sentence in the chunk:
1. Generate the WAV, measure its exact duration by reading `n_frames / sample_rate` from the wave header
2. Run spaCy on the sentence to get tokens (words) with their character positions
3. Map each word's position proportionally to the audio duration:
   ```
   word_start = sentence_start_time + (char_position / sentence_length) × sentence_duration
   ```
4. Accumulate `current_time` across sentences, adding 180ms for each inter-sentence gap

This is an approximation (speech rate isn't perfectly uniform) but it is accurate enough for smooth karaoke highlighting. When the JSON exists, the frontend uses it. When it doesn't (e.g. for LibriVox recordings), the frontend falls back to its own estimation algorithm.

---

## 12. CORS and Middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`allow_origins=["*"]` permits the frontend (running on `localhost:3000`) to call the backend (running on `localhost:8000`) without being blocked by the browser's Same-Origin Policy. In production this would be restricted to the specific frontend domain.

---

## 13. One-line Answers to Common Viva Questions

**Q: Why FastAPI over Flask or Django?**
FastAPI is async-native, has automatic Pydantic validation, generates OpenAPI docs automatically, and is significantly faster. `BackgroundTasks` lets the audiobook job run without blocking the HTTP response.

**Q: Why does the backend use BackgroundTasks instead of threading or Celery?**
`BackgroundTasks` is built into FastAPI — no external broker, no Redis, no worker process. For a single-user local app it's perfectly sufficient and keeps the setup simple.

**Q: Why split text into paragraph chunks instead of generating one WAV per chapter?**
One giant WAV per chapter would take minutes before the user hears anything. Chunks of 400–1,000 chars produce 32–80 seconds of audio each, generated in 10–40 seconds. The user starts listening to chunk 1 while chunks 2, 3, etc. are still being made.

**Q: Why normalise the audio to 16-bit integers?**
Kokoro outputs float32 in the range `[-1.0, 1.0]`. The WAV format with `setsampwidth(2)` expects 16-bit signed integers `[-32768, 32767]`. Multiplying by 32767 and casting achieves this conversion. The `np.clip` before multiplication prevents clipping artefacts if any sample exceeds `±1.0`.

**Q: What happens if the emotion classifier fails for a sentence?**
The `detect_emotion()` function wraps the classifier call in a `try/except`. Any error returns `"neutral"` — so synthesis always continues with the default voice.

**Q: What is the `safe_book_id`?**
The book ID from the frontend can contain special characters. `safe_book_id` replaces everything that isn't alphanumeric, a hyphen, or an underscore with `_`. This makes it safe to use as a directory name on the filesystem.

**Q: How does the backend know which paragraphs go into which WAV file?**
The filename pattern `chapter-{chapter_id}-part-{index:04d}.wav` encodes both the chapter and the paragraph group index. The frontend parses this pattern from the URL using a regex: `/chapter-(.+?)-part-(\d+)\.wav/i`.

**Q: Why does the backend send the paragraph structure back in the `/api/audiobook` response?**
The frontend needs to know the exact sentence boundaries for each chapter — so it can map `audioSentenceIndex` values to DOM spans. The backend's SBD parser runs first, and it sends the results (`paragraphs[]` with `sentences[]`) back to the frontend so both sides work from the same sentence split.
