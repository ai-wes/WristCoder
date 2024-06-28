from langchain.chains.combine_documents.stuff import StuffDocumentsChain
from langchain.chains.llm import LLMChain
from langchain_core.prompts import PromptTemplate
from langchain.chains.summarize import load_summarize_chain
from langchain_community.document_loaders import WebBaseLoader
from langchain_openai import ChatOpenAI
from langchain_core.documents import Document
# Define prompt


def generate_interpreter_output_summary(user_input, interpreter_output):
    prompt_template = """Write a concise summary of the following:
    "{text}"
    CONCISE SUMMARY:"""
    prompt = PromptTemplate.from_template(prompt_template)

    # Define LLM chain
    llm = ChatOpenAI(temperature=0, model_name="gpt-3.5-turbo-16k")
    llm_chain = LLMChain(llm=llm, prompt=prompt)


    docs = [Document(page_content=f"""BRIEFLY summarize the following code execution output. If an action was successful, BREIFLY describe the successful action concisely and offer next steps or suggestions. If an error occurs, do not give all of the error information unless asked for. Simply say there was an error, the code number, and if applicable a simple sentence describing the error. Always finish your response with a question or suggestion for the user.
                    Examples of acceptable responses are below:
                    AI SUMMARIZED RESPONSE: The code executed successfully and the file was saved to the desktop as simple_http_server.py.
                    Would you like to run the script to start the HTTP server?
                    AI SUMMARIZED RESPONSE: The code executed successfully and the file was saved to the desktop as read_csv.py.
                    AI SUMMARIZED RESPONSE: The code executed with an error. The file was not found. Would you like to specify the file path and try again?
                    
                    Now it's your turn. Please summarize the code execution output below. USER INPUT:{user_input}, GENERATED RESPONSE: {interpreter_output}AI SUMMARIZED RESPONSE: """, metadata={})]

    # Define StuffDocumentsChain
    stuff_chain = StuffDocumentsChain(llm_chain=llm_chain, document_variable_name="text")

    print(stuff_chain.invoke(docs)["output_text"])
