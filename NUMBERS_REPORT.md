# Vion Fullstack — Numbers & Metrics Report

> Generated: 2026-07-09 | Branch: `feature/audio-instant-playback`  
> Purpose: Quantitative data summary for presentation/examination reference

---

## 1. Codebase Size

| Metric | Value |
|--------|-------|
| Frontend TypeScript source files (`.tsx`) | **26** |
| Frontend TypeScript utility files (`.ts`) | **11** |
| Frontend total source lines (`.tsx` + `.ts`) | **11,910** |
| Backend Python source files (`.py`) | **3** |
| Backend total Python lines | **1,408** |
| Total project source lines (frontend + backend) | **~13,318** |
| Git commits (total history) | **35** |

### Largest Frontend Files (lines)

| File | Lines |
|------|-------|
| `SceneDemoPage.tsx` | 1,893 |
| `ambientSounds.ts` | 1,306 |
| `AudiobookPlayer.tsx` | 1,005 |
| `LibraryPage.tsx` | 987 |
| `ReaderContent.tsx` | 891 |
| `VoiceRecorder.tsx` | 823 |
| `musicEngine.ts` | 523 |
| `MusicPlayer.tsx` | 450 |
| `openaiTtsApi.ts` | 411 |
| `DemoBookPlayer.tsx` | 340 |

### Backend Files (lines)

| File | Lines |
|------|-------|
| `main.py` | 623 |
| `scene_demo_tts.py` | 492 |
| `download_and_generate_references.py` | 293 |

---

## 2. Book Reference Data

### Frankenstein (Full Book — Raw Chapters)

| Metric | Value |
|--------|-------|
| Total chapters | **28** |
| Total word count | **74,975 words** |
| Total character count | **418,783 chars** |
| Average words per chapter | **~2,678 words** |
| Smallest chapter | 300 words (ch-2, page 3) |
| Largest chapter | 8,239 words (ch-27, page 28) |
| Average chars per chapter | ~14,956 |

### Frankenstein — Chapter Word Counts

| Chapter | Words | Chars | Page |
|---------|-------|-------|------|
| ch-0 | 1,200 | 6,848 | 1 |
| ch-1 | 1,311 | 7,358 | 2 |
| ch-2 | 300 | 1,707 | 3 |
| ch-3 | 2,730 | 15,185 | 4 |
| ch-4 | 1,766 | 10,154 | 5 |
| ch-5 | 2,206 | 12,706 | 6 |
| ch-6 | 2,675 | 15,271 | 7 |
| ch-7 | 2,535 | 14,428 | 8 |
| ch-8 | 2,357 | 12,990 | 9 |
| ch-9 | 2,718 | 15,511 | 10 |
| ch-10 | 3,560 | 19,853 | 11 |
| ch-11 | 3,093 | 17,270 | 12 |
| ch-12 | 2,212 | 12,440 | 13 |
| ch-13 | 2,359 | 12,998 | 14 |
| ch-14 | 2,907 | 15,922 | 15 |
| ch-15 | 2,070 | 11,983 | 16 |
| ch-16 | 2,032 | 11,579 | 17 |
| ch-17 | 1,854 | 10,445 | 18 |
| ch-18 | 3,013 | 17,133 | 19 |
| ch-19 | 3,199 | 17,551 | 20 |
| ch-20 | 1,917 | 10,255 | 21 |
| ch-21 | 2,844 | 16,175 | 22 |
| ch-22 | 2,611 | 14,816 | 23 |
| ch-23 | 3,521 | 19,035 | 24 |
| ch-24 | 3,738 | 20,454 | 25 |
| ch-25 | 3,414 | 19,035 | 26 |
| ch-26 | 2,594 | 14,041 | 27 |
| ch-27 | 8,239 | 45,640 | 28 |

### Frankenstein — Parsed Structure (5-chapter preview subset)

| Metric | Value |
|--------|-------|
| Chapters parsed | **5** |
| Total paragraphs | **87** |
| Total sentences | **324** |
| Total words in sentences | **7,311** |
| Average sentences per paragraph | **~3.7** |
| Average words per sentence | **~22.6** |
| First chapter paragraphs | **14** |

