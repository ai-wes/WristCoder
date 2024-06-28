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
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_message(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)

manager = ConnectionManager()

def summarize_code_execution(full_output):
    print("Full Output: ", full_output)
    response = ollama.chat(model="deepseek-coder-v2:16b-lite-instruct-q6_K", 
            messages=[
  {
    'role': 'user',
    'content': f"""BRIEFLY summarize the following code execution output. If an action was successful, BREIFLY describe the successful action concisely and offer next steps or suggestions. If an error occurs, do not give all of the error information unless asked for. Simply say there was an error, the code number, and if applicable a simple sentence describing the error 
              Please summarize the code execution output below. CODE EXECUTION OUTPUT: {full_output}
             """
    },
    ])
    print("Ollama Response: ", response['message']['content'])


async def stream_interpreter_output(message, websocket):
    interpreter_url = "http://localhost:10001/interpreter"
    async with aiohttp.ClientSession() as session:
        async with session.post(interpreter_url, json={"message": message}) as resp:
            async for line in resp.content:
                if line.startswith(b'data: '):
                    try:
                        chunk = json.loads(line[6:])
                        await process_chunk(chunk, websocket)
                    except json.JSONDecodeError as e:
                        logger.error(f"JSON decode error: {e} - Line content: {line}")
                    except Exception as e:
                        logger.error(f"Unexpected error: {e}")

async def process_chunk(chunk, websocket):
    if chunk['role'] == 'assistant':
        if chunk['type'] == 'message':
            await manager.send_message(websocket, {
                'type': 'chat',
                'text': chunk.get('content', '')
            })
        elif chunk['type'] == 'code':
            await manager.send_message(websocket, {
                'type': 'code_output',
                'text': chunk.get('content', '')
            })
    elif chunk['role'] == 'computer':
        if chunk['type'] == 'console':
            await manager.send_message(websocket, {
                'type': 'code_output',
                'text': chunk.get('content', '')
            })
        elif chunk['type'] == 'confirmation' and chunk['format'] == 'execution':
            await manager.send_message(websocket, {
                'type': 'input_required',
                'prompt': 'Run this code? (y/n):'
            })

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            data = json.loads(data)

            if data['type'] == 'text':
                user_message = data['text']
            elif data['type'] == 'audio':
                audio_data = base64.b64decode(data['audio'])
                user_message = await audio_to_text(audio_data)

            full_output = await stream_interpreter_output(user_message, websocket)

            summary = summarize_code_execution(full_output)

            await manager.send_message(websocket, {
                'type': 'chat',
                'text': summary
            })

            if summary:
                tts_chunks = re.findall(r'[^.!?]*[.!?]', summary)
                for chunk in tts_chunks:
                    chunk = chunk.strip()
                    if chunk:
                        bytes_buffer = io.BytesIO()
                        tts.tts_to_file(
                            text=chunk,
                            speaker_wav="C:\\Users\\wesla\\claude_assistant\\backend\\voices\\colin_farrell.wav",
                            file_path=bytes_buffer,
                            speed=1.6,
                            temperature=0.6,
                            top_k=50,
                            top_p=0.5,
                            language="en"
                        )
                        audio_data = bytes_buffer.getvalue()
                        bytes_buffer.close()
                        base64_audio = base64.b64encode(audio_data).decode('utf-8').rstrip('A')
                        await manager.send_message(websocket, {
                            'type': 'audio',
                            'audio': base64_audio,
                            'text': chunk
                        })

    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8888)
