


import os
import platform
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
import ollama
import requests
import json
import asyncio
import base64
import io
import re
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from stt import audio_to_text
from generate_interpreter_output_summary import generate_interpreter_output_summary
import torch
from TTS.api import TTS
from openai import OpenAI
import sseclient
import uvicorn
import websockets
from typing import List
import aiohttp

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = "cuda:0" if torch.cuda.is_available() else "cpu"
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

class ConnectionManager:
    def __init__(self):
        self.active_connections = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)

manager = ConnectionManager()

# WebSocket Handlers
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            data = json.loads(data)
            logger.info(f"Received WebSocket message: {data}")
            if data['type'] == 'text':
                await handle_text_message(data['text'], websocket)
                logger.info("Handled text message")
            elif data['type'] == 'audio':
                await handle_audio_message(data['audio'], websocket)
                logger.info("Handled audio message")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

async def handle_text_message(text, websocket):
    logger.info(f"Received text message: {text}")
    await stream_interpreter_output(text, websocket)

async def handle_audio_message(audio_data, websocket):
    audio_data = base64.b64decode(audio_data)
    logger.info("Received audio message")
    text = await audio_to_text(audio_data)
    logger.info(f"Converted audio to text: {text}")
    await stream_interpreter_output(text, websocket)



async def stream_interpreter_output(message, websocket):
    interpreter_url = "http://localhost:10001/interpreter"
    current_message = ""
    is_message_started = False
    is_code_started = False
    code_content = ""

    async with aiohttp.ClientSession() as session:
        async with session.post(interpreter_url, json={"message": message}) as resp:
            async for line in resp.content:
                if line.startswith(b'data: '):
                    try:
                        chunk = json.loads(line[6:])
                        
                        if chunk['role'] == 'assistant':
                            if chunk['type'] == 'message':
                                if chunk.get('start', False):
                                    is_message_started = True
                                    current_message = ""
                                elif chunk.get('end', False):
                                    is_message_started = False
                                    await process_and_send_chunk(current_message.strip(), websocket)
                                    logger.info(f"Processed and sent full message: {current_message.strip()}")
                                elif is_message_started:
                                    current_message += chunk.get('content', '')
                            elif chunk['type'] == 'code':
                                if chunk.get('start', False):
                                    is_code_started = True
                                    code_content = ""
                                elif chunk.get('end', False):
                                    is_code_started = False
                                    await manager.send_message(websocket, {
                                        'type': 'code_output',
                                        'text': code_content
                                    })
                                    logger.info(f"Sent code content: {code_content}")
                                elif is_code_started:
                                    code_content += chunk.get('content', '')
                        
                        elif chunk['role'] == 'computer' and chunk['type'] in ['console', 'confirmation']:
                            await manager.send_message(websocket, {
                                'type': 'code_output',
                                'text': json.dumps(chunk)
                            })
                            logger.info(f"Sent computer output: {json.dumps(chunk)}")
                        
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON decode error: {e} - Line content: {line}")
                    except Exception as e:
                        logger.error(f"Unexpected error: {e}")
            
            # Send any remaining message after the stream ends
            if current_message:
                await process_and_send_chunk(current_message.strip(), websocket)
                logger.info(f"Processed and sent final message: {current_message.strip()}")


# Text-to-Speech (TTS) Processing
async def process_and_send_chunk(message, websocket):
    # Send text chunk to frontend
    await manager.send_message(websocket, {
        'type': 'chat',
        'text': message
    })
    logger.info(f"Sent chat message: {message}")
    # Process TTS
    tts_chunks = re.findall(r'[^.!?]+[.!?]', message)
    for chunk in tts_chunks:
        chunk = chunk.strip()
        logger.info(f"Processing TTS for chunk: {chunk}")
        if chunk:
            base64_audio = await text_to_speech(chunk)
            # Send audio chunk to frontend
            await manager.send_message(websocket, {
                'type': 'audio',
                'audio': base64_audio,
                'text': chunk
            })
            logger.info("Sent audio message to WebSocket")

async def text_to_speech(text):
    logger.info("Converting text to speech")
    bytes_buffer = io.BytesIO()
    tts.tts_to_file(
        text=text,
        speaker_wav="C:\\Users\\wesla\\claude_assistant\\backend\\voices\\jake_gyllenhaul.wav",
        file_path=bytes_buffer,
        speed=1.6,
        temperature=0.9,
        top_k=50,
        top_p=0.5,
        language="en"
    )
    logger.info("Text-to-speech conversion completed")
    audio_data = bytes_buffer.getvalue()
    bytes_buffer.close()
    logger.info("Converted audio to bytes")
    base64_audio = base64.b64encode(audio_data).decode('utf-8')
    logger.info("Sent audio to base64")
    return base64_audio
   
   
   
if __name__ == "__main__":
    import uvicorn
    logger.info("Running uvicorn server")


    uvicorn.run(app, host="0.0.0.0", port=8888)
    logger.info("Uvicorn server started on host 0.0.0.0, port 8888")
