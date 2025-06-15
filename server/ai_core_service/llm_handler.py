# FusedChatbot/server/ai_core_service/llm_handler.py
import os
import logging
# import json # Not currently used
from dotenv import load_dotenv # Keep if used for other non-config.py related env vars

# --- SDK Imports ---
try:
    import google.generativeai as genai
except ImportError:
    genai = None
    logging.warning("SDK not found: 'google.generativeai'. Gemini features will be unavailable.")
try:
    from groq import Groq, APIError as GroqAPIError, AuthenticationError as GroqAuthenticationError # Import APIError for broader catch
except ImportError:
    Groq = None
    GroqAPIError = None
    GroqAuthenticationError = None
    logging.warning("SDK not found: 'groq'. Groq features will be unavailable.")
try:
    from ollama import Client, ResponseError as OllamaResponseError
except ImportError:
    Client = None
    OllamaResponseError = None
    logging.warning("SDK not found: 'ollama'. Ollama features will be unavailable.")

# --- Service Configuration ---
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
    response_text = full_llm_response.strip()
    think_start_tag, think_end_tag = "<thinking>", "</thinking>"
    start_index = response_text.find(think_start_tag)
    end_index = response_text.find(think_end_tag, start_index)
    if start_index == 0 and end_index != -1: # Ensure <thinking> is at the very beginning
        thinking_content = response_text[len(think_start_tag):end_index].strip()
        answer = response_text[end_index + len(think_end_tag):].strip()
        # If answer is empty after thinking, it means the LLM might have only provided thinking.
        return answer or "[AI response primarily contained reasoning. See thinking process.]", thinking_content
    elif start_index != -1 and end_index != -1 : # <thinking> block found but not at start
        logger.warning("'<thinking>' block found but not at the beginning of the response. Treating as part of the answer.")
    elif start_index != -1 and end_index == -1: # Unclosed <thinking> tag
        logger.warning("Found '<thinking>' tag but no closing tag. Response might be truncated or malformed.")
    # No valid <thinking> block found or it's malformed
    return response_text, None


def _call_llm_for_task(prompt: str, llm_provider: str, llm_model_name: str,
                       user_gemini_api_key: str | None, user_grok_api_key: str | None,
                       ollama_url_override: str | None = None,
                       temperature: float | None = None,
                       max_tokens: int | None = None,
                       is_chat_completion: bool = False, # Flag for chat-style completions vs. raw prompt
                       messages_for_chat: list | None = None # Used if is_chat_completion is True
                       ) -> str:
    logger.debug(f"Calling LLM for task: Provider='{llm_provider}', Model='{llm_model_name}', Temp='{temperature}', MaxTokens='{max_tokens}', IsChat='{is_chat_completion}'")

    if llm_provider.startswith("gemini"):
        if not genai: raise ConnectionError("Gemini SDK not installed.")
        api_key_to_use = user_gemini_api_key or os.environ.get("GEMINI_API_KEY") # Fallback to env
        if not api_key_to_use: raise ConnectionError("Gemini API key is required for this task (neither per-user nor in ENV).")
        genai.configure(api_key=api_key_to_use)

        gen_config_params = {}
        if temperature is not None: gen_config_params['temperature'] = temperature
        if max_tokens is not None: gen_config_params['max_output_tokens'] = max_tokens
        generation_config = genai.types.GenerationConfig(**gen_config_params) if gen_config_params else None

        # For Gemini, system_instruction is part of model init, history for chat.
        # This _call_llm_for_task is more for single-shot prompt/response like analysis or sub-queries.
        # For full chat, generate_response handles Gemini's chat session logic.
        if is_chat_completion and messages_for_chat: # This case should be handled by generate_response for Gemini
             logger.warning("_call_llm_for_task with is_chat_completion=True for Gemini is not standard; use generate_response.")
             # Simplified: just use the last user message from messages_for_chat as prompt
             final_prompt_for_gemini = messages_for_chat[-1]['content'] if messages_for_chat and messages_for_chat[-1]['role'] == 'user' else prompt
             model = genai.GenerativeModel(llm_model_name)
             response = model.generate_content(final_prompt_for_gemini, generation_config=generation_config)
        else: # Standard prompt for tasks like analysis
            model = genai.GenerativeModel(llm_model_name)
            response = model.generate_content(prompt, generation_config=generation_config)

        if not response.text and response.prompt_feedback and response.prompt_feedback.block_reason:
             raise ConnectionError(f"Gemini content generation blocked. Reason: {response.prompt_feedback.block_reason_message or response.prompt_feedback.block_reason}")
        return response.text

    elif llm_provider.startswith("groq"):
        if not Groq: raise ConnectionError("Groq SDK not installed.")
        api_key_to_use = user_grok_api_key or os.environ.get("GROQ_API_KEY") # Fallback to env
        if not api_key_to_use: raise ConnectionError("Groq API key is required for this task (neither per-user nor in ENV).")
        client = Groq(api_key=api_key_to_use)

        actual_messages = messages_for_chat if is_chat_completion and messages_for_chat else [{"role": "user", "content": prompt}]
        completion_params = {"messages": actual_messages, "model": llm_model_name}
        if temperature is not None: completion_params['temperature'] = temperature
        if max_tokens is not None: completion_params['max_tokens'] = max_tokens

        completion = client.chat.completions.create(**completion_params)
        return completion.choices[0].message.content

    elif llm_provider.startswith("ollama"):
        if not Client: raise ConnectionError("Ollama SDK not installed.")
        effective_ollama_url = ollama_url_override or service_config.OLLAMA_URL
        client = Client(host=effective_ollama_url)
        logger.debug(f"Ollama task client using host: {effective_ollama_url}")

        actual_messages = messages_for_chat if is_chat_completion and messages_for_chat else [{'role': 'user', 'content': prompt}]
        chat_params = {"model": llm_model_name, "messages": actual_messages}
        options = {}
        if temperature is not None: options['temperature'] = temperature
        if max_tokens is not None: options['num_predict'] = max_tokens # Ollama uses num_predict for max tokens
        if options: chat_params['options'] = options

        response = client.chat(**chat_params)
        return response['message']['content']
    else:
        raise ValueError(f"Unsupported LLM provider for task: {llm_provider}")

