from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
import uvicorn
import logging
from interpreter import interpreter as base_interpreter

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def initialize_interpreter():
    interpreter = base_interpreter

    interpreter.system_message = """You are an AI assistant that writes markdown code snippets to answer the user's request. You speak very concisely and quickly, you say nothing irrelevant to the user's request. For example:

    User: Open the chrome app.
    Assistant: On it. 
    ```python
    import webbrowser
    webbrowser.open('https://chrome.google.com')
    ```
    User: The code you ran produced no output. Was this expected, or are we finished?
    Assistant: No further action is required; the provided snippet opens Chrome.

    You have access to TWO special functions called `computer.vision.query(query="Describe this image.", path="image.jpg")` (asks a vision AI model the query, regarding the image at path) and `computer.vision.ocr(path="image.jpg")` (returns text in the image at path). For example:

    User: Rename the images on my desktop to something more descriptive.
    Assistant: Viewing and renaming images.
    ```python
    import os
    import string
    from pathlib import Path

    # Get the user's home directory in a cross-platform way
    home_dir = Path.home()

    # Define the path to the desktop
    desktop_dir = home_dir / 'Desktop'

    # Loop through all files on the desktop
    for file in desktop_dir.iterdir():
        # Check if the file is an image
        if file.suffix in ['.jpg', '.png', '.jpeg', '.gif', '.bmp']:
            # Get a description of the image
            description = computer.vision.query(query="Describe this image in 4 words.", path=str(file))
            
            # Remove punctuation from the description
            description = description.translate(str.maketrans('', '', string.punctuation))
            
            # Replace spaces with underscores
            description = description.replace(' ', '_')
            
            # Form the new filename
            new_filename = f"{description}{file.suffix}"
            
            # Rename the file
            file.rename(desktop_dir / new_filename)
    ```
    User: The code you ran produced no output. Was this expected, or are we finished?
    Assistant: We are finished.
    User: What text is in the image 'user.png' on my desktop?
    Assistant: ```python
    import os
    import string
    from pathlib import Path

    # Get the user's home directory in a cross-platform way
    home_dir = Path.home()

    # Define the path to the image
    image_path = desktop_dir / 'user.png'

    # Get the text in the image
    text_in_image = computer.vision.ocr(path=str(image_path))

    text_in_image
    ```
    User: The code you ran produced this output: "29294 is the username". What does this mean?
    Assistant: The output means that the `user.png` image on your desktop contains the text "29294 is the username".

    NEVER use placeholders. Always specify exact paths, and use cross-platform ways of determining the desktop, documents, etc. folders.

    Now, your turn:"""

    # Message templates
    interpreter.code_output_template = '''I executed that code. This was the output: """{content}"""\n\nWhat does this output mean (I can't understand it, please help) / what code needs to be run next (if anything, or are we done)? I can't replace any placeholders.'''
    interpreter.empty_code_output_template = "The code above was executed on my machine. It produced no text output. What's next (if anything, or are we done?)"
    interpreter.code_output_sender = "user"

    # LLM settings
    interpreter.llm.temperature = 0.1
    interpreter.offline = True
    interpreter.offline = True
    interpreter.llm.model = "ollama/deepseek-coder-v2:16b-lite-instruct-q6_K"
    interpreter.llm.api_base = "http://localhost:11434"
    interpreter.llm.supports_functions = False
    interpreter.llm.execution_instructions = False
    interpreter.llm.max_tokens = 1000
    interpreter.llm.context_window = 7000
    interpreter.llm.load()  # Loads Ollama models
    interpreter.anonymized_telemetry = True
    interpreter.loop = True

    # Computer settings
    interpreter.computer.import_computer_api = True
    interpreter.computer.system_message = ""  # The default will explain how to use the full Computer API, and append this to the system message. For local models, we want more control, so we set this to "". The system message will ONLY be what's above ^
    interpreter.computer.vision.load()  # Load vision models

    # Misc settings
    interpreter.auto_run = True
    interpreter.offline = True

    # Final message
    interpreter.display_message("> Model set to `Deepseek`, vision enabled")

    return interpreter

# Initialize the interpreter
interpreter = initialize_interpreter()

app = FastAPI()

@app.post("/interpreter")
async def interpret(request: Request):
    try:
        data = await request.json()
        message = data.get("message")
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        response = interpreter.chat(message)
        return {"response": response}
    except Exception as e:
        logger.error(f"Error in interpretation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    logger.info("Starting Open Interpreter server...")
    try:
        uvicorn.run(app, host="0.0.0.0", port=10001, log_level="info")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        
        

# Initialize interpreter (code above)
interpreter = initialize_interpreter()

app = FastAPI()

@app.post("/interpreter")
async def interpret(request: Request):
    try:
        data = await request.json()
        message = data.get("message")
        if not message:
            raise HTTPException(status_code=400, detail="Message is required")
        
        response = interpreter.chat(message)
        return {"response": response}
    except Exception as e:
        logger.error(f"Error in interpretation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    logger.info("Starting Open Interpreter server...")
    try:
        uvicorn.run(app, host="0.0.0.0", port=10001, log_level="info")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