---

### Alice's Adventures in Wonderland (Full Book — Raw Chapters)

| Metric | Value |
|--------|-------|
| Total chapters | **13** |
| Total word count | **26,525 words** |
| Total character count | **144,539 chars** |
| Average words per chapter | **~2,040 words** |
| Smallest chapter | 84 words (preface) |
| Largest chapter | 2,616 words (ch-3) |

### Alice in Wonderland — Chapter Word Counts

| Chapter | Words | Chars | Page |
|---------|-------|-------|------|
| preface | 84 | 579 | 1 |
| ch-0 | 2,186 | 11,551 | 2 |
| ch-1 | 2,099 | 10,953 | 3 |
| ch-2 | 1,702 | 9,261 | 4 |
| ch-3 | 2,616 | 13,884 | 5 |
| ch-4 | 2,186 | 12,011 | 6 |
| ch-5 | 2,593 | 13,844 | 7 |
| ch-6 | 2,287 | 12,703 | 8 |
| ch-7 | 2,487 | 13,670 | 9 |
| ch-8 | 2,272 | 12,631 | 10 |
| ch-9 | 2,030 | 11,411 | 11 |
| ch-10 | 1,878 | 10,387 | 12 |
| ch-11 | 2,105 | 11,654 | 13 |

### Alice in Wonderland — Parsed Structure (5-chapter preview subset)

| Metric | Value |
|--------|-------|
| Chapters parsed | **5** |
| Total paragraphs | **156** |
| Total sentences | **497** |
| Total words in sentences | **8,701** |
| Average sentences per paragraph | **~3.2** |
| Average words per sentence | **~17.5** |

---

## 3. Audio Generation Pipeline Parameters

### TTS (Text-to-Speech) — Backend

| Parameter | Value |
|-----------|-------|
| TTS model | **Kokoro-82M** (hexgrad/Kokoro-82M) |
| Audio sample rate | **24,000 Hz** |
| Audio bit depth | **16-bit PCM** |
| Audio channels | **Mono (1 channel)** |
| WAV sample width | **2 bytes** |
| Sentence inter-gap (pause) | **180 ms** |
| PyTorch CPU threads | **4** |
| Active voices | **3** (`af_heart`, `af_bella`, `af_nicole`) |
| Voice alias mappings | **16** total aliases |
| Emotion categories | **6** (joy, anger, sadness, fear, surprise, neutral) |

### Audiobook Generation Limits

| Parameter | Value |
|-----------|-------|
| Preview page count | **4 pages** |
| Preview character budget | **12,000 chars (~2,400 words)** |
| Minimum paragraph group size | **400 chars** |
| Maximum paragraph group size | **1,000 chars** (2.5× minimum) |
| Minimum chars for trimming to carry over | **120 chars** |
| Frontend poll interval | **2,500 ms** |

### TTS Throughput Estimates

> Based on the parsed book data: average chapter ~2,678 words, ~15,000 chars. The system previews up to 12,000 chars per session.

| Metric | Approximate Value |
|--------|------------------|
| Words per preview session | ~2,400 words (12,000 chars ÷ 5 chars/word) |
| Pages covered per preview | 4 pages |
| Average words per page | ~600 words |
| Chars per page (average) | ~3,000 chars |
| Sentences per 400-char paragraph chunk | ~3–5 sentences |

---

## 4. Ambient Soundscape Engine

### Scene Coverage

| Category | Count |
|----------|-------|
| Total scene types (incl. silence) | **13** |
| Playable ambient scenes | **12** |
| File-backed scenes (MP3 loops) | **10** |
| Procedural-only scenes (Web Audio API) | **2** (morning, nature) |
| Keyword detection rules | **12** |

### Scene Volume Normalisation

| Scene | Volume Multiplier |
|-------|-----------------|
| indoor | 1.00 |
| snow | 0.95 |
| night | 0.90 |
| morning | 0.85 |
| fire | 0.85 |
| ocean | 0.80 |
| river | 0.80 |
| nature | 0.80 |
| rain | 0.75 |
| wind | 0.70 |
| city | 0.65 |
| storm | 0.60 |
| silence | 0.00 |

