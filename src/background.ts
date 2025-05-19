import {
  BackgroundMessage,
  TTSSettings,
  DEFAULT_SETTINGS
} from './types';

// Global variables to track state
let isSpeaking = false;
let currentUtterance: string | null = null;
let currentSendTtsEventId: number | null = null;
let currentVoice: string | null = null;
let currentSpeed: number | null = null;
let currentPitch: number | null = null;

// Listen for messages from popup and offscreen document
chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  console.log('Background script received message:', message);

  if (message.type === 'speechEnded') {
    // Speech has ended in the popup
    if (isSpeaking && currentUtterance === message.utterance) {
      // Send end event to Chrome TTS
      if (currentSendTtsEventId) {
        chrome.ttsEngine.sendTtsEvent(
          currentSendTtsEventId,
          { type: 'end', charIndex: currentUtterance.length }
        );
      }

      // Reset state
      isSpeaking = false;
      currentUtterance = null;
      currentSendTtsEventId = null;

      // Notify popup about playback status change
      chrome.runtime.sendMessage({
        type: 'playbackStatus',
        state: 'idle'
      });
    }
  } else if (message.type === 'speechError') {
    // Speech error in the popup
    if (isSpeaking) {
      // Send error event to Chrome TTS
      if (currentSendTtsEventId) {
        chrome.ttsEngine.sendTtsEvent(
          currentSendTtsEventId,
          {
            type: 'error',
            errorMessage: message.errorMessage || 'Unknown error'
          }
        );
      }

      // Reset state
      isSpeaking = false;
      currentUtterance = null;
      currentSendTtsEventId = null;

      // Notify popup about playback status change
      chrome.runtime.sendMessage({
        type: 'playbackStatus',
        state: 'idle'
      });
    }
  } else if (message.type === 'getPlaybackInfo') {
    // Popup is requesting playback info
    sendResponse({
      isSpeaking: isSpeaking,
      utterance: currentUtterance,
      sendTtsEventId: currentSendTtsEventId,
      voice: currentVoice,
      speed: currentSpeed,
      pitch: currentPitch
    });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'checkModelStatus') {
    // Check model status by sending a message to the offscreen document
    (async () => {
      try {
        // Ensure we have an offscreen document
        await ensureOffscreenDocument();

        // Send a message to the offscreen document to check model status
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'checkModelStatus'
        });

        // The response will be handled by the offscreen document
        // which will send a modelStatus message back to the popup
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error checking model status:', error);
        sendResponse({ success: false, error });
      }
    })();
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'playTextWithTTS') {
    // Play text with TTS
    (async () => {
      try {
        // Store voice, speed, and pitch settings
        currentVoice = message.voice || null;
        currentSpeed = message.speed || null;
        currentPitch = message.pitch || null;

        await readTextWithCustomTTS(message.text, message.voice, message.speed, message.pitch);

        // Set the current state
        isSpeaking = true;
        currentUtterance = message.text;
        currentSendTtsEventId = message.sendTtsEventId || null;

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'playing'
        });

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Error playing text with TTS:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })();
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'pausePlayback') {
    // Pause playback
    (async () => {
      try {
        // Ensure we have an offscreen document
        await ensureOffscreenDocument();

        // Send message to offscreen document to pause audio
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'pauseAudio'
        });

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'paused'
        });

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Error pausing playback:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })();
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'resumePlayback') {
    // Resume playback
    (async () => {
      try {
        // Ensure we have an offscreen document
        await ensureOffscreenDocument();

        // Send message to offscreen document to resume audio
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'resumeAudio'
        });

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'playing'
        });

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Error resuming playback:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })();
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'stopPlayback') {
    // Stop playback
    (async () => {
      try {
        // Ensure we have an offscreen document
        await ensureOffscreenDocument();

        // Send message to offscreen document to stop audio
        await chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'stopAudio'
        });

        // Reset state
        isSpeaking = false;
        currentUtterance = null;
        currentSendTtsEventId = null;

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'idle'
        });

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Error stopping playback:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    })();
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'modelStatus') {
    // Model status update from offscreen document
    console.log('Received model status update:', message);

    if (message.status === 'ready') {
      console.log('Kokoro model is ready');
      chrome.contextMenus.update("readSelectedText", { enabled: true });
    } else if (message.status === 'error') {
      console.error('Error loading Kokoro model:', message.errorMessage);
      chrome.contextMenus.update("readSelectedText", { enabled: false });
    }
    // No need to handle 'download_required' as model is always bundled
  } else if (message.type === 'ttsEvent') {
    // TTS event from offscreen document
    console.log('Received TTS event from offscreen document:', message);

    if (message.eventType === 'end') {
      // Speech has ended
      if (isSpeaking && currentUtterance === message.utterance) {
        // Send end event to Chrome TTS if this was triggered by the TTS API
        if (currentSendTtsEventId) {
          chrome.ttsEngine.sendTtsEvent(
            currentSendTtsEventId,
            { type: 'end', charIndex: currentUtterance.length }
          );
        }

        // Reset state
        isSpeaking = false;
        currentUtterance = null;
        currentSendTtsEventId = null;

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'idle'
        });
      }
    } else if (message.eventType === 'error') {
      // Speech error
      if (isSpeaking) {
        // Send error event to Chrome TTS if this was triggered by the TTS API
        if (currentSendTtsEventId) {
          chrome.ttsEngine.sendTtsEvent(
            currentSendTtsEventId,
            {
              type: 'error',
              errorMessage: message.errorMessage || 'Unknown error'
            }
          );
        }

        // Reset state
        isSpeaking = false;
        currentUtterance = null;
        currentSendTtsEventId = null;

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'idle'
        });
      }
    }
  }

  // Always send a response to avoid "The message port closed before a response was received" error
  sendResponse({ received: true });
  return true; // Keep the message channel open for async responses
});

