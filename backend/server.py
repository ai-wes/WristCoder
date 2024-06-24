import asyncio
import base64
import io
import json
import re
import logging
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from stt import audio_to_text
from model_loader import TTSModel
from llm import query_llm
import torch
from TTS.api import TTS

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    filename='C:\\Users\\wesla\\claude_assistant\\backend\\app.log',
    filemode='a',
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

app = FastAPI()

logger.info("FastAPI app initialized")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)
logger.info("CORS middleware set up")

device = "cuda:0" if torch.cuda.is_available() else "cpu"
logger.info(f"Device set to {device}")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

logger.info("TTS model initialized")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections = []
        logger.info("ConnectionManager initialized")

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        logger.info("WebSocket connection accepted")
        self.active_connections.append(websocket)
        logger.info("WebSocket connection added to active connections")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info("WebSocket connection removed from active connections")

    async def send_message(self, websocket: WebSocket, message: dict):
        await websocket.send_json(message)
        logger.info(f"Message sent to WebSocket: {message}")

manager = ConnectionManager()
logger.info("ConnectionManager instance created")

should_reset = False
logger.info("should_reset flag initialized to False")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    logger.info("Connected to WebSocket endpoint /ws")
    try:
        while True:
            message = await websocket.receive_text()
            logger.info(f"Received message: {message}")
            data = json.loads(message)
            logger.info(f"Parsed JSON message: {data}")

            if data['type'] == 'reset':
                global should_reset
                logger.info("Received reset command")
                should_reset = True
                logger.info("should_reset flag set to True")
                continue

            if data['type'] == 'audio':
                audio_bytes = base64.b64decode(data['audio'])
                logger.info(f"Received audio data, length: {len(audio_bytes)}")

                text = audio_to_text(audio_bytes)
                logger.info(f"Converted audio to text: {text}")

                await manager.send_message(websocket, {
                    'type': 'text',
                    'text': text
                })
                logger.info("Sent text message to WebSocket")

                response = await query_llm(text, session_id="tests")
                logger.info(f"Queried LLM with text: {text}, received response: {response}")
                response_string = response.content  # Assuming 'content' is the correct attribute name
                logger.info(f"Response string from LLM: {response_string}")
                await manager.send_message(websocket, {
                    'type': 'response',
                    'text': response_string
                })
                logger.info("Sent response message to WebSocket")

                # Process TTS in chunks
                chunks = re.findall(r'[^.!?]*[.!?]', response_string)
                logger.info(f"Split response string into chunks: {chunks}")
                for chunk in chunks:
                    chunk = chunk.strip()
                    logger.info(f"Processing chunk: {chunk}")
                    if chunk:
                        try:
                            logger.info(f"Generating TTS for chunk: {chunk}")
                            bytes_buffer = io.BytesIO()
                            tts.tts_to_file(
                                text=chunk,
                                speaker_wav="C:\\Users\\wesla\\claude_assistant\\backend\\voices\\nicole_kidman.wav",
                                file_path=bytes_buffer,
                                speed=1.5,
                                temperature=0.5,
                                top_k=50,
                                top_p=0.5,
                                language="en"
                            )
                            logger.info("TTS generation complete")
                            audio_data = bytes_buffer.getvalue()
                            bytes_buffer.close()
                            logger.info(f"TTS generated for chunk: {chunk}, {len(audio_data)} bytes")

                            base64_audio = base64.b64encode(audio_data).decode('utf-8')
                            logger.info(f"Encoded audio data to base64: {base64_audio}")
                            await manager.send_message(websocket, {
                                'type': 'audio',
                                'audio': base64_audio,
                                'text': chunk
                            })
                            logger.info(f"Sent TTS audio data to websocket.\nBase64 Audio: {base64_audio}\nText: {chunk}")
                        except Exception as e:
                            logger.error(f"Error generating TTS: {e}")
    finally:
        manager.disconnect(websocket)
        logger.info("Disconnected from WebSocket")

if __name__ == "__main__":
    import uvicorn
    logger.info("Running uvicorn server")
    uvicorn.run(app, host="0.0.0.0", port=8888)
    logger.info("Uvicorn server started on host 0.0.0.0, port 8888")
