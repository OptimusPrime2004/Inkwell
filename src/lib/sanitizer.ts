// src/lib/sanitizer.ts

// ⚠️ NOTE: You must install 'jsdom' and 'dompurify' (npm install jsdom dompurify)
// to run this file in a Node/Next.js environment.

import * as DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Setup JSDOM environment for DOMPurify to run server-side
const window = new JSDOM('').window;
// @ts-ignore - Ignore type issues on the mocked window
const purifyFn = (DOMPurify as any).default || DOMPurify;  
const purify = purifyFn(window as unknown as Window);

/**
 * Sanitizes a raw code string (HTML/JSX) to remove malicious elements and attributes.
 * It is customized to allow UI-centric tags and Tailwind classes, while strictly
 * forbidding script execution.
 * @param rawCode The raw code string received from the LLM.
 * @returns The sanitized code string.
 */
export function sanitizeCode(rawCode: string): string {
  // Define allowed tags for React/Tailwind UI
  const allowedTags = [
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'a', 'img', 'button', 
    'input', 'form', 'label', 'ul', 'li', 'svg', 'path', 'header', 
    'footer', 'section', 'main', 'nav', 'br', 'hr'
  ];

  // Define allowed attributes, specifically forbidding 'on*' event handlers
  const allowedAttributes = [
    'class', 'style', 'id', 'src', 'alt', 'href', 'role', 'type', 
    'placeholder', 'value', 'aria-hidden', 'viewBox', 
    'data-inkwell-id', // CRITICAL: Our component identifier
    'tabindex' 
  ];

  const cleanedCode = purify.sanitize(rawCode, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    // Strict policies to prevent code execution
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style'],
    // Blacklist common event handlers
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onchange', 'onfocus', 'onblur', 'xmlns:xlink'],
    // Ensure data-attributes (for custom editing logic) are generally allowed
    ALLOW_DATA_ATTR: true,
  });

  return cleanedCode;
}