### Transition & Hysteresis Parameters

| Parameter | Value |
|-----------|-------|
| Scene crossfade duration | **2.5 seconds** |
| Narration duck amount | **45% reduction** (gain: 0.55) |
| Narration duck duration | **1.0 second** |
| Duck attack time constant | **0.15 seconds** |
| Duck recovery time constant | **0.3 seconds** |
| Hysteresis vote threshold | **2 consecutive votes** |
| Hysteresis history window | **6 detections** |
| Context window size | **9 sentences** |
| Context window look-behind | **5–6 sentences (60%)** |
| Context window look-ahead | **3–4 sentences (40%)** |
| Secondary scene blend minimum ratio | **40% of primary score** |
| Secondary scene max blend | **0.5 (50%)** |

---

## 5. Audio Loop Assets

### Compressed MP3 Loop Files

| File | Size (bytes) | Size (KB) |
|------|-------------|-----------|
| `city.mp3` | 960,813 | 938 KB |
| `night.mp3` | 721,197 | 704 KB |
| `ocean.mp3` | 721,023 | 704 KB |
| `storm.mp3` | 720,813 | 704 KB |
| `fire.mp3` | 480,813 | 470 KB |
| `rain.mp3` | 481,115 | 470 KB |
| `room.mp3` | 481,197 | 470 KB |
| `river.mp3` | 306,408 | 299 KB |
| `wind.mp3` | 273,453 | 267 KB |
| `snow.mp3` | 194,733 | 190 KB |
| **Total** | **5,341,565** | **~5.1 MB** |

### Compression Stats

| Metric | Value |
|--------|-------|
| Original size (before compression) | **26.2 MB** |
| Compressed size | **5.4 MB** |
| Size reduction | **~80%** |
| Loop duration range | **30–60 seconds** |
| Encoding bitrate | **128 kbps stereo** |
| Tool used | **ffmpeg** (with crossfade overlap) |

---

## 6. Sentence Boundary Detection (SBD)

### Rule-Based Parser (Python + TypeScript parity)

| Metric | Value |
|--------|-------|
| Protected abbreviations | **31** |
| Abbreviation examples | mr, mrs, ms, dr, prof, sr, jr, vs, etc, eg, ie, al, col, gen, lt, capt, sgt, st, ave, rd, jan–dec |
| Rules implemented | **3** (abbreviations, initials, decimals) |
| Regex rules for special paragraphs | **7** patterns |
| Language parity | **Yes** — identical logic in Python & TypeScript |

### Special Paragraph Filters

| Pattern | Purpose |
|---------|---------|
| `[Illustration\b...]` | Skip image captions |
| `[Frontispiece\b...]` | Skip front matter images |
| `[Image\b...]` | Skip inline images |
| `[Cover Art]` | Skip cover art |
| `[Page \d+]` | Skip page numbers |
| `* * *` or `---` | Skip dividers |
| Empty / whitespace | Skip blank paragraphs |

---

## 7. Voice & Emotion Selection

### Emotion → Voice Mapping

| Emotion | Voice |
|---------|-------|
| joy | `af_bella` |
| anger | `af_nicole` |
| sadness | `af_heart` |
| fear | `af_heart` |
| surprise | `af_bella` |
| neutral | `af_heart` |

### Context → Voice Mapping

| Context | Voice |
|---------|-------|
| gentle_dialogue | `af_bella` |
| question | `af_bella` |
| exclamation | `af_nicole` |
| dialogue (anger) | `af_nicole` |
| dialogue (surprise/other) | `af_bella` |
| narration (joy/surprise) | `af_bella` |
| narration (anger) | `af_nicole` |
| narration (default) | `af_heart` |

### Emotion Model

| Detail | Value |
|--------|-------|
| Model | `j-hartmann/emotion-english-distilroberta-base` |
| Hosted via | HuggingFace `transformers` pipeline |
| Task | `text-classification` |

---

## 8. Frontend Architecture

### Dependencies

| Type | Count |
|------|-------|
| Production dependencies | **16** |
| Dev dependencies | **6** |

### Key Libraries

