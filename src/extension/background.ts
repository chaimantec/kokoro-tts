import {
  VOICE_NAME,
  BackgroundMessage
} from './types';

// Global variables to track state
let isSpeaking = false;
let currentUtterance: string | null = null;
let currentSendTtsEventId: number | null = null;

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
    }
  } else if (message.type === 'getPlaybackInfo') {
    // Popup is requesting playback info
    sendResponse({
      isSpeaking: isSpeaking,
      utterance: currentUtterance,
      sendTtsEventId: currentSendTtsEventId
    });
    return true; // Keep the message channel open for async responses
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

        // Show a notification about the error
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/sherlock.svg',
          title: 'Sherlock TTS Error',
          message: message.errorMessage || 'Unknown error',
          priority: 2
        });

        // Reset state
        isSpeaking = false;
        currentUtterance = null;
        currentSendTtsEventId = null;
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
    // Ensure we have an offscreen document
    await ensureOffscreenDocument();

    // Send message to offscreen document to play audio
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'playAudio',
      text: utterance
    });

    console.log('Sent play audio message to offscreen document');
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
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK' as any],
    justification: 'Playing TTS audio'
  });

  console.log('Created offscreen document for audio playback');
}

// Function to read text using our custom TTS engine via the offscreen document
async function readTextWithCustomTTS(text: string): Promise<void> {
  console.log('Reading text with custom TTS:', text);

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

  try {
    // Ensure we have an offscreen document
    await ensureOffscreenDocument();

    // Send message to offscreen document to play audio
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'playAudio',
      text: text
    });

    console.log('Sent play audio message to offscreen document');
  } catch (error: any) {
    console.error('Error playing audio via offscreen document:', error);

    // Show a notification about the error
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/sherlock.svg',
      title: 'Sherlock TTS Error',
      message: `Error playing audio: ${error.message || 'Unknown error'}`,
      priority: 2
    });

    // Reset state
    isSpeaking = false;
    currentUtterance = null;
  }
}

// Register our engine with Chrome's TTS system
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sherlock TTS Engine installed');

  // Create context menu item for reading selected text
  chrome.contextMenus.create({
    id: "readSelectedText",
    title: "Read with Sherlock TTS",
    contexts: ["selection"]
  });

  // The voice will be automatically registered by the ttsEngine permission
  // and the onSpeak listener. We'll log the available voices for debugging.
  setTimeout(() => {
    chrome.tts.getVoices((voices) => {
      console.log('Available TTS voices after installation:', voices);

      // Look for our voice
      const ourVoice = voices.find(voice =>
        voice.voiceName === VOICE_NAME ||
        voice.extensionId === chrome.runtime.id
      );

      if (ourVoice) {
        console.log('Our voice is registered:', ourVoice);
      } else {
        console.warn('Our voice is not yet registered. This might be normal if Chrome is still initializing the TTS engine.');
      }
    });
  }, 1000); // Give Chrome a moment to register our engine
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
      } else {
        // No text selected, show a notification
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/sherlock.svg',
          title: 'Sherlock TTS',
          message: 'Please select text on the page first',
          priority: 2
        });
      }
    } catch (error: any) {
      console.error('Error handling keyboard shortcut:', error);

      // Show a notification about the error
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/sherlock.svg',
        title: 'Sherlock TTS Error',
        message: `Error: ${error.message || 'Unknown error'}`,
        priority: 2
      });
    }
  }
});
