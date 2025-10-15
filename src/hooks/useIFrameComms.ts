// src/hooks/useIFrameComms.ts

import { useEffect, useRef, useState } from 'react';

// Define the expected message structure from the iframe
export interface IFrameMessage {
  type: 'ELEMENT_CLICK' | 'IFRAME_READY';
  elementId?: string; // The data-inkwell-id of the clicked element
  message?: string; 
}

// Define the communication hook for the parent component
export const useIFrameComms = () => {
  const [lastClickedElementId, setLastClickedElementId] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Handler function to receive messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      // 🛑 SECURITY CHECK: Always validate the origin of the message source.
      // In a real deployed environment, replace '*' with your sandbox URL:
      // if (event.origin !== "https://sandbox.inkwell.com") return;
      
      // For local development, we often use '*' or check the local host URL.
      // We will rely on the iframe's 'sandbox' attribute for safety on this local setup.
      
      const messageData = event.data as IFrameMessage;

      if (messageData && messageData.type === 'ELEMENT_CLICK' && messageData.elementId) {
        console.log(`Received click on ID: ${messageData.elementId}`);
        setLastClickedElementId(messageData.elementId);
      }
      
      if (messageData && messageData.type === 'IFRAME_READY') {
        console.log("IFrame content is loaded and ready for interaction.");
        // We could send initial configuration data back to the iframe here if needed
      }
    };

    // Attach the event listener to the window
    window.addEventListener('message', handleMessage);

    // Cleanup: Remove the event listener when the component unmounts
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Function to send a message *into* the iframe (e.g., to activate edit mode)
  const sendMessageToIframe = (message: any) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      // Target origin is set to '*' for simplicity in dev, but should be specific!
      iframeRef.current.contentWindow.postMessage(message, '*'); 
    }
  };

  return { lastClickedElementId, iframeRef, sendMessageToIframe, setLastClickedElementId };
};