// Register the TTS engine
chrome.ttsEngine.onSpeak.addListener(async (utterance, options, sendTtsEvent) => {
  console.log('TTS Engine onSpeak called with:', { utterance, options });

  // Stop any currently speaking utterance
  if (isSpeaking) {
    try {
      // Send message to offscreen document to stop audio
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'stopAudio'
      });
    } catch (error) {
      console.error('Error stopping audio:', error);
    }

    // Reset state
    isSpeaking = false;
    currentUtterance = null;
    currentSendTtsEventId = null;
  }

  // Set the current state
  isSpeaking = true;
  currentUtterance = utterance;
  currentSendTtsEventId = (sendTtsEvent as any).id;

  // Send start event immediately
  sendTtsEvent({
    type: 'start',
    charIndex: 0,
    length: utterance.length
  });

  try {
    // Load saved settings
    const settings = await loadSettings();

    // Ensure we have an offscreen document
    await ensureOffscreenDocument();

    // Send message to offscreen document to play audio with saved settings
    // Let the offscreen document determine WebGPU availability
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'playAudio',
      text: utterance,
      voice: settings.voice,
      speed: settings.speed,
      pitch: settings.pitch
    });

    // Store the current settings
    currentVoice = settings.voice;
    currentSpeed = settings.speed;
    currentPitch = settings.pitch;

    console.log('Sent play audio message to offscreen document with settings:', settings);
  } catch (error: any) {
    console.error('Error playing audio via offscreen document:', error);

    // Send error event
    sendTtsEvent({
      type: 'error',
      errorMessage: `Error playing audio: ${error.message || 'Unknown error'}`
    });

    // Reset state
    isSpeaking = false;
    currentUtterance = null;
    currentSendTtsEventId = null;
    currentVoice = null;
    currentSpeed = null;
    currentPitch = null;
  }

  // Return true to indicate we're handling this utterance
  return true;
});

chrome.ttsEngine.onStop.addListener(async () => {
  console.log('TTS Engine onStop called');

  // Stop audio in the offscreen document
  try {
    // Ensure we have an offscreen document
    await ensureOffscreenDocument();

    // Send message to offscreen document to stop audio
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'stopAudio'
    });
  } catch (error) {
    console.error('Error stopping audio in offscreen document:', error);
  }

  // Reset the speaking state
  isSpeaking = false;
  currentUtterance = null;
  currentSendTtsEventId = null;
});

// Function to ensure the offscreen document exists
async function ensureOffscreenDocument(): Promise<void> {
  // Check if we already have an offscreen document
  if (await chrome.offscreen.hasDocument()) {
    return;
  }

  // Create an offscreen document
  await chrome.offscreen.createDocument({
    url: 'src/offscreen.html',
    reasons: ['AUDIO_PLAYBACK' as any],
    justification: 'Playing TTS audio'
  });

  console.log('Created offscreen document for audio playback');

  // If we were in a speaking state but the offscreen document was closed,
  // we need to reset our state and notify the popup
  if (isSpeaking) {
    console.log('Offscreen document was recreated while in speaking state, resetting state');

    // Reset state
    isSpeaking = false;
    currentUtterance = null;
    currentSendTtsEventId = null;

    // Notify popup about playback status change
    chrome.runtime.sendMessage({
      type: 'playbackStatus',
      state: 'idle'
    });
  }
}

