# Emotion-Aware Audiobook Generation System

An **AI-powered full-stack system** that converts written books into
expressive audiobooks by analyzing the emotional tone of sentences and
generating narration with appropriate speech styles.

The system combines **Natural Language Processing, Emotion Detection,
Neural Text-to-Speech, and an Interactive Reading Interface** to create
a dynamic audiobook experience where narration and text stay
synchronized.

------------------------------------------------------------------------

# Project Overview

Traditional text-to-speech systems typically produce flat and monotone
narration.

This project enhances the audiobook experience by:

1.  Detecting the emotional tone of each sentence.
2.  Mapping emotions to narration styles.
3.  Generating expressive speech using neural text-to-speech.
4.  Synchronizing the generated audio with an interactive book reader.

The result is a **reading interface where the audiobook narration
dynamically follows the emotional flow of the text while highlighting
the corresponding sentences in the UI**.

------------------------------------------------------------------------

# System Architecture

## AI Backend Pipeline

Book Text\
↓\
Sentence Segmentation (spaCy)\
↓\
Emotion Detection (A Hugging Face emotion classifier (j-hartmann/emotion-english-distilroberta-base) )\
↓\
Emotion → Voice Style Mapping\
↓\
Neural Text-to-Speech (Kokoro TTS)\
↓\
Audio Generation and on the fly Streaming\
↓\
Emotion-Aware Audiobook

------------------------------------------------------------------------

## Frontend Reader Pipeline

Book Loader\
↓\
Text / EPUB Parsing\
↓\
Sentence Mapping\
↓\
Interactive Reader UI\
↓\
Audio Synchronization Engine\
↓\
Sentence Highlighting During Playback

The frontend ensures that the **currently spoken sentence is highlighted
in the reading interface**, providing an immersive audiobook reading
experience.

------------------------------------------------------------------------

# Key Features

## AI & Backend

-   Sentence segmentation using **spaCy**
-   Emotion classification using **Transformer-based models**
-   Emotion-aware speech style mapping
-   Neural speech synthesis using **Kokoro TTS**
-   Real-time audio generation and streaming
-   WebSocket-based communication for audio streaming
-   FastAPI-based backend architecture

------------------------------------------------------------------------

## Frontend Reader

-   Interactive multi-column book reading interface
-   Sentence-level highlighting synchronized with narration
-   Audiobook playback controls
-   Adjustable playback speed
-   Chapter navigation
-   Text highlighting and annotations
-   Smooth page transitions
-   Demo audiobook playback mode

------------------------------------------------------------------------

# Technology Stack

## Backend

-   Python
-   FastAPI
-   WebSockets

## AI / NLP

-   spaCy
-   HuggingFace Transformers
-   Emotion Classification Models

## Speech Synthesis

-   Kokoro Neural Text-to-Speech

## Audio Processing

-   NumPy
-   SciPy
-   SoundFile

------------------------------------------------------------------------

# Databases

## PostgreSQL

Used for storing:

-   User data
-   Book metadata
-   Reader progress
-   Highlights and bookmarks

## MongoDB

Used for storing:

-   Parsed book content
-   Sentence mappings
-   Processed text structures used for audio synchronization

This hybrid approach allows:

-   **Structured relational data** in PostgreSQL
-   **Flexible document storage** for book content in MongoDB

------------------------------------------------------------------------

# Frontend

-   React
-   TypeScript
-   TailwindCSS
-   Framer Motion
-   Lucide Icons

------------------------------------------------------------------------

# Installation

## Clone Repository

``` bash
git clone https://github.com/yourusername/emotion-audiobook-generator.git
cd emotion-audiobook-generator
```

------------------------------------------------------------------------

# Backend Setup

Create virtual environment

``` bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies

``` bash
pip install fastapi uvicorn spacy transformers torch numpy scipy soundfile websockets psycopg2 pymongo
```

Download spaCy model

``` bash
python -m spacy download en_core_web_sm
```

------------------------------------------------------------------------

# Running the Backend

``` bash
uvicorn main:app --reload
```

Server runs at:

http://127.0.0.1:8000

WebSocket endpoint:

ws://127.0.0.1:8000/stream

------------------------------------------------------------------------

# Frontend Setup

Install dependencies

``` bash
npm install
```

Run development server

``` bash
npm run dev
```

Frontend runs at:

http://localhost:3000

------------------------------------------------------------------------

# Example Input

The wind blew softly across the forest as the sun slowly began to rise.\
Suddenly the door slammed open.\
Run! Run for your life!

The system analyzes the emotional tone of each sentence and generates
narration with expressive speech styles.

------------------------------------------------------------------------

# Project Structure

project-root/

backend/ - main.py - test_client.py - kokoro_test.py

frontend/ - LibraryPage.tsx - ReaderPage.tsx - ReaderContent.tsx -
AudiobookPlayer.tsx - FrankensteinDemoPlayer.tsx - ReaderContext.tsx -
themeStyles.ts - audioUtils.ts

database/ - postgres/ - mongo/

README.md

------------------------------------------------------------------------

# Future Improvements

-   Character-specific voice synthesis
-   Dialogue detection
-   Emotion-aware background music
-   Multi-speaker narration
-   Voice cloning for characters
-   Real-time audiobook streaming
-   Mobile optimized reading interface

------------------------------------------------------------------------

# Author

Neelakshi Das\
Final Year Project -- Emotion-Aware Audiobook Generation System

------------------------------------------------------------------------

# License

This project is intended for **academic and research purposes**.
