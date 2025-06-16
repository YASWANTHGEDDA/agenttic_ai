// client/src/components/SystemPromptWidget.js
import React from 'react';

// Define the available system prompts. This data structure remains unchanged.
export const availablePrompts = [
  { id: 'friendly', title: 'Friendly Tutor', prompt: 'You are a friendly, patient, and encouraging tutor specializing in engineering and scientific topics for PhD students. Explain concepts clearly, break down complex ideas, use analogies, and offer positive reinforcement. Ask follow-up questions to ensure understanding.' },
  { id: 'explorer', title: 'Concept Explorer', prompt: 'You are an expert academic lecturer introducing a new, complex engineering or scientific concept. Your goal is to provide a deep, structured explanation. Define terms rigorously, outline the theory, provide relevant mathematical formulations (using Markdown), illustrative examples, and discuss applications or limitations pertinent to PhD-level research.' },
  { id: 'knowledge_check', title: 'Knowledge Check', prompt: 'You are assessing understanding of engineering/scientific topics. Ask targeted questions to test knowledge, identify misconceptions, and provide feedback on the answers. Start by asking the user what topic they want to be quizzed on.' },
  { id: 'custom', title: 'Custom Prompt', prompt: '' },
];

export const getPromptTextById = (id) => {
  const prompt = availablePrompts.find(p => p.id === id);
  return prompt ? prompt.prompt : '';
};

const SystemPromptWidget = ({ selectedPromptId, promptText, onSelectChange, onTextChange }) => {

  const handleDropdownChange = (event) => {
    onSelectChange(event.target.value);
  };

  const handleTextareaChange = (event) => {
    onTextChange(event.target.value);
  };

  return (
    // MODIFICATION: The root div no longer needs its own class, it will be styled by its parent.
    <div>
      {/* MODIFICATION: Using a proper label for the dropdown */}
      <label htmlFor="assistant-mode-select" className="widget-label">Assistant Mode</label>
      <select
        id="assistant-mode-select"
        className="widget-select"
        value={selectedPromptId}
        onChange={handleDropdownChange}
      >
        {availablePrompts.filter(p => p.id !== 'custom').map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
        {selectedPromptId === 'custom' && (
          <option key="custom" value="custom">Custom Prompt</option>
        )}
      </select>

      {/* MODIFICATION: Using a proper label for the textarea */}
      <label htmlFor="system-prompt-text" className="widget-label">System Prompt (Editable)</label>
      <textarea
        id="system-prompt-text"
        className="widget-textarea"
        value={promptText}
        onChange={handleTextareaChange}
        rows="6" // Increased rows slightly for better default view
        maxLength="2000"
        placeholder="Define the AI assistant's behavior and personality here."
      />
    </div>
  );
};

// --- CSS for SystemPromptWidget ---
// MODIFICATION: The entire CSS has been rewritten to be theme-aware and consistent.
const SystemPromptWidgetCSS = `
/* CSS for SystemPromptWidget, now fully theme-aware */

/* A consistent label style for all widgets */
.widget-label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
}

/* A consistent select/dropdown style */
.widget-select {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 1.5rem; /* Space between controls */
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-size: 0.9rem;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  /* A theme-aware CSS-only dropdown arrow */
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-secondary) 50%),
    linear-gradient(135deg, var(--text-secondary) 50%, transparent 50%);
  background-position: calc(100% - 20px) center, calc(100% - 15px) center;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  transition: all 0.2s ease;
}
.widget-select:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-active) 25%, transparent);
}

/* A consistent textarea style */
.widget-textarea {
  width: 100%;
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.9rem;
  line-height: 1.6;
  box-sizing: border-box;
  font-family: inherit;
  resize: vertical; /* Allow vertical resizing */
  min-height: 120px;
  transition: all 0.2s ease;
}
.widget-textarea:focus {
  outline: none;
  border-color: var(--accent-active);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-active) 25%, transparent);
}
.widget-textarea::placeholder {
  color: var(--text-secondary);
  opacity: 0.7;
}
`;
// --- Inject CSS ---
const styleTagPromptId = 'system-prompt-widget-styles';
if (!document.getElementById(styleTagPromptId)) {
    const styleTag = document.createElement("style");
    styleTag.id = styleTagPromptId;
    styleTag.type = "text/css";
    styleTag.innerText = SystemPromptWidgetCSS;
    document.head.appendChild(styleTag);
}
// --- End CSS Injection ---

export default SystemPromptWidget;