| Library | Purpose |
|---------|---------|
| `next` | React framework |
| `epubjs` | EPUB parsing |
| `pdfjs-dist` | PDF parsing |
| `lucide-react` | Icons |
| `motion` | Animations |
| `sonner` | Notifications |
| `@radix-ui/*` | Headless UI primitives |

### Reader Themes

| Theme Name (code) | Display |
|------------------|---------|
| `original` | Default |
| `quiet` | Quiet |
| `paper` | Paper |
| `bold` | Bold |
| `calm` | Calm |
| `focus` | Focus |

Total themes: **6**

---

## 9. Archive.org Integration

| Parameter | Value |
|-----------|-------|
| Default search results per page | **20** |
| Max search results fetched | 20 (configurable via `rows=`) |
| Cover fallback results limit | **3** |
| Minimum book file size | **10,000 bytes (10 KB)** |
| Minimum image file size | **5,000 bytes (5 KB)** |
| OpenLibrary cover lookup limit | **1** result |

---

## 10. Sample / Demo Books

### Frankenstein Demo Book (sampleBook.ts)

| Metric | Value |
|--------|-------|
| Total demo chapters | **24** |
| Total pages simulated | **84** |
| Source text | Letters 1–4 + Chapters 1–2 (from Mary Shelley) |
| Start page | 1 |
| End page | 84 |

### Soundscape Demo Book ("Atmospheric Journeys")

| Metric | Value |
|--------|-------|
| Author | Antigravity AI |
| Total chapters (poems) | **5** |
| Total pages | **5** |
| Chapter I | Hearth and Tempest (fire → storm) |
| Chapter II | Echoes of the Sea (ocean → wind) |
| Chapter III | Forest Dawn (morning → nature) |
| Chapter IV | Flowing Waters (river → rain) |
| Chapter V | City Night (city → night) |
| Words per poem | ~65–66 words |
| Total soundscape demo words | ~326 words |

---

## 11. Backend API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/audiobook` | `POST` | Start audiobook generation job |
| `/api/audiobook/{job_id}/status` | `GET` | Poll job progress |
| `/api/audiobook/{job_id}/cancel` | `POST` | Cancel active job |
| `/api/word-timestamps/{filename}` | `GET` | Fetch word-level timestamps |
| `/api/scene-demo/tts` | `POST` | Single-sentence TTS for demo |
| `/stream` | `WebSocket` | Real-time audio stream |
| `/tts/*` | `StaticFiles` | Serve generated WAV files |

Total API endpoints: **7**

---

## 12. Word Timestamp / Karaoke Sync

| Parameter | Value |
|-----------|-------|
| Timing method | spaCy token character offsets → proportional mapping |
| Whisper alignment window | ±5 word lookahead |
| Estimation weight: base per sentence | **8 units** |
| Estimation weight: per word | **1.35 units** |
| Estimation weight: per punctuation pause | **1.75 units** |
| Word-level character weight | char count + 3 |
| Punctuation extra weight | +4 units |

---

## 13. Key Numbers Summary (Quick Reference)

| Item | Number |
|------|--------|
| Total source lines | ~13,318 |
| Total git commits | 35 |
| Frankenstein total words | 74,975 |
| Frankenstein total chapters | 28 |
| Frankenstein avg words/page | ~2,678 |
| Alice total words | 26,525 |
| Alice total chapters | 13 |
| Audio preview budget | 12,000 chars / ~2,400 words |
| Preview covers | 4 pages |
| TTS sample rate | 24,000 Hz |
| Sentence gap | 180 ms |
| Ambient scenes | 12 playable |
| Audio files (loops) | 10 MP3s |
| Loop total size | ~5.1 MB (80% reduction from 26.2 MB) |
| Ambient crossfade | 2.5 seconds |
| Narration duck | 45% for 1 second |
| SBD abbreviations | 31 |
| Kokoro voices | 3 |
| Emotion classes | 6 |
| Reader themes | 6 |
| Frontend dependencies | 16 prod + 6 dev |
| Backend dependencies | 15 (pyproject.toml) |
| API endpoints | 7 |
| Poll interval | 2,500 ms |
| PyTorch threads | 4 |
