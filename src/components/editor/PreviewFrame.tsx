// src/components/editor/PreviewFrame.tsx

import React, { forwardRef, Ref } from 'react';
import { useIFrameComms } from '@/hooks/useIFrameComms';

interface PreviewFrameProps {
  /** The full, sanitized JSX code string from the API. */
  jsxCode: string;
}

/**
 * Script injected into the iframe content to enable element selection.
 * It listens for clicks and sends the data-inkwell-id back to the parent window.
 */
const INJECTED_SCRIPT = `
  // Immediately flag the iframe as ready to the parent
  window.parent.postMessage({ type: 'IFRAME_READY', message: 'Content script loaded' }, '*');
  
  // Event listener for user clicks inside the generated UI
  document.addEventListener('click', function(e) {
    // Find the nearest ancestor with our custom component ID
    const targetElement = e.target.closest('[data-inkwell-id]');
    
    if (targetElement) {
      e.preventDefault();
      e.stopPropagation();
      
      const elementId = targetElement.getAttribute('data-inkwell-id');
      
      // Send the element ID back to the main application via postMessage
      if (elementId) {
        window.parent.postMessage({ 
          type: 'ELEMENT_CLICK', 
          elementId: elementId 
        }, '*'); 
      }
    }
  });
`;

/**
 * Wraps the generated JSX code into a complete, runnable HTML document.
 * Includes Tailwind CSS setup and the React/Babel environment.
 * @param jsxContent The GeneratedUI component code.
 * @returns A full HTML string ready for srcDoc.
 */
const createIFrameContent = (jsxContent: string) => {
  // Use a simple CDN for Tailwind and React in the sandbox for easy setup.
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>AI Generated UI Preview</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
        <style>
          body { 
            margin: 0; 
            background-color: white !important;
            color: #1f2937;
            min-height: 100vh;
          }
          #root {
            height: 100%;
            width: 100%;
          }
          #error-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,0,0,0.1);
            color: #b91c1c;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            padding: 2rem;
            pointer-events: all;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <div id="error-overlay" style="display:none"></div>
        <script type="text/babel">
          // 1. The code for the GeneratedUI component (as a string)
          try {
            ${jsxContent}
            const container = document.getElementById('root');
            const root = ReactDOM.createRoot(container);
            if (typeof GeneratedUI === 'function') {
              root.render(<GeneratedUI />);
            } else {
              throw new Error('GeneratedUI function is not defined. The AI output may be malformed or missing the function.');
            }
          } catch (err) {
            const overlay = document.getElementById('error-overlay');
            overlay.style.display = 'flex';
            overlay.innerHTML = '<div><b>Preview Error:</b><br>' + (err && err.message ? err.message : err) + '</div>';
          }
        </script>
        <script>
          // 3. Inject the click listener script to enable editing
          ${INJECTED_SCRIPT}
        </script>
      </body>
    </html>
  `;
};

/**
 * PreviewFrame component is wrapped in forwardRef to accept a ref from the parent
 * and forward it to the internal <iframe> element.
 */
export const PreviewFrame = forwardRef<HTMLIFrameElement, PreviewFrameProps>(({ jsxCode }, ref) => {
  // We use the useIFrameComms hook to access the last clicked element ID
  const { lastClickedElementId } = useIFrameComms();
  
  // If no code, show a placeholder screen
  if (!jsxCode) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 border border-gray-700 rounded-lg">
        <p className="text-gray-400">
          Enter a prompt to generate your first UI component...
        </p>
      </div>
    );
  }

  // Generate the full HTML content string
  const htmlContent = createIFrameContent(jsxCode);

  return (
    <div className="relative w-full h-full bg-gray-800 rounded-lg shadow-xl">
      <iframe
        ref={ref} // ⬅️ The fix: The forwarded ref is passed to the internal <iframe>
        srcDoc={htmlContent}
        className="w-full h-full border-none rounded-lg"
        // CRITICAL SECURITY: Sandboxing
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        title="AI UI Preview Sandbox"
      />
      {lastClickedElementId && (
        <div className="absolute top-2 right-2 p-2 bg-yellow-500 text-sm font-semibold text-gray-900 rounded-md">
          Editing: {lastClickedElementId}
        </div>
      )}
    </div>
  );
});