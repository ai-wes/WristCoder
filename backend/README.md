Python <3.10-3.12

http://192.168.1.224:8015

-e git+https://github.com/coqui-ai/TTS#egg=TTS[all,dev,notebooks]

ollama run deepseek-coder:33b-instruct-q6_k

set KMP_DUPLICATE_LIB_OK=TRUE

conda install pytorch torchvision torchaudio pytorch-cuda=12.1 -c pytorch -c nvidia