// Function to load settings from Chrome storage
async function loadSettings(): Promise<TTSSettings> {
  try {
    const result = await chrome.storage.sync.get('ttsSettings');
    if (result.ttsSettings) {
      console.log('Settings loaded:', result.ttsSettings);
      return {
        voice: result.ttsSettings.voice || DEFAULT_SETTINGS.voice,
        speed: result.ttsSettings.speed || DEFAULT_SETTINGS.speed,
        pitch: result.ttsSettings.pitch || DEFAULT_SETTINGS.pitch
      };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  // Return default settings if none are saved or on error
  console.log('Using default settings');
  return { ...DEFAULT_SETTINGS };
}

// Function to read text using our custom TTS engine via the offscreen document
async function readTextWithCustomTTS(
  text: string,
  voice?: string | null,
  speed?: number | null,
  pitch?: number | null
): Promise<void> {
  console.log('Reading text with custom TTS:', text, { voice, speed, pitch });

  // If no parameters are provided, load from storage
  if (voice === undefined && speed === undefined && pitch === undefined) {
    const settings = await loadSettings();
    voice = settings.voice;
    speed = settings.speed;
    pitch = settings.pitch;
    console.log('Using saved settings:', { voice, speed, pitch });
  }

  // Stop any currently speaking utterance
  if (isSpeaking) {
    // Send message to offscreen document to stop audio
    try {
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'stopAudio'
      });
    } catch (error) {
      console.error('Error stopping audio:', error);
    }

    // Reset state
    isSpeaking = false;
    currentUtterance = null;
    currentSendTtsEventId = null;
  }

  // Set the current state
  isSpeaking = true;
  currentUtterance = text;
  currentVoice = voice || null;
  currentSpeed = speed || null;
  currentPitch = pitch || null;

  try {
    // Ensure we have an offscreen document
    await ensureOffscreenDocument();

    // Send message to offscreen document to play audio
    // Let the offscreen document determine WebGPU availability
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'playAudio',
      text: text,
      voice: voice || undefined,
      speed: speed || undefined,
      pitch: pitch || undefined
    });

    console.log('Sent play audio message to offscreen document');
  } catch (error: any) {
    console.error('Error playing audio via offscreen document:', error);

    // Reset state
    isSpeaking = false;
    currentUtterance = null;
    currentVoice = null;
    currentSpeed = null;
    currentPitch = null;
  }
}

// We'll use a periodic check to detect if the offscreen document is closed unexpectedly
let offscreenCheckInterval: ReturnType<typeof setTimeout> | null = null;

// Function to check if the offscreen document exists and update state if needed
async function checkOffscreenDocument() {
  // Only check if we're in a speaking state
  if (isSpeaking) {
    try {
      // Check if the offscreen document exists
      const hasDocument = await chrome.offscreen.hasDocument();

      if (!hasDocument) {
        console.log('Offscreen document was closed while in speaking state, resetting state');

        // Reset state
        isSpeaking = false;
        currentUtterance = null;
        currentSendTtsEventId = null;

        // Notify popup about playback status change
        chrome.runtime.sendMessage({
          type: 'playbackStatus',
          state: 'idle'
        });
      }
    } catch (error) {
      console.error('Error checking offscreen document status:', error);
    }
  }

  // Schedule the next check
  if (offscreenCheckInterval !== null) {
    clearTimeout(offscreenCheckInterval);
  }

  // Schedule next check in 5 seconds
  offscreenCheckInterval = setTimeout(checkOffscreenDocument, 5000);
}

// Start the offscreen check when the extension loads
checkOffscreenDocument();

// Register our engine with Chrome's TTS system
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Kokoro Speak TTS Engine installed');

  // Create context menu item for reading selected text
  chrome.contextMenus.create({
    id: "readSelectedText",
    title: "Read with Kokoro",
    contexts: ["selection"],
    enabled: true
  });

  // Initialize the Kokoro model in the offscreen document
  try {
    // Ensure we have an offscreen document
    await ensureOffscreenDocument();

    // Send message to offscreen document to initialize the model
    // Let the offscreen document determine WebGPU availability
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'initModel'
    });

    console.log('Sent init model message to offscreen document');
  } catch (error) {
    console.error('Error initializing Kokoro model:', error);
  }
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "readSelectedText" && info.selectionText) {
    // Read the selected text using our custom TTS engine
    await readTextWithCustomTTS(info.selectionText);
  }
});

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  if (command === "read-selected-text") {
    try {
      // Get the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        console.error('No active tab found');
        return;
      }

      // Execute a script to get the selected text
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id! },
        func: () => window.getSelection()?.toString() || ''
      });

      const selectedText = results[0].result as string;
      console.log('Selected text:', selectedText);

      if (selectedText) {
        // Read the selected text using our custom TTS engine
        await readTextWithCustomTTS(selectedText);
      }
    } catch (error: any) {
      console.error('Error handling keyboard shortcut:', error);
    }
  }
});
