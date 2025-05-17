import { OffscreenMessage } from './types';

// Global variable to track the active audio element
let activeAudio: HTMLAudioElement | null = null;

// Function to play audio from the API
function playAudioFromApi(text: string): void {
  console.log('Offscreen document playing audio for:', text);

  // Stop any currently playing audio
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  // Create a new audio element
  const encodedText = encodeURIComponent(text);
  const apiUrl = `https://localhost:3000/api/speech/stream?text=${encodedText}`;

  const audio = new Audio(apiUrl);
  activeAudio = audio;

  // Set up event handlers
  audio.onloadedmetadata = () => {
    // Send start event
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'start',
      utterance: text
    });
  };

  audio.onended = () => {
    console.log('Audio playback ended');

    // Send end event
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'end',
      utterance: text
    });

    // Clear the reference to the audio element
    if (activeAudio === audio) {
      activeAudio = null;
    }
  };

  audio.onerror = (error) => {
    console.error('Audio playback error:', error);

    // Send error event
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'error',
      utterance: text,
      errorMessage: `Error playing audio: ${error instanceof Event ? 'Unknown error' : error.toString()}`
    });

    // Clear the reference to the audio element
    if (activeAudio === audio) {
      activeAudio = null;
    }
  };

  // Start playing the audio
  audio.play().catch(error => {
    console.error('Failed to play audio:', error);

    // Send error event
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'error',
      utterance: text,
      errorMessage: `Failed to play audio: ${error.message || 'Unknown error'}`
    });

    // Clear the reference to the audio element
    if (activeAudio === audio) {
      activeAudio = null;
    }
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  console.log('Offscreen document received message:', message);

  if (message.target === 'offscreen') {
    if (message.type === 'playAudio' && message.text) {
      playAudioFromApi(message.text);
      sendResponse({ success: true });
    } else if (message.type === 'stopAudio') {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
      }
      sendResponse({ success: true });
    }
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Log when the offscreen document is loaded
console.log('Sherlock TTS offscreen document loaded');
