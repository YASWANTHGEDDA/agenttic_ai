# FusedChatbot/server/ai_core_service/llm_handler.py
import os
import logging
import json
from dotenv import load_dotenv

# --- SDK Imports with Graceful Fallbacks ---
try:
    import google.generativeai as genai
except ImportError:
    genai = None
    logging.warning("SDK not found: 'google.generativeai'. Gemini features will be unavailable.")

try:
    from groq import Groq, AuthenticationError
except ImportError:
    Groq = None
    AuthenticationError = None
    logging.warning("SDK not found: 'groq'. Groq features will be unavailable.")

try:
    # Use the official Ollama client
    from ollama import Client, ResponseError
except ImportError:
    Client = None
    ResponseError = None
    logging.warning("SDK not found: 'ollama'. Ollama features will be unavailable.")

# --- Service Configuration ---
# Use a relative import to ensure it works when run as a module
from . import config as service_config

logger = logging.getLogger(__name__)

# --- Prompt Templates ---
_ANALYSIS_THINKING_PREFIX_STR = """**STEP 1: THINKING PROCESS (Optional but Recommended):**
*   Before generating the analysis, briefly outline your plan in `<thinking>` tags. Example: `<thinking>Analyzing for FAQs. I will scan for key questions and their corresponding answers presented in the text.</thinking>`
*   If you include this, place the final analysis *after* the `</thinking>` tag.

**STEP 2: ANALYSIS OUTPUT:**
*   Generate the requested analysis based **strictly** on the text provided below.
*   Follow the specific OUTPUT FORMAT instructions carefully.

--- START DOCUMENT TEXT ---
{doc_text_for_llm}
--- END DOCUMENT TEXT ---
"""

ANALYSIS_PROMPTS = {
    "faq": _ANALYSIS_THINKING_PREFIX_STR + """
**TASK:** Generate approximately {num_items} Frequently Asked Questions (FAQs) with concise answers based ONLY on the text.
**OUTPUT FORMAT (Strict):**
*   Start directly with the first FAQ (after the optional thinking block). Do NOT include any preamble.
*   Format each item as: `Q: [Question derived ONLY from the text]\nA: [Answer derived ONLY from the text, concise]`
**BEGIN OUTPUT (Start with 'Q:' or `<thinking>`):**
""",
    "topics": _ANALYSIS_THINKING_PREFIX_STR + """
**TASK:** Identify approximately {num_items} most important topics discussed in the text.
**OUTPUT FORMAT (Strict):**
*   Start directly with the first topic (after the optional thinking block). Do NOT include any preamble.
*   Format as a Markdown bulleted list: `*   **Topic Name:** Brief explanation derived ONLY from the text content (1-2 sentences max).`
**BEGIN OUTPUT (Start with '*   **' or `<thinking>`):**
""",
    "mindmap": """You are a text-to-Mermaid-syntax converter. Your ONLY task is to create a mind map from the user's text.

**CRITICAL INSTRUCTIONS:**
1.  **TOP-LEVEL DECLARATION:** Your entire output MUST begin with the single word `mindmap` on the very first line. NO other text, conversation, or explanation should come before it.
2.  **HIERARCHY:** Use indentation (spaces) to show the hierarchy of ideas. More indentation means a deeper level in the mind map.
3.  **NO MARKDOWN:** Do NOT use Markdown list characters like `-`, `*`, or `#`.
4.  **CONCISENESS:** Keep node text brief and to the point.

**STRICT OUTPUT EXAMPLE:**
mindmap
  Main Idea
    Key Concept A
      Detail 1
      Detail 2
    Key Concept B
    Key Concept C
      Detail 3

--- START DOCUMENT TEXT ---
{doc_text_for_llm}
--- END DOCUMENT TEXT ---

Based on the text, generate the Mermaid mind map syntax now.
"""
}

_SYNTHESIS_PROMPT_TEMPLATE_STR = """You are a specialized engineering and scientific tutor for an academic audience. Your goal is to answer the user's query based on the provided context document chunks, augmented with your general knowledge. Provide detailed, technical, and well-structured responses.

**USER QUERY:**
"{query}"

**PROVIDED CONTEXT:**
--- START CONTEXT ---
{context}
--- END CONTEXT ---

**INSTRUCTIONS & OUTPUT STRUCTURE:**

**1. THINKING PROCESS (MANDATORY):**
*   **CRITICAL:** Before the final answer, articulate your step-by-step reasoning within `<thinking>` and `</thinking>` tags.
*   Explain how you will use the context to answer the user's query. Example: `<thinking>The user asks about X. Context [1] defines it. Context [3] gives an example. I will synthesize these two for the main answer and note that the context does not cover aspect Y.</thinking>`
*   **DO NOT** put any text before the opening `<thinking>` tag.

**2. FINAL ANSWER (MANDATORY, *AFTER* the `</thinking>` tag):**
*   After the `</thinking>` tag, provide your comprehensive final answer.
*   **Cite Sources:** When using information from the context, you **MUST** cite its number, like [1], [2], etc.
*   **Handle Insufficient Context:** If the context is not enough, state that clearly (e.g., "The provided documents do not detail...").
*   **Integrate General Knowledge:** You may use your general knowledge to fill gaps, but prioritize the provided context.
*   **Be a Tutor:** Use a professional, academic tone with clear explanations and Markdown formatting.

**BEGIN RESPONSE (Start with `<thinking>`):**
"""

