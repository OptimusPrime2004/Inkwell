// src/app/api/patch/route.ts

import { NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini'; // Removed specific model imports
import { sanitizeCode } from '@/lib/sanitizer';
import { assembleJSX } from '@/lib/parser';
import { UIProject, Component } from '@/lib/db-models'; 
import { saveProject, loadProject } from '@/lib/persist';
import { load } from 'cheerio';

// Define the structure of the incoming patching request
interface PatchRequest {
  projectId: string;
  componentId: string;
  editPrompt: string;
  // screenshotBase64?: string; // Future Multimodal feature
}

const PATCH_SYSTEM_PROMPT = `You are an ultra-fast, precise React and Tailwind CSS patching agent.
You will be given EXISTING_COMPONENT_CODE (a React element or component) and a USER_INSTRUCTION.
Your job is to modify the component according to the instruction while preserving its structure.

CRITICAL RULES:
1. Return ONLY the element or component that needs to change. Do NOT wrap it in a function unless explicitly asked.
2. PRESERVE THE EXACT STRUCTURE of the element, including its tag type and all attributes.
3. PRESERVE data-inkwell-id EXACTLY - this is used to identify the element.
4. When modifying className:
   - Keep all existing classes unless explicitly told to remove them
   - Add new Tailwind classes at the end of className
   - Ensure classes are space-separated and valid
5. Do NOT change any HTML attributes (type, htmlFor, etc.) unless specifically asked.
6. If the input is a function component, maintain its exact structure.
7. NO markdown, NO backticks, NO comments - ONLY the JSX/TSX code.`;

/**
 * Handles POST requests for component patching (iterative editing).
 * Route: /api/patch
 */
export async function POST(req: Request) {
  try {
    // 1. Parse request and load project
    const { projectId, componentId, editPrompt } = await req.json() as PatchRequest;
    const project = await loadProject();
    
    if (!project || project.projectId !== projectId) {
      return NextResponse.json({ error: "Project not found or invalid ID." }, { status: 404 });
    }

    // 2. Find and extract target component
    const componentToPatch = project.components.find((c) => 
      c.id === componentId || c.code.includes(`data-inkwell-id="${componentId}"`)
    );

    if (!componentToPatch) {
      return NextResponse.json({ error: `Component with ID ${componentId} not found.` }, { status: 404 });
    }

    // 3. Extract nested element if needed and preserve styles
    let targetComponent = componentToPatch;
    let preservedClassName: string | undefined;

    if (componentToPatch.id !== componentId) {
      const $ = load(componentToPatch.code);
      const targetElement = $(`[data-inkwell-id="${componentId}"]`);
      if (targetElement.length > 0) {
        preservedClassName = targetElement.attr('className');
        targetComponent = {
          ...componentToPatch,
          id: componentId,
          code: $.html(targetElement),
          elementType: targetElement[0].tagName || 'div'
        };
      }
    }

    // 4. Generate patch
    const textPrompt = `${PATCH_SYSTEM_PROMPT}
COMPONENT_INFO:
- Component ID: ${componentId}
- IMPORTANT: You must preserve this data-inkwell-id attribute in your output.

EXISTING_COMPONENT_CODE:
\`\`\`jsx
${targetComponent.code}
\`\`\`
USER_INSTRUCTION: ${editPrompt}

Remember: The component's data-inkwell-id="${componentId}" must be preserved exactly in the output.`;

    const contents = [{ role: "user", parts: [{ text: textPrompt }] }];
    const rawPatchCode = await generateContent("pro", contents);

    if (rawPatchCode.startsWith('{"error"')) {
      return NextResponse.json(JSON.parse(rawPatchCode), { status: 500 });
    }

    // 5. Process patch code
    const sanitizedPatchCode = sanitizeCode(rawPatchCode.replace(/```(jsx|typescript|js)?\n?|```/gs, '').trim());
    if (!sanitizedPatchCode.includes(`data-inkwell-id="${componentId}"`)) {
      console.error("Patch Error: Component ID not preserved", { componentId });
      return NextResponse.json({ error: "Generated code is missing required component ID." }, { status: 500 });
    }

    // 6. Parse patch into components
    const { decomposeJSX } = await import('@/lib/parser');
    const patchedComponents = decomposeJSX(sanitizedPatchCode);
    const patchedComponent = patchedComponents[0];

    if (!patchedComponent?.code) {
      console.error("Parse Error: No valid component found in patch");
      return NextResponse.json({ error: "Failed to parse patched component" }, { status: 500 });
    }

    // 7. Apply style preservation if needed
    let finalPatchedCode = patchedComponent.code;
    if (preservedClassName) {
      const $ = load(patchedComponent.code);
      const element = $(`[data-inkwell-id="${componentId}"]`);
      if (element.length > 0) {
        const newClasses = element.attr('className') || '';
        const mergedClasses = `${preservedClassName} ${newClasses}`.trim();
        element.attr('className', mergedClasses);
        finalPatchedCode = $.html(element);
      }
    }

    // 8. Update project state
    const updatedComponents = project.components.map((c) => {
      if (c.id === componentId) {
        return { ...c, code: finalPatchedCode, lastUpdated: new Date() };
      }
      return c;
    });

    const fullCode = assembleJSX({ ...project, components: updatedComponents });
    if (!fullCode.includes('function GeneratedUI()')) {
      console.error("Assembly Error: Missing function definition");
      return NextResponse.json({ error: "Generated code is invalid" }, { status: 500 });
    }

    const updatedProject: UIProject = {
      ...project,
      components: updatedComponents,
      fullCode,
      history: [...project.history, {
        timestamp: new Date(),
        description: `Patched component ${componentId}: ${editPrompt}`,
        model: "gemini-2.5-pro",
        patchId: Math.random().toString(36).substring(2, 5),
      }],
    };

    // 9. Save changes and respond
    await saveProject(updatedProject);
    
    return NextResponse.json({ 
      project: updatedProject,
      fullCode: updatedProject.fullCode,
    });
  } catch (error) {
    console.error("Patch API Error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
      if (patchedComponents[0] && patchedComponents[0].code && patchContainsId) {
        return { ...c, code: patchedComponents[0].code, lastUpdated: new Date() };
      } else {
        console.error('Patch validation failed:', {
          hasComponent: Boolean(patchedComponents[0]),
          hasCode: Boolean(patchedComponents[0]?.code),
          hasCorrectId: patchContainsId
        });
        return { ...c, code: c.code + '\n<!-- PATCH ERROR: Generated code was invalid or missing required ID. Previous code retained. -->', lastUpdated: new Date() };
      }
    }
    return c;
  });

    // Assemble and validate the full code
    const fullCode = assembleJSX({ ...project, components: updatedComponents });
    if (!fullCode.includes('function GeneratedUI()')) {
      console.error("Assembly Error: Generated code is missing function definition");
      return NextResponse.json({ error: "Generated code is invalid. Missing function definition." }, { status: 500 });
    }
    
    const updatedProject: UIProject = {
    ...project,
    components: updatedComponents,
    fullCode,
    history: [...project.history, {
      timestamp: new Date(),
      description: `Patched component ${componentId}: ${editPrompt}`,
      model: "gemini-2.5-flash",
      patchId: Math.random().toString(36).substring(2, 5),
    }],
  };
  // Log the full assembled code for debugging
  console.log('Full assembled code after patch:', updatedProject.fullCode);
  
  // 5. Save the new state and return
  try {
    await saveProject(updatedProject);
    
    return NextResponse.json({ 
      project: updatedProject,
      fullCode: updatedProject.fullCode,
    }, { status: 200 });
  } catch (error) {
    console.error("Failed to save project state:", error);
    return NextResponse.json({ error: "Failed to save project state" }, { status: 500 });
  }
} catch (error) {
    console.error("Patch API Route Error:", error);
      return NextResponse.json({ error: "Internal Server Error during patching." }, { status: 500 });
    }
  }