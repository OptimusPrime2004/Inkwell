// src/lib/gemini.ts - GEMINI ONLY VERSION

import { GoogleGenAI } from "@google/genai";

type ContentParts = any[]; 

// Access the required key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "PLACEHOLDER_KEY";

// --- Core Utility Function (Gemini Only) ---
export async function generateContent(
  modelName: "pro" | "flash",
  contents: ContentParts,
  systemInstruction?: string 
): Promise<string> {
  
  // 1. Check for the API Key
  if (GEMINI_API_KEY === "PLACEHOLDER_KEY" || !GEMINI_API_KEY) {
      return JSON.stringify({ error: "CRITICAL: No GEMINI_API_KEY found. Please add it to .env.local." });
  }

    try {
        // 2. Initialize the client and map the model
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        // Force all requests to use flash 2.0 model
        const modelString = "gemini-2.0-flash";

        // 3. Call the API
        const result = await ai.models.generateContent({ 
            model: modelString, 
            contents: contents,
            config: {
                // Pass the system instruction through the config object
                systemInstruction: systemInstruction,
            }
        });

        // Log the full result for debugging
        console.log("Gemini API raw result:", result);

                // Defensive: extract text from Gemini API response structure
                const candidate = result?.candidates?.[0];
                // Log the full candidate content for debugging
                console.log("Gemini candidate.content:", JSON.stringify(candidate?.content, null, 2));

                // Try to extract text from the most likely locations
                let text = undefined;
                if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
                    // Gemini API v1/v2: parts[0].text
                    text = candidate.content.parts[0]?.text;
                        } else if (candidate && typeof (candidate.content as any)?.text === "string") {
                            // Some Gemini responses: content.text
                            text = (candidate.content as any).text;
                }

                if (typeof text === "string" && text.length > 0) {
                    return text;
                } else if (candidate?.content) {
                    // Fallback: return stringified content for debugging
                    return JSON.stringify({ error: "Gemini API returned no text output. Dumping content.", content: candidate.content });
                } else {
                    return JSON.stringify({ error: "Gemini API returned no text output.", raw: result });
                }

    } catch (error) {
        // 5. Handle and return the error in a structured JSON format
        console.error("Gemini API Error:", error);
        return JSON.stringify({ error: `Failed to generate content from Gemini. Check: ${error instanceof Error ? error.message : String(error)}` });
    }
}