_SUB_QUERY_TEMPLATE_STR = """Given the user's query, generate {num_queries} distinct search queries targeting different aspects of the original query. Output ONLY the generated queries, each on a new line. Do not include numbering or explanations.

User Query: "{query}"

Generated Search Queries:"""


# --- Helper Functions ---
def _parse_thinking_and_answer(full_llm_response: str) -> tuple[str, str | None]:
    """Parses an LLM response to separate the <thinking> block from the final answer."""
    response_text = full_llm_response.strip()
    think_start_tag, think_end_tag = "<thinking>", "</thinking>"
    start_index = response_text.find(think_start_tag)
    end_index = response_text.find(think_end_tag, start_index)
    if start_index != -1 and end_index != -1:
        thinking_content = response_text[start_index + len(think_start_tag):end_index].strip()
        answer = response_text[end_index + len(think_end_tag):].strip()
        return answer or "[AI response primarily contained reasoning.]", thinking_content
    return response_text, None

def _call_llm_for_task(prompt: str, llm_provider: str, llm_model_name: str, user_gemini_api_key: str | None, user_grok_api_key: str | None) -> str:
    """Internal helper to dispatch a simple, single-prompt task to an LLM."""
    if llm_provider.startswith("gemini"):
        if not genai: raise ConnectionError("Gemini SDK not installed.")
        if not user_gemini_api_key: raise ConnectionError("Gemini API key is required.")
        genai.configure(api_key=user_gemini_api_key)
        model = genai.GenerativeModel(llm_model_name)
        return model.generate_content(prompt).text
    
    elif llm_provider.startswith("groq"):
        if not Groq: raise ConnectionError("Groq SDK not installed.")
        if not user_grok_api_key: raise ConnectionError("Groq API key is required.")
        client = Groq(api_key=user_grok_api_key)
        completion = client.chat.completions.create(messages=[{"role": "user", "content": prompt}], model=llm_model_name)
        return completion.choices[0].message.content
        
    elif llm_provider.startswith("ollama"):
        if not Client: raise ConnectionError("Ollama SDK not installed.")
        client = Client(host=service_config.OLLAMA_URL)
        response = client.chat(model=llm_model_name, messages=[{'role': 'user', 'content': prompt}])
        return response['message']['content']
        
    else:
        raise ValueError(f"Unsupported LLM provider: {llm_provider}")


# --- Core AI Functions ---

