// src/app/api/patch/route.ts - DEBUGGED AND CLEANED VERSION

import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini';
import { sanitizeCode } from '@/lib/sanitizer';
import { assembleJSX, decomposeJSX } from '@/lib/parser'; // Ensure decomposeJSX is imported
import { UIProject, Component } from '@/lib/db-models'; 
import { saveProject, loadProject } from '@/lib/persist'; // Assuming these functions are implemented
import { load } from 'cheerio'; // Ensure Cheerio is installed and used correctly

// Define the structure of the incoming patching request
interface PatchRequest {
  projectId: string;
  componentId: string;
  editPrompt: string;
  // screenshotBase64?: string; // Future Multimodal feature
}

// NOTE: This prompt is too long and complex to define inside the function.
// It is moved outside as a constant.
const PATCH_SYSTEM_PROMPT = `You are an ultra-fast, precise React and Tailwind CSS patching agent.
You will be given EXISTING_COMPONENT_CODE (a React element or component) and a USER_INSTRUCTION.
Your job is to modify the component according to the instruction while preserving its structure.

CRITICAL RULES:
1. Return ONLY the element or component that needs to change. Do NOT wrap it in a function.
2. PRESERVE THE EXACT STRUCTURE of the element, including its tag type and all attributes.
3. PRESERVE data-inkwell-id EXACTLY - this is used to identify the element.
4. When modifying className: KEEP existing classes unless told to remove them. ADD new classes at the end.
5. Do NOT change any HTML attributes (type, htmlFor, etc.) unless specifically asked.
6. NO markdown, NO backticks, NO comments - ONLY the JSX/TSX code.`;

/**
 * Handles POST requests for component patching (iterative editing).
 * Route: /api/patch
 */
export async function POST(req: Request) {
  try {
    // 1. Parse request and load project state
    const { projectId, componentId, editPrompt } = await req.json() as PatchRequest;
    
    // Assuming loadProject retrieves the simulated/persisted state
    const project: UIProject = await loadProject(); 
    
    if (!project || project.projectId !== projectId) {
      return NextResponse.json({ error: "Project not found or invalid ID." }, { status: 404 });
    }

    // Find and extract target component, supporting nested elements
    const componentToPatch = project.components.find((c) => 
      c.id === componentId || c.code.includes(`data-inkwell-id="${componentId}"`)
    );

    if (!componentToPatch) {
      return NextResponse.json({ error: `Component with ID ${componentId} not found.` }, { status: 404 });
    }

    // 2. Prepare Code and Context for the LLM
    let targetCodeToSend: string;
    let originalComponentId = componentToPatch.id;
    
    // Use Cheerio to extract the precise element code if the user clicked a NESTED element.
    if (componentToPatch.id !== componentId) {
      const $ = load(componentToPatch.code);
      const targetElement = $(`[data-inkwell-id="${componentId}"]`);
      if (targetElement.length === 0) {
        return NextResponse.json({ error: `Nested element with ID ${componentId} not found.` }, { status: 404 });
      }
      targetCodeToSend = $.html(targetElement);
    } else {
      // If it's a top-level component, send the whole code block.
      targetCodeToSend = componentToPatch.code;
    }

    // 3. Construct the LLM Prompt
    const fullPrompt = `${PATCH_SYSTEM_PROMPT}

EXISTING_COMPONENT_CODE:
\`\`\`jsx
${targetCodeToSend}
\`\`\`
USER_INSTRUCTION: ${editPrompt}

IMPORTANT: You MUST return ONLY the modified component code for the element with data-inkwell-id="${componentId}".`;

    const contents = [{ role: "user", parts: [{ text: fullPrompt }] }];
    
    // 4. Call the LLM (Using 'pro' for complex patching is safer than 'flash')
    const rawPatchCode = await generateContent("pro", contents); 

    if (rawPatchCode.startsWith('{"error"')) {
      return NextResponse.json(JSON.parse(rawPatchCode), { status: 500 });
    }

    // 5. Process and Validate Patch Code
    // Apply the same aggressive cleaning as the generate route for stability
    let sanitizedPatchCode = sanitizeCode(
        rawPatchCode
            .replace(/```(jsx|typescript|js)?\n?|```/gs, '')
            .replace(/e\.preventDefault\(\)\}\>\s*$/gm, '') 
            .replace(/\}\>\s*$/gm, '') 
            .replace(/&gt;/g, '>').replace(/&lt;/g, '<')
            .trim()
    );

    // CRITICAL VALIDATION: Check if the LLM preserved the ID
    if (!sanitizedPatchCode.includes(`data-inkwell-id="${componentId}"`)) {
      console.error("Patch Validation Failed: Component ID not preserved.");
      return NextResponse.json({ error: "LLM failed to preserve component ID. Please rephrase instruction." }, { status: 500 });
    }
    
    // 6. Update Project State (Surgical Update)
    const updatedComponents = project.components.map((c) => {
      // Only replace the original top-level component if the clicked ID belongs to it.
      if (c.id === originalComponentId || c.code.includes(`data-inkwell-id="${componentId}"`)) {
          
        // Use Cheerio to surgically replace the nested element in the original top-level component's code
        const $ = load(c.code);
        const elementToReplace = $(`[data-inkwell-id="${componentId}"]`);
        
        if (elementToReplace.length > 0) {
            // Replace the old HTML with the new patched HTML
            elementToReplace.replaceWith(sanitizedPatchCode);
            
            return { 
                ...c, 
                code: $.html(), // Save the HTML of the entire top-level component
                lastUpdated: new Date() 
            };
        }
      }
      return c; // Return unchanged component
    });

    // 7. Finalize and Save
    const updatedProject: UIProject = {
      ...project,
      components: updatedComponents,
      fullCode: assembleJSX({ ...project, components: updatedComponents }),
      history: [...project.history, {
        timestamp: new Date(),
        description: `Patched element ${componentId}: ${editPrompt}`,
        model: "gemini-2.5-pro",
        patchId: Math.random().toString(36).substring(2, 5),
      }],
    };

    await saveProject(updatedProject);
    
    return NextResponse.json({ 
      project: updatedProject,
      fullCode: updatedProject.fullCode,
    }, { status: 200 });

  } catch (error) {
    console.error("Patch API Error:", error);
    return NextResponse.json({ 
      error: "Internal server error during patching.",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}