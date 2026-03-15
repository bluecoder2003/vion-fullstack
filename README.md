# Emotion-Aware Audiobook Generator

An AI-powered system that converts book text into expressive audiobooks by detecting emotions in sentences and generating speech with appropriate narration style.

This project demonstrates a complete backend pipeline combining Natural Language Processing, Emotion Classification, and Neural Text-to-Speech synthesis.

---

## Overview

Traditional text-to-speech systems read text in a flat, monotone voice.
This project enhances narration by analyzing the emotional context of sentences before generating speech.

The system detects emotions such as joy, sadness, anger, or fear and maps them to speech styles to produce a more immersive audiobook experience.

---

## System Architecture

Text input is processed through a multi-stage AI pipeline:

Text
↓
Sentence Segmentation (spaCy)
↓
Emotion Detection (Transformer Model)
↓
Emotion → Voice Mapping
↓
Neural Text-to-Speech (Kokoro TTS)
↓
Audio Streaming / Generation
↓
Emotion-aware Audiobook Output

---

## Features

* Automatic sentence segmentation
* Transformer-based emotion detection
* Emotion-driven voice style selection
* Neural speech synthesis using Kokoro TTS
* Real-time audio streaming via WebSockets
* FastAPI backend architecture
* Local inference (no GPU required)

---

## Tech Stack

**Backend**

* Python
* FastAPI
* WebSockets

**AI / NLP**

* spaCy
* HuggingFace Transformers
* Emotion Classification Models

**Speech Synthesis**

* Kokoro Neural TTS

**Audio Processing**

* NumPy
* SciPy
* SoundFile

---

## Installation

Clone the repository

```bash
git clone https://github.com/yourusername/emotion-audiobook-generator.git
cd emotion-audiobook-generator
```

Create a virtual environment

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies

```bash
pip install fastapi uvicorn spacy transformers torch numpy scipy soundfile websockets
```

Download spaCy model

```bash
python -m spacy download en_core_web_sm
```

---

## Running the Server

Start the FastAPI backend:

```bash
uvicorn main:app --reload
```

The server will run at:

```
http://127.0.0.1:8000
```

WebSocket endpoint:

```
ws://127.0.0.1:8000/stream
```

---

## Running the Client

To test the audio streaming pipeline:

```bash
python test_client.py
```

This will:

1. Send text to the WebSocket server
2. Receive generated speech audio
3. Save the output as

```
streamed_audio.wav
```

---

## Example Input

```
The wind blew softly across the forest as the sun slowly began to rise.
Suddenly the door slammed open.
Run! Run for your life!
```

The system analyzes emotional tone and adjusts the speech output accordingly.

---

## Project Structure

```
audiobooks/
│
├── main.py            # FastAPI backend and WebSocket streaming
├── test_client.py     # WebSocket test client
├── kokoro_test.py     # Local TTS testing
├── speech.wav         # Sample generated audio
├── streamed_audio.wav # Streamed output audio
├── venv/              # Python virtual environment
└── README.md
```

---

## Future Improvements

* Character voice detection for dialogue
* Emotion-aware background music
* Dynamic speech prosody control
* Multi-speaker narration
* Real-time audiobook generation
* Web-based user interface

---


## License

This project is intended for academic and research purposes.
