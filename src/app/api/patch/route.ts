// src/app/api/patch/route.ts

import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini'; // Removed specific model imports
import { sanitizeCode } from '@/lib/sanitizer';
import { assembleJSX } from '@/lib/parser';
import { UIProject, Component } from '@/lib/db-models'; 

// --- CENTRALIZED SIMULATED DATABASE STATE (from generate route) ---
let currentProject: UIProject | null = (global as any).currentProject || null; 
const getSimulatedProject = () => currentProject;
const setSimulatedProject = (project: UIProject) => { currentProject = project; (global as any).currentProject = project; };
// --- END SIMULATED DB UTILITY ---

// Define the structure of the incoming patching request
interface PatchRequest {
  projectId: string;
  componentId: string;
  editPrompt: string;
  // screenshotBase64?: string; // Future Multimodal feature
}

const PATCH_SYSTEM_PROMPT = `
You are an ultra-fast, precise React and Tailwind CSS patching agent. 
Your only task is to take the provided EXISTING_COMPONENT_CODE and the USER_INSTRUCTION, 
apply the requested change, and output ONLY the complete, single, modified JSX code block.

RULES:
1. Output ONLY the raw JSX code block. Do not include markdown triple backticks (\`\`\`) or any surrounding text.
2. The component name MUST remain 'GeneratedUI' (even though it is just a snippet).
3. PRESERVE the existing 'data-inkwell-id' attributes. Do NOT change them.
4. Only modify code strictly necessary to fulfill the USER_INSTRUCTION.
5. All styling MUST use Tailwind classes.
`;

/**
 * Handles POST requests for component patching (iterative editing).
 * Route: /api/patch
 */
export async function POST(req: Request) {
  try {
    const { projectId, componentId, editPrompt } = (await req.json()) as PatchRequest;

    // 1. Validate and Retrieve Current State
    const project = getSimulatedProject();
    if (!project || project.projectId !== projectId) {
      return NextResponse.json({ error: "Project not found or invalid ID." }, { status: 404 });
    }

    const componentToPatch = project.components.find((c: Component) => c.id === componentId);
    if (!componentToPatch) {
      return NextResponse.json({ error: `Component with ID ${componentId} not found.` }, { status: 404 });
    }
    
    // 2. Construct Prompt (prepend system instructions for Gemini Flash)
    const textPrompt = `
${PATCH_SYSTEM_PROMPT}
EXISTING_COMPONENT_CODE:
\`\`\`jsx
${componentToPatch.code}
\`\`\`
USER_INSTRUCTION: ${editPrompt}
    `;

    const contents: any[] = [
      { role: "user", parts: [{ text: textPrompt }] },
    ];
    
    // 3. Call the fast Gemini Flash model using the string identifier
    const rawPatchCode = await generateContent("flash", contents);
    //                                          ^^^^^ UPDATED CALL

    if (rawPatchCode.startsWith('{"error"')) {
      return NextResponse.json(JSON.parse(rawPatchCode), { status: 500 });
    }

    // 4. Apply Security and Update State
    const sanitizedPatchCode = sanitizeCode(rawPatchCode.replace(/```(jsx|typescript|js)?\n?|```/gs, '').trim());
    
    // Update the component in the project state
    const updatedComponents = project.components.map((c: Component) => 
        c.id === componentId 
            ? { ...c, code: sanitizedPatchCode, lastUpdated: new Date() } 
            : c
    );

    const updatedProject: UIProject = {
        ...project,
        components: updatedComponents,
        fullCode: assembleJSX({ ...project, components: updatedComponents }),
        history: [...project.history, {
            timestamp: new Date(),
            description: `Patched component ${componentId}: ${editPrompt}`,
            model: "gemini-2.5-flash",
            patchId: Math.random().toString(36).substring(2, 5),
        }],
    };
    
    // 5. Save the new state and return
    setSimulatedProject(updatedProject);

    return NextResponse.json({ 
        project: updatedProject,
        fullCode: updatedProject.fullCode,
    }, { status: 200 });

  } catch (error) {
    console.error("Patch API Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error during patching." }, { status: 500 });
  }
}