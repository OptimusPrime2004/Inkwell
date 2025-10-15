// src/app/(main)/page.tsx

"use client";

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { PreviewFrame } from '@/components/editor/PreviewFrame';
import { useIFrameComms } from '@/hooks/useIFrameComms'; 

// Define the structure of the API response (now returning the full project)
interface ProjectResponse {
  project: {
    projectId: string;
    fullCode: string;
    // We only need the code and ID for the frontend logic
  };
  fullCode: string; // The runnable code for the iframe
}

interface AppState {
    projectId: string | null; // Track the current project ID
    prompt: string;
    jsxCode: string;
    isLoading: boolean;
    error: string | null;
}

// ⚠️ CORRECTED: Defined as a standard function, then exported at the bottom.
function InkwellEditor() {
    // INTEGRATE HOOKS
    const { iframeRef, lastClickedElementId, setLastClickedElementId } = useIFrameComms();
    
    // Application State
    const [appState, setAppState] = useState<AppState>({
        projectId: null,
        prompt: "A modern login form with a dark mode header and a submit button.",
        jsxCode: "",
        isLoading: false,
        error: null,
    });
    
    // Edit State
    const [editPrompt, setEditPrompt] = useState<string>('');

    // Derived State: Are we in Edit Mode?
    const isEditMode = useMemo(() => lastClickedElementId !== null, [lastClickedElementId]);

    // Effect to clear the edit prompt when entering/exiting edit mode
    useEffect(() => {
        if (!isEditMode) {
            setEditPrompt('');
        }
    }, [isEditMode]);


    // --- Core API Call Function ---
    const handleApiCall = useCallback(async (isInitialGenerate: boolean) => {
        if (appState.isLoading) return;
        
        const currentPrompt = isInitialGenerate ? appState.prompt : editPrompt;
        if (!currentPrompt) {
            setAppState(s => ({ ...s, error: "Prompt is required." }));
            return;
        }

        setAppState(s => ({ ...s, isLoading: true, error: null }));
        
        try {
            const endpoint = isInitialGenerate ? '/api/generate' : '/api/patch';
            const bodyData: any = isInitialGenerate 
                ? { prompt: currentPrompt }
                : { 
                    projectId: appState.projectId,
                    componentId: lastClickedElementId,
                    editPrompt: currentPrompt,
                    // screenshotBase64: ... (Future: logic to capture image data)
                };

            if (!isInitialGenerate && (!appState.projectId || !lastClickedElementId)) {
                throw new Error("Cannot patch: Project or selected component is missing.");
            }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData),
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                // If project not found, auto-reset state and prompt user to generate new project
                if (data.error && data.error.toLowerCase().includes('project not found')) {
                    setAppState(s => ({
                        ...s,
                        projectId: null,
                        jsxCode: '',
                        isLoading: false,
                        error: 'Project not found. Please generate a new UI before editing or patching.'
                    }));
                    setEditPrompt('');
                    setLastClickedElementId(null);
                    return;
                }
                throw new Error(data.error || `Operation failed via ${endpoint}.`);
            }

            const result = data as ProjectResponse;

            setAppState(s => ({ 
                ...s, 
                jsxCode: result.fullCode, // Update with the new full code
                projectId: result.project.projectId,
                isLoading: false, 
                error: null 
            }));
            
            // Clear edit prompt after successful patch
            setEditPrompt('');
            setLastClickedElementId(null); // Exit edit mode after patch

        } catch (err: any) {
            console.error("Fetch Error:", err);
            setAppState(s => ({ 
                ...s, 
                isLoading: false, 
                error: err.message || "An unknown error occurred during AI processing." 
            }));
        }
    }, [appState.isLoading, appState.prompt, appState.projectId, editPrompt, lastClickedElementId, setLastClickedElementId]);

    // Button click handler determines if it's a patch or a fresh generation
    const handleAction = () => {
        if (isEditMode) {
            handleApiCall(false); // Call the PATCH route
        } else {
            handleApiCall(true);  // Call the GENERATE route
        }
    }


    // --- RENDERING LOGIC ---
    // Clean the JSX code of markdown code fences before rendering
    const cleanedJsxCode = appState.jsxCode
        ? appState.jsxCode.replace(/```(jsx|typescript|js)?\n?|```/gs, '').trim()
        : '';

    return (
        <div className="flex flex-col h-screen p-4 bg-gray-900 text-white">
            <header className="mb-4">
                <h1 className="text-3xl font-bold text-blue-400">Inkwell 2.0 ✨</h1>
                <p className="text-sm text-gray-400">AI-Powered Component Generation & Patching</p>
            </header>

            {/* Top Prompt and Control Bar */}
            <div className="flex space-x-4 mb-4">
                <input
                    type="text"
                    className={`flex-grow p-3 rounded-lg border text-white focus:ring-blue-500 focus:border-blue-500 transition duration-200 ${
                        isEditMode ? 'bg-yellow-900 border-yellow-600' : 'bg-gray-800 border-gray-700'
                    }`}
                    placeholder={isEditMode ? `Refine element ${lastClickedElementId}... (e.g., 'Make it green')` : "Describe the UI component you want to build..."}
                    value={isEditMode ? editPrompt : appState.prompt}
                    onChange={(e) => isEditMode ? setEditPrompt(e.target.value) : setAppState(s => ({ ...s, prompt: e.target.value }))}
                    disabled={appState.isLoading}
                />
                
                <button
                    onClick={handleAction}
                    disabled={appState.isLoading || (isEditMode && !editPrompt)}
                    className={`px-6 py-3 rounded-lg font-semibold transition duration-150 ${
                        appState.isLoading 
                            ? 'bg-gray-600 cursor-not-allowed' 
                            : isEditMode 
                                ? 'bg-emerald-600 hover:bg-emerald-700' 
                                : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                    {appState.isLoading 
                        ? 'Processing...' 
                        : isEditMode 
                            ? `Patch Component (Flash)` 
                            : 'Generate UI (Pro)'
                    }
                </button>
            </div>

            {/* Error Display */}
            {appState.error && (
                <div className="p-3 mb-4 text-red-400 bg-red-900 bg-opacity-30 border border-red-700 rounded-lg">
                    Error: {appState.error}
                </div>
            )}
            
            {/* The Main Workspace (Preview) */}
            <main className="flex-grow min-h-0">
                <PreviewFrame 
                    jsxCode={cleanedJsxCode} 
                    ref={iframeRef} // The ref is correctly passed now
                />
            </main>
            
            {/* Footer and Controls */}
            <footer className="mt-4 p-4 bg-gray-800 rounded-lg flex justify-between items-center">
                <div className="text-sm text-gray-400">
                    {appState.jsxCode ? `Project ID: ${appState.projectId || 'N/A'}. Last Model: ${isEditMode ? 'Gemini Flash' : 'Gemini Pro'}` : 'Ready to start.'}
                </div>
                <div className="space-x-2">
                    <button className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold"
                        onClick={() => appState.jsxCode && navigator.clipboard.writeText(appState.jsxCode).then(() => alert("Code copied to clipboard!"))}
                        disabled={!appState.jsxCode}
                    >
                        Export Code
                    </button>
                    <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold"
                        onClick={() => alert("History/Undo feature placeholder")}>
                        History
                    </button>
                </div>
            </footer>
        </div>
    );
}

// ⚠️ CORRECTED: Export the function as the default
export default InkwellEditor;