# --- Core AI Functions ---
def perform_document_analysis(document_text: str, analysis_type: str, llm_provider: str,
                              llm_model_name: str | None, # Model name can be provided
                              user_gemini_api_key: str | None, user_grok_api_key: str | None,
                              ollama_url_override: str | None = None,
                              temperature: float | None = None,
                              max_tokens: int | None = None
                             ) -> tuple[str | None, str | None]:
    if not document_text.strip():
        logger.warning("Document analysis: Input text is empty.")
        return "Error: Document content is empty.", None

    max_len = getattr(service_config, 'ANALYSIS_MAX_CONTEXT_LENGTH', 30000)
    doc_text_for_llm = document_text[:max_len]
    if len(document_text) > max_len:
        logger.warning(f"Document analysis: Truncated text from {len(document_text)} to {max_len} chars.")
        doc_text_for_llm += "\n[...DOCUMENT TRUNCATED FOR ANALYSIS...]"

    if len(doc_text_for_llm) < 1000: num_items_calc = 3
    elif len(doc_text_for_llm) < 5000: num_items_calc = 5
    elif len(doc_text_for_llm) < 15000: num_items_calc = 10
    else: num_items_calc = 15
    num_items = min(num_items_calc, 20)

    prompt_template = ANALYSIS_PROMPTS.get(analysis_type)
    if not prompt_template:
        logger.error(f"Invalid analysis type '{analysis_type}' for document analysis.")
        return f"Error: Analysis type '{analysis_type}' is not supported.", None

    format_args = {"doc_text_for_llm": doc_text_for_llm}
    if "{num_items}" in prompt_template:
        format_args["num_items"] = num_items

    try:
        final_prompt_str = prompt_template.format(**format_args)
    except KeyError as e:
        logger.error(f"KeyError formatting analysis prompt for '{analysis_type}': {e}. Args: {format_args.keys()}. Prompt: {prompt_template[:200]}")
        return f"Error: Internal prompt configuration issue for {analysis_type} (missing key: {e}).", None

    # Determine the model to use for analysis
    default_models_analysis = {
        "gemini": getattr(service_config, "GEMINI_DEFAULT_MODEL_ANALYSIS", "gemini-1.5-flash-latest"),
        "groq": getattr(service_config, "GROQ_DEFAULT_MODEL_ANALYSIS", "llama3-8b-8192"),
        "ollama": getattr(service_config, "OLLAMA_DEFAULT_MODEL_ANALYSIS", getattr(service_config, "DEFAULT_OLLAMA_MODEL", "llama3"))
    }
    provider_key_analysis = next((key for key in default_models_analysis if llm_provider.startswith(key)), None)
    model_to_use_analysis = llm_model_name or (default_models_analysis.get(provider_key_analysis) if provider_key_analysis else None)

    if not model_to_use_analysis:
        logger.error(f"Could not determine a model for analysis provider '{llm_provider}'. Specific model: {llm_model_name}.")
        return f"Error: No model specified or could be defaulted for provider '{llm_provider}'.", None

    logger.info(f"Performing '{analysis_type}' analysis with {llm_provider} (Model: {model_to_use_analysis}).")
    try:
        raw_response = _call_llm_for_task(
            prompt=final_prompt_str,
            llm_provider=llm_provider,
            llm_model_name=model_to_use_analysis,
            user_gemini_api_key=user_gemini_api_key,
            user_grok_api_key=user_grok_api_key,
            ollama_url_override=ollama_url_override,
            temperature=temperature, # Pass through
            max_tokens=max_tokens    # Pass through
        )
        if analysis_type == 'mindmap': # Mindmap does not use <thinking>
            return raw_response.strip(), None
        return _parse_thinking_and_answer(raw_response)
    except ConnectionError as ce:
        logger.error(f"Connection error during '{analysis_type}' analysis with {llm_provider}: {ce}", exc_info=False)
        return f"Error: Could not connect to {llm_provider.upper()} for analysis. {ce}", None
    except GroqAPIError as e: # Catch Groq specific API errors
        logger.error(f"Groq API Error during '{analysis_type}' analysis: {e}", exc_info=True)
        return f"Error from Groq API during analysis: {e}", None
    except Exception as e:
        logger.error(f"General error during '{analysis_type}' analysis with {llm_provider}: {e}", exc_info=True)
        return f"Error performing document analysis with {llm_provider.upper()}: {e}", None


