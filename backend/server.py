


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
import torch
from TTS.api import TTS
from openai import OpenAI
import sseclient
import uvicorn
import websockets
from typing import List
import aiohttp
from langchain_community.llms import Ollama
from generate_interpreter_output_summary import generate_interpreter_output_summary

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
    raw_output = ""
    # Send the message over the websocket
    await manager.send_message(websocket, {
        'type': 'userMessage',
        'text': message
    })
    async with aiohttp.ClientSession() as session:
        async with session.post(interpreter_url, json={"message": message}) as resp:
            async for line in resp.content:
                if line.startswith(b'data: '):
                    chunk = json.loads(line[6:])
                    
                    # Accumulate raw output
                    raw_output += json.dumps(chunk) + "\n"
                    
                    # Send raw output to frontend if the WebSocket is still open
                    await manager.send_message(websocket, {
                        'type': 'code_output',
                        'text': json.dumps(chunk)
                    })
                    
    # After processing all chunks, summarize the output
    generated_summary = generate_interpreter_output_summary(raw_output)
        # Send the summary as a parsed message
    await manager.send_message(websocket, {
        'type': 'parsed_message',
        'text': generated_summary
    })
    await process_and_send_chunk(generated_summary, websocket)

# Text-to-Speech (TTS) Processing
async def process_and_send_chunk(generated_summary, websocket):

    # Process TTS
    tts_chunks = re.findall(r'[^.!?]+[.!?]', generated_summary)
    processed_audio = set()  # To keep track of processed audio chunks
    for chunk in tts_chunks:
        chunk = chunk.strip()
        if chunk and chunk not in processed_audio:
            logger.info(f"Processing TTS for chunk: {chunk}")
            base64_audio = await text_to_speech(chunk)
            # Send audio chunk to frontend if the WebSocket is still open
            await manager.send_message(websocket, {
                'type': 'audio',
                'audio': base64_audio,
                'text': chunk
            })
        processed_audio.add(chunk)
        logger.info("Sent audio message to WebSocket")

            
async def text_to_speech(text):
    logger.info("Converting text to speech")
    modified_text = text.rstrip('A')
    bytes_buffer = io.BytesIO()

    tts.tts_to_file(
        text=modified_text,
        speaker_wav="C:\\Users\\wesla\\claude_assistant\\backend\\voices\\colin_farrell.wav",
        file_path=bytes_buffer,
        speed=1.7,
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
