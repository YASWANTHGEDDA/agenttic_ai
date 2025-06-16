// client/src/components/MermaidDiagram.js
import React, { useEffect } from 'react';
import mermaid from 'mermaid';
import { useTheme } from '../context/ThemeContext'; // Import our theme hook

// Initialize Mermaid ONCE when the module loads.
// This is more efficient than re-initializing on every render.
// The theme will be set dynamically in the effect.
mermaid.initialize({
    startOnLoad: false, // We will control the rendering manually
    // theme: 'dark', // Theme is now set dynamically below
    securityLevel: 'loose', // Required for dynamic rendering
    fontFamily: 'sans-serif',
    logLevel: 'info', // 'debug' for more details, 'info' for less
    mindmap: {
        padding: 15,
        // You can add more mindmap-specific configurations here
    },
});


const MermaidDiagram = ({ chart }) => {
    const { theme } = useTheme(); // Get the current theme ('light' or 'dark')

    useEffect(() => {
        if (chart) {
            // Re-initialize Mermaid with the correct theme every time the theme changes.
            // This ensures the diagram's theme matches the application's theme.
            // Note: A full re-init is heavy. A better approach for future improvement
            // might be to see if mermaid offers a theme-setting API without full re-initialization.
            // For now, this ensures correctness.
            mermaid.initialize({
                startOnLoad: false,
                theme: theme, // Use the dynamic theme from our context
                securityLevel: 'loose',
                fontFamily: 'sans-serif',
                logLevel: 'info',
                 mindmap: {
                    padding: 15,
                },
            });
            
            // Re-render the diagram. This is necessary after re-initialization.
            // The mermaid.run() function is designed to find all elements with the class 'mermaid'
            // and render them. It's the most reliable way to render in a dynamic framework like React.
            mermaid.run();
        }
    }, [chart, theme]); // Rerun this effect if either the chart data OR the theme changes.

    if (!chart) {
        return <div className="mermaid-error">No mind map data to display.</div>;
    }
    
    // We render a div with the class "mermaid".
    // Inside this div, we place the raw chart text.
    // The mermaid.run() function will find this div and replace its content with the rendered SVG.
    return (
        <div className="mermaid">
            {chart}
        </div>
    );
};

export default MermaidDiagram;