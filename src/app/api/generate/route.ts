// src/app/api/generate/route.ts - FINAL VERSION

import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini';
import { sanitizeCode } from '@/lib/sanitizer';
import { decomposeJSX, assembleJSX } from '@/lib/parser';
import { UIProject } from '@/lib/db-models'; 
import { saveProject, loadProject, clearProject } from '@/lib/persist';

// Define the structure of the incoming request body
interface GenerateRequest {
  prompt: string;
}

/**
 * Defines the strict system instructions for Gemini Pro. 
 * This is now passed as the dedicated systemInstruction parameter.
 */
const SYSTEM_PROMPT = `
You are an expert React and Tailwind CSS developer. Your task is to generate a single, complete, functional React functional component using ONLY Tailwind CSS.

RULES:
1. Output ONLY the raw JSX code block. Do not include markdown triple backticks (\`\`\`) or any surrounding text.
2. The code MUST be a single function named 'GeneratedUI'.
3. Every main element MUST include a unique 'data-inkwell-id'.
4. Do NOT use external imports or libraries.
5. All styling MUST use Tailwind classes.
6. 🛑 FINAL RULE: You MUST NOT use any JavaScript expressions or event handlers (like onClick or onSubmit) in the JSX. Keep all attributes simple strings.
`; 


/**
 * Handles POST requests for initial UI generation.
 * Route: /api/generate
 */
export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as GenerateRequest;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    // 1. 🛑 FIX: Contents array now ONLY contains the user prompt with the explicit role.
    const contents = [
      { role: "user", parts: [{ text: prompt }] }, // Only the user's message remains
    ];

    // 2. Call the powerful Gemini Pro model, passing the system prompt separately.
    const rawCode = await generateContent(
        "pro", 
        contents, 
        SYSTEM_PROMPT // ⬅️ NEW: Passed as the systemInstruction argument
    ); 

    if (rawCode.startsWith('{"error"')) {
        return NextResponse.json(JSON.parse(rawCode), { status: 500 });
    }

  // CRITICAL FIX 1: Strip all markdown fences and text (robust, multi-line, all positions)
  let cleanedCode = rawCode
    // Remove all code fences, even if surrounded by whitespace or newlines
    .replace(/```[a-zA-Z]*\n([\s\S]*?)```/g, '$1') // Remove ```lang ... ``` blocks
    .replace(/```/g, '') // Remove any remaining backticks
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
    // Remove export default and export statements
    .replace(/^export\s+default\s+\w+;?$/gm, '')
    .replace(/^export\s+\{[^}]*\};?$/gm, '')
    .replace(/^export\s+\w+;?$/gm, '')
    .trim();

  // 🛑 AUTO-FIX: Self-close common void elements for JSX compatibility (simple, safe version)
  cleanedCode = cleanedCode.replace(/<(input|img|br|hr|meta|link|area|base|col|embed|source|track|wbr)([^/>]*?)>/g, '<$1$2 />');

  // Extract only the function GeneratedUI block if present
  const funcMatch = cleanedCode.match(/function\s+GeneratedUI\s*\([\s\S]*?\{([\s\S]*?)\n\}/m);
  if (funcMatch) {
    // Rebuild the function with the correct signature and body
    cleanedCode = 'function GeneratedUI() {' + funcMatch[1] + '\n}';
  }
    
    // 🛑 ULTIMATE FINAL FIX: Aggressively remove known invalid characters/syntax.
    cleanedCode = cleanedCode
        // 1. Clean up malformed event handlers (like 'e.preventDefault()}')
        .replace(/e\.preventDefault\(\)\}\>\s*$/gm, '') 
        // 2. Clean up malformed arrow function remnants
        .replace(/\}\>\s*$/gm, '') 
        // 3. Convert common JSX-breaking HTML entities back to their characters
        .replace(/&gt;/g, '>')      // Fixes ">" entity
        .replace(/&lt;/g, '<')      // Fixes "<" entity
        .replace(/&amp;/g, '&')     // Fixes "&" entity
        .replace(/&#39;/g, "'")     // Fixes single quote entity
        .replace(/&quot;/g, '"')    // Fixes double quote entity
        .trim();
    


    // 4. Apply the critical security layer
    const sanitizedCode = sanitizeCode(cleanedCode);
   

    // 5. Decompose the code into components
    const newComponents = decomposeJSX(sanitizedCode);

  // 6. Create and store the new simulated project state
  const newProject: UIProject = {
    projectId: Math.random().toString(36).substring(2, 9), 
    title: prompt.substring(0, 50),
    initialPrompt: prompt,
    components: newComponents,
    fullCode: assembleJSX({ components: newComponents } as UIProject), // Use assembled code for patching/editing
    history: [{
      timestamp: new Date(),
      description: "Initial generation.",
      model: "gemini-2.5-pro",
      patchId: "initial",
    }],
    status: 'draft',
    createdAt: new Date(),
  };
    
  // Save the new project state persistently
  try {
    await saveProject(newProject);

    // 7. Return the project data
    return NextResponse.json({ 
      project: newProject,
      fullCode: cleanedCode, // Use cleaned function for preview only
    }, { status: 200 });
  } catch (error) {
    console.error("Failed to save project state:", error);
    return NextResponse.json({ error: "Failed to save project state" }, { status: 500 });
  }

  } catch (error) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error during generation." }, { status: 500 });
  }
}

// Optional: Add a GET route to retrieve the current project (for debugging/resuming)
export async function GET() {
  try {
    const currentProject = await loadProject();
    if (!currentProject) {
      return NextResponse.json({ error: "No active project found." }, { status: 404 });
    }
    return NextResponse.json({ project: currentProject, fullCode: currentProject.fullCode }, { status: 200 });
  } catch (error) {
    console.error("Failed to load project:", error);
    return NextResponse.json({ error: "Failed to load project state" }, { status: 500 });
  }
}