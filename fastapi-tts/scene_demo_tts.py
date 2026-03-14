import hashlib
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from openai import OpenAI
from pydantic import BaseModel


class SceneDemoTtsRequest(BaseModel):
    text: str
    voice: str = "coral"
    instructions: Optional[str] = None


def create_scene_demo_router(client: OpenAI, output_dir: Path) -> APIRouter:
    router = APIRouter()
    scene_demo_dir = output_dir / "scene-demo"
    scene_demo_dir.mkdir(exist_ok=True)

    @router.post("/api/scene-demo/tts")
    async def generate_scene_demo_tts(payload: SceneDemoTtsRequest):
        text = payload.text.strip()
        if not text:
          raise HTTPException(status_code=400, detail="Text is required")

        safe_voice = "".join(
            c if c.isalnum() or c in ("-", "_") else "_"
            for c in (payload.voice or "coral")
        ) or "coral"

        voice_dir = scene_demo_dir / safe_voice
        voice_dir.mkdir(exist_ok=True)

        digest = hashlib.sha1(
            f"{safe_voice}\n{payload.instructions or ''}\n{text}".encode("utf-8")
        ).hexdigest()
        filename = f"{digest}.mp3"
        output_file = voice_dir / filename

        if not output_file.exists():
            try:
                tts_response = client.audio.speech.create(
                    model="gpt-4o-mini-tts",
                    voice=safe_voice,
                    input=text,
                    instructions=payload.instructions
                    or "Narrate this literary passage clearly and expressively.",
                )

                audio_bytes = tts_response.read()
                if not audio_bytes:
                    raise HTTPException(status_code=500, detail="No audio returned")

                with open(output_file, "wb") as f:
                    f.write(audio_bytes)
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        return {
            "success": True,
            "file": f"scene-demo/{safe_voice}/{filename}",
            "url": f"/tts/scene-demo/{safe_voice}/{filename}",
            "voice": safe_voice,
        }

    return router
