import os
from pathlib import Path
import time
from fastapi import FastAPI, UploadFile, File, Form,HTTPException
from openai import OpenAI
from fastapi.staticfiles import StaticFiles


UPLOAD_DIR=Path("uploads")
OUTPUT_DIR=Path("outputs")

UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


app = FastAPI()
client = OpenAI()

app.mount("/tts", StaticFiles(directory="outputs"), name="tts")

@app.post("/api/tts")
async def tts(audio: UploadFile= File(...), emotion: str=Form("neutral")):
    try:
        if not audio.filename:
            raise HTTPException(status_code=400,detail="Invalid audio file")

        file_path = UPLOAD_DIR/audio.filename

        with open(file_path,"wb") as buffer:
            content=await audio.read()
            buffer.write(content)
        
        transcription=client.audio.transcriptions.create(
        model="whisper-1",
        file=open(file_path,"rb")
        )
        spoken_text = transcription.text
        if not spoken_text.strip():
            raise HTTPException(status_code=400,detail="Empty transcription")
        
        

        tts_response=client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="coral",
        input=spoken_text,
        instructions=f"Speak in a {emotion} tone."
        )
        
        audio_bytes=tts_response.read()
        
        output_file=OUTPUT_DIR/ f"converted-{int(time.time())}.mp3"

        with open(output_file,"wb") as f:
            f.write(audio_bytes)
        
        return {
        "success": True,
        "file": output_file.name,
        "transcription": spoken_text
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    


