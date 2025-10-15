// src/lib/parser.ts - FINAL, ROBUST VERSION

import { Component, UIProject } from "./db-models";
import { load } from 'cheerio';

/**
 * Creates a unique component ID (simple UUID simulation).
 */
const generateId = () => Math.random().toString(36).substring(2, 9);


/**
 * Parses the raw JSX output from Gemini, identifies distinct components.
 * This version uses a highly tolerant regex to capture content inside the final return statement.
 * * @param rawCode The raw JSX string containing the GeneratedUI function.
 * @returns An array of structured Component objects.
 */
export function decomposeJSX(rawCode: string): Component[] {
    
    // Extract the return (...) JSX
    const componentRegex = /return\s*\(([^]*?)\)\s*;\s*\}/;
    const match = rawCode.match(componentRegex);
    if (!match || !match[1]) {
        console.error("Parser Error: Could not find or extract GeneratedUI content. Raw output was:", rawCode);
        const errorComponent: Component = {
            id: generateId(),
            name: "ErrorFallback",
            code: `<div className=\"text-red-500 p-8 border border-red-500 bg-red-900 rounded-lg text-center\"><p className=\"text-lg font-bold\">Parsing Failed: LLM Output Structure Error</p><p className=\"text-sm mt-2\">The AI output was malformed. Please try again or simplify the prompt.</p></div>`,
            elementType: 'div',
            lastUpdated: new Date(),
        };
        return [errorComponent];
    }
    const innerJSX = match[1].trim();

    // Use cheerio to parse the JSX/HTML and extract all elements with data-inkwell-id
    const $ = load(innerJSX, { xmlMode: false });
    const components: Component[] = [];
    $('[data-inkwell-id]').each((_, el) => {
        const id = $(el).attr('data-inkwell-id') || generateId();
        const tag = el.tagName || 'div';
        const code = $.html(el);
        components.push({
            id,
            name: tag.charAt(0).toUpperCase() + tag.slice(1),
            code,
            elementType: tag,
            lastUpdated: new Date(),
        });
    });
    // If nothing found, fallback to root as before
    if (components.length === 0) {
        let id = generateId();
        let elementType = 'div';
        const rootTagMatch = innerJSX.match(/^<([a-zA-Z0-9]+)[^>]*data-inkwell-id=["']([^"']+)["']/);
        if (rootTagMatch) {
            elementType = rootTagMatch[1];
            id = rootTagMatch[2];
        }
        components.push({
            id,
            name: "RootContainer",
            code: innerJSX,
            elementType,
            lastUpdated: new Date(),
        });
    }
    return components;
}

/**
 * Re-assembles the Component array back into a single JSX function string.
 * It wraps the content in a React.Fragment to support multiple root elements from the combined code.
 * * @param project The full UIProject object.
 * @returns The runnable code string for the iframe.
 */
export function assembleJSX(project: UIProject): string {
    const combinedCode = project.components.map(c => c.code).join('\n');
    
    // We add a reliable full-screen Tailwind wrapper here.
    return `
        function GeneratedUI() {
            return (
                // Wrapper to center content and ensure full screen height
                <div className="flex flex-col items-center justify-center min-h-screen p-8">
                    {/* 🛑 FINAL FIX: Adding h-auto and min-h-16 to guarantee dimensions */}
                    <div className="w-full max-w-md h-auto min-h-16"> 
                        <React.Fragment>
                            ${combinedCode}
                        </React.Fragment>
                    </div>
                </div>
            );
        }
    `;
}