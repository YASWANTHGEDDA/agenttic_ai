// client/src/components/AnalysisResultModal.js
import React, { useState, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiX, FiCopy } from 'react-icons/fi';

import './AnalysisResultModal.css';
import MermaidDiagram from './MermaidDiagram';

const AnalysisResultModal = ({ isOpen, onClose, analysisData }) => {
    // ==================================================================
    //  START OF FIX: All React Hooks are now at the top level.
    // ==================================================================
    const [isCopied, setIsCopied] = useState(false);

    // This hook manages the body scroll style.
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setIsCopied(false); // Reset copy state when modal opens
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // This hook memoizes the handleCopy function. It is now at the top level.
    const handleCopy = useCallback(() => {
        // We use optional chaining `?.` because analysisData might be null initially.
        if (analysisData?.result) {
            navigator.clipboard.writeText(analysisData.result).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
                alert('Failed to copy text.');
            });
        }
    }, [analysisData?.result]); // Dependency array also uses optional chaining.
    // ==================================================================
    //  END OF FIX
    // ==================================================================

    // The early return can now safely happen AFTER all hooks have been called.
    if (!isOpen || !analysisData) {
        return null;
    }

    // Destructure props after the early return, as we know they exist here.
    const { type, result, thinking, documentName } = analysisData;

    const renderResult = () => {
        if (type === 'mindmap' && result) {
            const convertMarkdownToMermaid = (markdown) => {
                const lines = markdown.split('\n');
                let mermaidSyntax = 'mindmap\n';
                lines.forEach(line => {
                    const trimmedLine = line.trim();
                    if (trimmedLine) {
                        const indentation = ' '.repeat(line.search(/\S/));
                        const text = trimmedLine.replace(/^- \*/, '').trim();
                        mermaidSyntax += `${indentation}  ${text}\n`;
                    }
                });
                return mermaidSyntax;
            };

            let chartText = result;
            if (!result.trim().startsWith('mindmap')) {
                chartText = convertMarkdownToMermaid(result);
            }
            return <MermaidDiagram chart={chartText} />;
        }
        return (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {result || "No analysis result provided."}
            </ReactMarkdown>
        );
    };

    const isCopyDisabled = isCopied || type === 'mindmap' || !result;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">
                        {type ? `${type.charAt(0).toUpperCase() + type.slice(1)}` : 'Analysis'} Results
                    </h3>
                    <button onClick={onClose} className="modal-close-button" title="Close">
                        <FiX size={24} />
                    </button>
                </div>
                <div className="modal-body">
                    <p className="modal-document-name">File: {documentName || 'Document'}</p>
                    {thinking && (
                        <details className="modal-thinking-details">
                            <summary>View Thinking Process</summary>
                            <pre>{thinking}</pre>
                        </details>
                    )}
                    <div className="modal-result-container">
                        {renderResult()}
                    </div>
                </div>
                <div className="modal-footer">
                    <button
                        onClick={handleCopy}
                        className="modal-secondary-button"
                        disabled={isCopyDisabled}
                    >
                        <FiCopy size={16} style={{ marginRight: '8px' }} />
                        {isCopied ? 'Copied!' : 'Copy'}
                    </button>
                    <button onClick={onClose} className="modal-action-button">Close</button>
                </div>
            </div>
        </div>
    );
};

export default AnalysisResultModal;