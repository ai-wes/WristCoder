# utils/tts/model_loader.py

from TTS.api import TTS
import torch

class TTSModel:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            cls._instance = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        return cls._instance