def perform_document_analysis(document_text: str, analysis_type: str, llm_provider: str, llm_model_name: str | None,
                              user_gemini_api_key: str | None, user_grok_api_key: str | None) -> tuple[str | None, str | None]:
    """Performs analysis on a document using per-request API keys."""
    if not document_text.strip():
        return "Error: Document content is empty.", None

    max_len = getattr(service_config, 'ANALYSIS_MAX_CONTEXT_LENGTH', 8000)
    doc_text_for_llm = document_text[:max_len]
    num_items = min(5 + (len(doc_text_for_llm) // 4000), 20)
    
    prompt_template = ANALYSIS_PROMPTS.get(analysis_type)
    if not prompt_template:
        return f"Error: Analysis type '{analysis_type}' is not supported.", None

    format_args = {"doc_text_for_llm": doc_text_for_llm, "num_items": num_items}
    # For mindmap, num_items is not used, so we remove it to avoid a KeyError
    if 'num_items' not in prompt_template.format_map({}).keys():
        format_args.pop('num_items', None)
        
    final_prompt_str = prompt_template.format(**format_args)
    
    default_models = {"gemini": "gemini-1.5-flash", "groq": "llama3-8b-8192", "ollama": "llama3"}
    provider_key = next((key for key in default_models if llm_provider.startswith(key)), None)
    model = llm_model_name or (default_models.get(provider_key) if provider_key else None)

    if not model:
        raise ValueError(f"Could not determine a default model for provider '{llm_provider}'.")

    try:
        raw_response = _call_llm_for_task(final_prompt_str, llm_provider, model, user_gemini_api_key, user_grok_api_key)
        if analysis_type == 'mindmap':
            return raw_response.strip(), None
        return _parse_thinking_and_answer(raw_response)
    except Exception as e:
        logger.error(f"Error during '{analysis_type}' analysis with {llm_provider}: {e}", exc_info=True)
        return f"Error performing analysis: {e}", None

def generate_sub_queries_via_llm(original_query: str, llm_provider: str, llm_model_name: str | None,
                                 user_gemini_api_key: str | None, user_grok_api_key: str | None) -> list[str]:
    """Decomposes a query using per-request API keys."""
    num_sub_queries = getattr(service_config, 'MULTI_QUERY_COUNT_CONFIG', 3)
    prompt = _SUB_QUERY_TEMPLATE_STR.format(query=original_query, num_queries=num_sub_queries)
    
    default_models = {"gemini": "gemini-1.5-flash", "groq": "llama3-8b-8192", "ollama": "llama3"}
    provider_key = next((key for key in default_models if llm_provider.startswith(key)), None)
    model = llm_model_name or (default_models.get(provider_key) if provider_key else None)

    if not model: return []
    try:
        raw_response = _call_llm_for_task(prompt, llm_provider, model, user_gemini_api_key, user_grok_api_key)
        return [q.strip() for q in raw_response.strip().split('\n') if q.strip()][:num_sub_queries]
    except Exception as e:
        logger.error(f"Failed to generate sub-queries with {llm_provider}: {e}", exc_info=True)
        return []

# --- Main Response Synthesis Function ---
def generate_response(llm_provider: str, query: str, context_text: str, chat_history: list, system_prompt: str | None,
                      llm_model_name: str | None, user_gemini_api_key: str | None, user_grok_api_key: str | None) -> tuple[str, str | None]:
    """Main dispatcher to generate a synthesized response using per-request API keys and history."""
    logger.info(f"Synthesizing response with provider: {llm_provider}.")
    
    final_user_prompt = _SYNTHESIS_PROMPT_TEMPLATE_STR.format(query=query, context=context_text)

    # Convert the frontend history format {'user': '...', 'assistant': '...'} to the API format {'role': '...', 'content': '...'}
    messages_for_api = []
    if system_prompt:
        messages_for_api.append({"role": "system", "content": system_prompt})
    
    if chat_history:
        for message in chat_history:
            if 'user' in message and message['user']:
                messages_for_api.append({"role": "user", "content": message['user']})
            if 'assistant' in message and message['assistant']:
                messages_for_api.append({"role": "assistant", "content": message['assistant']})
    
    messages_for_api.append({"role": "user", "content": final_user_prompt})

    provider_key = next((key for key in ["gemini", "groq", "ollama"] if llm_provider.startswith(key)), None)
    if not provider_key:
        raise ValueError(f"Unsupported LLM provider for synthesis: '{llm_provider}'")

    try:
        if provider_key == "gemini":
            if not user_gemini_api_key: raise ConnectionError("Gemini API key not provided.")
            genai.configure(api_key=user_gemini_api_key)
            model = genai.GenerativeModel(llm_model_name or "gemini-1.5-flash", system_instruction=system_prompt)
            # Gemini wants history in a specific format ('model' role) and without the system prompt
            gemini_history = [
                {"role": "user" if msg["role"] == "user" else "model", "parts": [msg["content"]]}
                for msg in messages_for_api if msg['role'] in ["user", "assistant"]
            ]
            final_prompt_content = gemini_history.pop()['parts'][0]
            chat_session = model.start_chat(history=gemini_history)
            response = chat_session.send_message(final_prompt_content)
            return _parse_thinking_and_answer(response.text)

        elif provider_key == "groq":
            if not user_grok_api_key: raise ConnectionError("Groq API key not provided.")
            client = Groq(api_key=user_grok_api_key)
            model_to_use = llm_model_name or "llama3-8b-8192"
            # The 'messages_for_api' list is already in the correct format with 'system', 'user', and 'assistant' roles.
            completion = client.chat.completions.create(messages=messages_for_api, model=model_to_use)
            return _parse_thinking_and_answer(completion.choices[0].message.content)

        elif provider_key == "ollama":
            if not Client: raise ConnectionError("Ollama SDK not installed.")
            client = Client(host=service_config.OLLAMA_URL)
            model_to_use = llm_model_name or "llama3"
            # The 'messages_for_api' list is already in the correct format for the ollama client.
            response = client.chat(model=model_to_use, messages=messages_for_api)
            return _parse_thinking_and_answer(response['message']['content'])

    except AuthenticationError as e:
         raise ConnectionError(f"API Authentication Error for {provider_key.upper()}: {e}")
    except Exception as e:
        logger.error(f"LLM call failed for {provider_key} during synthesis: {e}", exc_info=True)
        raise ConnectionError(f"Failed to get a response from {provider_key.upper()}. Details: {e}")