from langchain.chains.combine_documents.stuff import StuffDocumentsChain
from langchain.chains.llm import LLMChain
from langchain_core.prompts import PromptTemplate
from langchain.chains.summarize import load_summarize_chain
from langchain_community.chat_models import ChatOllama
from langchain_core.documents import Document
# Define prompt


def generate_interpreter_output_summary(raw_output):
    prompt_template = """The following is the output from a code execution ai. Your job is to concisely summarize the actions, code, and outcomes generated during the coding ai's session for the user. Your response should be no more than 3-4 sentences. Act as if you are the coding assistant speaking to the user directly about the results of the execution, but with less verbosity. In your response DO NOT SAY "Sure, here's a concise summary" or "Here is a concise summary". SPEAK TO THE USER IN DIRECT 1st PERSON. ONLY include the summary itself. The user should be able to understand the summary without any additional context!!!!!: "{text}"
    CONCISE SUMMARY:"""
    prompt = PromptTemplate.from_template(prompt_template)

    # Define LLM chain
    llm = ChatOllama(temperature=0, model_name="deepseek-coder-v2:16b-lite-instruct-q6_K")
    llm_chain = LLMChain(llm=llm, prompt=prompt)


    docs = [Document(page_content=f""" {raw_output}""", metadata={})]

    # Define StuffDocumentsChain
    stuff_chain = StuffDocumentsChain(llm_chain=llm_chain, document_variable_name="text")

    generated_summary = stuff_chain.invoke(docs)["output_text"]
    print("Generated Summary: ", generated_summary)
    return generated_summary
