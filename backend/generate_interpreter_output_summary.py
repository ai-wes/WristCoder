from langchain.chains.combine_documents.stuff import StuffDocumentsChain
from langchain.chains.llm import LLMChain
from langchain_core.prompts import PromptTemplate
from langchain.chains.summarize import load_summarize_chain
from langchain_community.chat_models import ChatOllama
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
# Define prompt




def generate_interpreter_output_summary(raw_output):
    prompt_template = """The following is the output from a code execution ai. You are the liason and "middle man" that relays messages from a code execution AI to a human user. Your job is to concisely summarize the actions, code, and outcomes generated during the coding ai's session for the user. Your response should be no more than 3-4 sentences.  IT IS CRITICALLY IMPORTANT THAT YOU DO NOT SAY "Sure, here's a concise summary" or "Here is a concise summary" or "Hey There!"!!!!! SPEAK TO THE USER IN DIRECT 1st PERSON. ONLY.. The user should be able to understand the summary without any additional context!!!!! After your summary always ask the user if they want to continue and give suggestions for next steps: "{text}"
    CONCISE SUMMARY:"""
    prompt = PromptTemplate.from_template(prompt_template)

    # Define LLM chain
    #llm = ChatOllama(temperature=0.3, model_name="deepseek-coder-v2:16b-lite-instruct-q6_K")
    llm = ChatOpenAI(temperature=0.3, model_name="gpt-3.5-turbo", base_url="http://localhost:1234/v1")
    llm_chain = LLMChain(llm=llm, prompt=prompt)


    docs = [Document(page_content=f""" {raw_output}""", metadata={})]

    # Define StuffDocumentsChain
    stuff_chain = StuffDocumentsChain(llm_chain=llm_chain, document_variable_name="text")

    generated_summary = stuff_chain.invoke(docs)["output_text"]
    print("Generated Summary: ", generated_summary)
    return generated_summary

