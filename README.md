# VoiceTone — Speech to Speech

A full-stack voice-to-TTS application that records your voice, transcribes it, and speaks it back with a chosen emotional tone using OpenAI's APIs.

## How It Works

```
🎤 Record Voice ──→ FastAPI Backend ──→ Whisper (transcribe) ──→ gpt-4o-mini-tts ──→ 🔊 Emotional Audio
                     + emotion text
```

<img width="1373" height="637" alt="image" src="https://github.com/user-attachments/assets/023a0b2c-08ae-4623-ab8e-ff0de270e402" />


1. **Record** — User records voice in the browser using the MediaRecorder API
2. **Upload** — Audio file (`.webm`) and selected emotion are sent to the backend via `POST /api/tts`
3. **Transcribe** — Backend sends audio to OpenAI Whisper (`whisper-1`) to extract spoken text
4. **Generate** — Transcribed text is passed to `gpt-4o-mini-tts` with emotion instructions (e.g. *"Speak in a sad tone"*)
5. **Play** — Generated `.mp3` is returned and played in the browser

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python) |
| AI | OpenAI Whisper (STT), gpt-4o-mini-tts (TTS) |
| HTTP Client | Axios |

## Project Structure

```
/tts
├── fastapi-tts/
│   ├── main.py          # FastAPI server
│   ├── uploads/         # Temp storage for recorded audio
│   └── outputs/         # Generated TTS mp3 files
├── frontend/
│   ├── app/
│   │   ├── page.tsx     # Main UI — recorder + emotion picker
│   │   ├── layout.tsx   # Root layout + metadata
│   │   └── globals.css  # Dark theme styles
│   ├── lib/
│   │   └── types.ts     # Shared types & constants
│   └── .env             # Backend URL config
└── README.md
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- OpenAI API key

### Backend

```bash
cd fastapi-tts
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn openai python-multipart
```

Create a `.env` file or set the environment variable:

```
OPENAI_API_KEY=your_api_key_here
```

Start the server:

```bash
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
```

Configure backend URL in `.env`:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. Select an emotion — **Sad**, **Angry**, or **Excited**
2. Click the record button and speak
3. Click stop — audio is sent to the backend
4. Wait for processing (transcription + TTS generation)
5. Listen to the AI speaking your words with the selected emotion

## API

### `POST /api/tts`

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `audio` | File | Voice recording (`.webm`) |
| `emotion` | String | Emotion label (e.g. `sad`, `angry`, `excited`) |

**Response:**

```json
{
  "success": true,
  "file": "converted-1708900000.mp3",
  "transcription": "Hello, how are you?"
}
```

### `GET /tts/{filename}`

Serves the generated `.mp3` files as static assets.