def generate_sub_queries_via_llm(original_query: str, llm_provider: str,
                                 llm_model_name: str | None, # Model name can be provided
                                 user_gemini_api_key: str | None,
                                 user_grok_api_key: str | None,
                                 ollama_url_override: str | None = None
                                 ) -> list[str]:
    num_sub_queries = getattr(service_config, 'MULTI_QUERY_COUNT_CONFIG', 3)
    if num_sub_queries <= 0:
        logger.info("Sub-query generation skipped as count is zero or less.")
        return []
    prompt = _SUB_QUERY_TEMPLATE_STR.format(query=original_query, num_queries=num_sub_queries)

    # Determine model to use for sub-query generation
    default_models_subquery = {
        "gemini": getattr(service_config, "GEMINI_DEFAULT_MODEL_SUBQUERY", "gemini-1.5-flash-latest"),
        "groq": getattr(service_config, "GROQ_DEFAULT_MODEL_SUBQUERY", "llama3-8b-8192"),
        "ollama": getattr(service_config, "OLLAMA_DEFAULT_MODEL_SUBQUERY", getattr(service_config, "DEFAULT_OLLAMA_MODEL", "llama3"))
    }
    provider_key_subquery = next((key for key in default_models_subquery if llm_provider.startswith(key)), None)
    model_to_use_subquery = llm_model_name or (default_models_subquery.get(provider_key_subquery) if provider_key_subquery else None)

    if not model_to_use_subquery:
        logger.warning(f"Could not determine model for sub-query generation with provider '{llm_provider}'. Specific model: {llm_model_name}. Returning empty list.")
        return []

    logger.info(f"Generating sub-queries with {llm_provider} (Model: {model_to_use_subquery}).")
    try:
        raw_response = _call_llm_for_task(
            prompt=prompt,
            llm_provider=llm_provider,
            llm_model_name=model_to_use_subquery,
            user_gemini_api_key=user_gemini_api_key,
            user_grok_api_key=user_grok_api_key,
            ollama_url_override=ollama_url_override
            # Default temperature/max_tokens from _call_llm_for_task are fine for sub-queries
        )
        sub_q_list = [q.strip() for q in raw_response.strip().split('\n') if q.strip()]
        return sub_q_list[:num_sub_queries] # Ensure we don't return more than requested
    except ConnectionError as ce:
        logger.error(f"Connection error generating sub-queries with {llm_provider}: {ce}", exc_info=False)
        return []
    except GroqAPIError as e:
        logger.error(f"Groq API Error during sub-query generation: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"Failed to generate sub-queries with {llm_provider} (Model: {model_to_use_subquery}): {e}", exc_info=True)
        return []

# --- Main Response Synthesis Function ---
def generate_response(llm_provider: str, query: str, context_text: str, chat_history: list,
                      system_prompt: str | None,
                      # Parameters passed from app.py
                      llm_model_name: str | None, # Specific model from request, or None to use default
                      user_gemini_api_key: str | None,
                      user_grok_api_key: str | None,
                      ollama_url_override: str | None, # Passed from app.py if set, else None
                      temperature: float | None = None,
                      max_tokens: int | None = None
                     ) -> tuple[str, str | None]:

    logger.info(f"Synthesizing response with: Provider='{llm_provider}', Requested Model='{llm_model_name}', Temp='{temperature}', MaxTokens='{max_tokens}'")

    final_user_prompt_content = _SYNTHESIS_PROMPT_TEMPLATE_STR.format(query=query, context=context_text)

    # Construct messages for API
    messages_for_api = []
    if system_prompt:
        messages_for_api.append({"role": "system", "content": system_prompt})

    # Add chat history. Ensure it's in {role: 'user'/'assistant', content: '...'} format
    if chat_history:
        for turn in chat_history:
            # Assuming history from Node is [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
            if isinstance(turn, dict) and "role" in turn and "content" in turn:
                 # Map 'user' to 'user' and 'assistant' to 'assistant' for Groq/Ollama
                 # Gemini uses 'user' and 'model'
                api_role = turn["role"]
                if llm_provider.startswith("gemini") and api_role == "assistant":
                    api_role = "model" # Gemini expects "model" for assistant turns in history
                messages_for_api.append({"role": api_role, "content": turn["content"]})
            else:
                logger.warning(f"Skipping malformed history item: {turn}")

    messages_for_api.append({"role": "user", "content": final_user_prompt_content})


    # Determine provider key and default model for synthesis if llm_model_name is not provided
    provider_key_synthesis = next((key for key in ["gemini", "groq", "ollama"] if llm_provider.startswith(key)), None)
    if not provider_key_synthesis:
        logger.error(f"Unsupported LLM provider for synthesis: '{llm_provider}'")
        raise ValueError(f"Unsupported LLM provider for synthesis: '{llm_provider}'")

    default_models_synthesis = {
        "gemini": getattr(service_config, "GEMINI_DEFAULT_MODEL_SYNTHESIS", "gemini-1.5-flash-latest"),
        "groq": getattr(service_config, "GROQ_DEFAULT_MODEL_SYNTHESIS", "llama3-8b-8192"),
        "ollama": getattr(service_config, "OLLAMA_DEFAULT_MODEL_SYNTHESIS", getattr(service_config, "DEFAULT_OLLAMA_MODEL", "llama3"))
    }
    # Use the provided llm_model_name if available, otherwise fallback to default for the provider
    model_to_use_synthesis = llm_model_name or default_models_synthesis.get(provider_key_synthesis)

    if not model_to_use_synthesis:
         logger.critical(f"PANIC: Could not determine model for synthesis with provider '{provider_key_synthesis}'. Requested model='{llm_model_name}'. This indicates a logic error in model defaulting.")
         raise ValueError(f"Model configuration error for provider {provider_key_synthesis}")

    logger.info(f"Final model for synthesis: {model_to_use_synthesis} (Provider: {provider_key_synthesis})")

    try:
        if provider_key_synthesis == "gemini":
            if not genai: raise ConnectionError("Gemini SDK not installed for synthesis.")
            api_key_to_use = user_gemini_api_key or os.environ.get("GEMINI_API_KEY")
            if not api_key_to_use: raise ConnectionError("Gemini API key not provided for synthesis (neither per-user nor in ENV).")
            genai.configure(api_key=api_key_to_use)

            gen_config_params = {}
            if temperature is not None: gen_config_params['temperature'] = temperature
            if max_tokens is not None: gen_config_params['max_output_tokens'] = max_tokens
            generation_config_obj = genai.types.GenerationConfig(**gen_config_params) if gen_config_params else None

            # Prepare history and prompt for Gemini's chat model
            system_instruction_for_gemini = None
            gemini_chat_history = []
            final_user_message_for_gemini = ""

            # Extract system prompt if present (first message)
            current_messages = list(messages_for_api) # Make a mutable copy
            if current_messages and current_messages[0]["role"] == "system":
                system_instruction_for_gemini = current_messages.pop(0)["content"]

            # Convert remaining messages to Gemini's history format (role: user/model, parts: [{text:...}])
            # The last message in current_messages is the current user prompt
            for msg in current_messages[:-1]: # All but the last user message for history
                 # Ensure role is 'user' or 'model' for Gemini history
                gemini_role = "model" if msg["role"] == "assistant" else msg["role"]
                gemini_chat_history.append({"role": gemini_role, "parts": [{"text": msg["content"]}]})

            if current_messages and current_messages[-1]["role"] == "user":
                final_user_message_for_gemini = current_messages[-1]["content"]
            else:
                logger.error("Gemini synthesis: Final message in constructed API messages is not from user. This is a bug.")
                raise ValueError("Gemini final prompt setup error: Last message not 'user'.")


            model_instance = genai.GenerativeModel(
                model_name=model_to_use_synthesis,
                system_instruction=system_instruction_for_gemini
            )
            chat_session = model_instance.start_chat(history=gemini_chat_history)

            logger.debug(f"Gemini call: Model={model_to_use_synthesis}, SysPrompt={'Yes' if system_instruction_for_gemini else 'No'}, History len={len(gemini_chat_history)}, UserPromptLen={len(final_user_message_for_gemini)}, Config={gen_config_params}")
            response = chat_session.send_message(final_user_message_for_gemini, generation_config=generation_config_obj)

            if not response.text and response.prompt_feedback and response.prompt_feedback.block_reason:
                 raise ConnectionError(f"Gemini content generation blocked. Reason: {response.prompt_feedback.block_reason_message or response.prompt_feedback.block_reason}")
            return _parse_thinking_and_answer(response.text)

        elif provider_key_synthesis == "groq":
            if not Groq: raise ConnectionError("Groq SDK not installed for synthesis.")
            api_key_to_use = user_grok_api_key or os.environ.get("GROQ_API_KEY")
            if not api_key_to_use: raise ConnectionError("Groq API key not provided for synthesis (neither per-user nor in ENV).")
            client = Groq(api_key=api_key_to_use)

            completion_params = {"messages": messages_for_api, "model": model_to_use_synthesis}
            if temperature is not None: completion_params['temperature'] = float(temperature) # Ensure float
            if max_tokens is not None: completion_params['max_tokens'] = int(max_tokens)       # Ensure int

            logger.debug(f"Groq call: Model={model_to_use_synthesis}, Messages len={len(messages_for_api)}, Params={ {k:v for k,v in completion_params.items() if k not in ['messages', 'api_key']} }")
            completion = client.chat.completions.create(**completion_params)
            return _parse_thinking_and_answer(completion.choices[0].message.content)

        elif provider_key_synthesis == "ollama":
            if not Client: raise ConnectionError("Ollama SDK not installed for synthesis.")
            effective_ollama_url = ollama_url_override or service_config.OLLAMA_URL
            client = Client(host=effective_ollama_url)
            logger.debug(f"Ollama synthesis client using host: {effective_ollama_url}")

            chat_params = {"model": model_to_use_synthesis, "messages": messages_for_api}
            options = {}
            if temperature is not None: options['temperature'] = float(temperature)
            if max_tokens is not None: options['num_predict'] = int(max_tokens) # Ollama uses num_predict
            if options: chat_params['options'] = options

            logger.debug(f"Ollama call: Model={model_to_use_synthesis}, Messages len={len(messages_for_api)}, Options={options}")
            response = client.chat(**chat_params)
            return _parse_thinking_and_answer(response['message']['content'])

    except GroqAuthenticationError as e: # Catch specific Groq auth error
         logger.error(f"Groq Authentication Error during synthesis: {e}", exc_info=True)
         raise ConnectionError(f"API Authentication Error with GROQ: Invalid API Key or permission issue. Detail: {e}")
    except GroqAPIError as e: # Catch other Groq API errors (rate limits, model not found, etc.)
         logger.error(f"Groq API Error during synthesis (Model: {model_to_use_synthesis}): Status {e.status_code}, Message: {e.message}", exc_info=True)
         raise ConnectionError(f"API Error with GROQ (Status {e.status_code}): {e.message}")
    except OllamaResponseError as e:
         logger.error(f"Ollama Response Error during synthesis: Status {e.status_code}, Detail: {e.error}", exc_info=True)
         raise ConnectionError(f"API Error with OLLAMA ({e.status_code}): {e.error}")
    except ConnectionError as ce: # Re-raise known connection errors from _call_llm or SDKs
        logger.error(f"ConnectionError for {provider_key_synthesis.upper()} during synthesis: {ce}", exc_info=False)
        raise ce
    except Exception as e: # Catch other potential SDK errors or general errors
        logger.error(f"Unexpected LLM call error for {provider_key_synthesis.upper()} (Model: {model_to_use_synthesis}) during synthesis: {type(e).__name__} - {e}", exc_info=True)
        raise ConnectionError(f"Failed to get a response from {provider_key_synthesis.upper()} due to an unexpected error. Details: {type(e).__name__} - {e}")