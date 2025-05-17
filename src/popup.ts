import { VOICE_NAME, PlaybackInfoResponse } from './types';

// Enum for playback state
enum PlaybackState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused'
}

// Global variables to track playback state
let playbackState: PlaybackState = PlaybackState.IDLE;

// Function to play text using the TTS engine via background script
async function playTextWithTTS(text: string, sendTtsEventId?: number): Promise<void> {
  // Update state
  playbackState = PlaybackState.PLAYING;

  // Show playback controls
  const playbackControls = document.getElementById('playbackControls');
  if (playbackControls) {
    playbackControls.style.display = 'block';
  }

  // Update status
  const statusElement = document.getElementById('status') as HTMLDivElement;
  if (statusElement) {
    statusElement.textContent = 'Status: Playing text...';
    statusElement.style.backgroundColor = '#EED5AB';
    statusElement.style.color = '#744D26';
  }

  try {
    // Send message to background script to play audio
    await chrome.runtime.sendMessage({
      type: 'playTextWithTTS',
      text: text,
      sendTtsEventId: sendTtsEventId
    });
  } catch (error: any) {
    console.error('Failed to play audio:', error);

    // Update state
    playbackState = PlaybackState.IDLE;

    // Hide playback controls
    if (playbackControls) {
      playbackControls.style.display = 'none';
    }

    // Update status
    if (statusElement) {
      statusElement.textContent = `Error: Failed to play audio: ${error.message || 'Unknown error'}`;
      statusElement.style.backgroundColor = '#f8d7da';
      statusElement.style.color = '#721c24';
    }
  }
}

// Global variable to track model status
let modelStatus: 'loading' | 'ready' | 'error' | 'unknown' = 'unknown';
let modelErrorMessage: string | null = null;

// Function to pause playback
function pausePlayback(): void {
  if (playbackState === PlaybackState.PLAYING) {
    // Update state
    playbackState = PlaybackState.PAUSED;

    // Update status
    const statusElement = document.getElementById('status') as HTMLDivElement;
    if (statusElement) {
      statusElement.textContent = 'Status: Playback paused';
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';
    }

    // Send message to background script to pause audio
    chrome.runtime.sendMessage({
      type: 'pausePlayback'
    });
  }
}

// Function to resume playback
function resumePlayback(): void {
  if (playbackState === PlaybackState.PAUSED) {
    // Update state
    playbackState = PlaybackState.PLAYING;

    // Update status
    const statusElement = document.getElementById('status') as HTMLDivElement;
    if (statusElement) {
      statusElement.textContent = 'Status: Playback resumed';
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';
    }

    // Send message to background script to resume audio
    chrome.runtime.sendMessage({
      type: 'resumePlayback'
    });
  }
}

// Function to stop playback
function stopPlayback(): void {
  // Update state
  playbackState = PlaybackState.IDLE;

  // Hide playback controls
  const playbackControls = document.getElementById('playbackControls');
  if (playbackControls) {
    playbackControls.style.display = 'none';
  }

  // Update status
  const statusElement = document.getElementById('status') as HTMLDivElement;
  if (statusElement) {
    statusElement.textContent = 'Status: Playback stopped';
    statusElement.style.backgroundColor = '#EED5AB';
    statusElement.style.color = '#744D26';
  }

  // Send message to background script to stop audio
  chrome.runtime.sendMessage({
    type: 'stopPlayback'
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  console.log('Popup received message:', message);

  if (message.type === 'stopSpeech') {
    // Stop any currently playing audio
    stopPlayback();

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'modelStatus') {
    // Update model status
    modelStatus = message.status;
    modelErrorMessage = message.errorMessage || null;

    // Update UI if it's loaded
    const statusElement = document.getElementById('status') as HTMLDivElement;
    const modelStatusElement = document.getElementById('modelStatus') as HTMLDivElement;

    if (statusElement && modelStatusElement) {
      updateModelStatusUI(modelStatusElement);
    }

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'playbackStatus') {
    // Update playback status
    playbackState = message.state as PlaybackState;

    // Update UI based on playback state
    const playbackControls = document.getElementById('playbackControls');
    const statusElement = document.getElementById('status') as HTMLDivElement;

    if (playbackState === PlaybackState.PLAYING) {
      if (playbackControls) {
        playbackControls.style.display = 'block';
      }
      if (statusElement) {
        statusElement.textContent = 'Status: Playing text using local TTS...';
        statusElement.style.backgroundColor = '#EED5AB';
        statusElement.style.color = '#744D26';
      }
    } else if (playbackState === PlaybackState.PAUSED) {
      if (playbackControls) {
        playbackControls.style.display = 'block';
      }
      if (statusElement) {
        statusElement.textContent = 'Status: Playback paused';
        statusElement.style.backgroundColor = '#EED5AB';
        statusElement.style.color = '#744D26';
      }
    } else {
      // IDLE state
      if (playbackControls) {
        playbackControls.style.display = 'none';
      }
      if (statusElement) {
        statusElement.textContent = 'Status: Playback completed';
        statusElement.style.backgroundColor = '#EED5AB';
        statusElement.style.color = '#744D26';
      }
    }

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  }

  // Always send a response to avoid "The message port closed before a response was received" error
  sendResponse({ received: true });
  return true; // Keep the message channel open for async responses
});

// Function to update the model status UI
function updateModelStatusUI(modelStatusElement: HTMLDivElement): void {
  if (modelStatus === 'loading') {
    modelStatusElement.textContent = 'Model Status: Loading...';
    modelStatusElement.style.backgroundColor = '#fff3cd';
    modelStatusElement.style.color = '#856404';
  } else if (modelStatus === 'ready') {
    modelStatusElement.textContent = 'Model Status: Ready (using local TTS)';
    modelStatusElement.style.backgroundColor = '#d4edda';
    modelStatusElement.style.color = '#155724';
  } else if (modelStatus === 'error') {
    modelStatusElement.textContent = `Model Status: Error (${modelErrorMessage || 'Unknown error'})`;
    modelStatusElement.style.backgroundColor = '#f8d7da';
    modelStatusElement.style.color = '#721c24';
  } else {
    modelStatusElement.textContent = 'Model Status: Unknown';
    modelStatusElement.style.backgroundColor = '#e2e3e5';
    modelStatusElement.style.color = '#383d41';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status') as HTMLDivElement;
  const modelStatusElement = document.getElementById('modelStatus') as HTMLDivElement;
  const textInput = document.getElementById('textInput') as HTMLTextAreaElement;
  const playTextButton = document.getElementById('playTextButton') as HTMLButtonElement;
  const pauseButton = document.getElementById('pauseButton') as HTMLButtonElement;
  const resumeButton = document.getElementById('resumeButton') as HTMLButtonElement;
  const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
  const playbackControls = document.getElementById('playbackControls') as HTMLDivElement;

  console.log('Sherlock TTS Engine popup opened');

  // Initialize model status UI
  updateModelStatusUI(modelStatusElement);

  // Check if there's an active speech request from the background script
  chrome.runtime.sendMessage({ type: 'getPlaybackInfo' }, (response: PlaybackInfoResponse) => {
    if (response && response.isSpeaking && response.utterance) {
      console.log('Found active speech request:', response);

      // Update state
      playbackState = PlaybackState.PLAYING;

      // Show playback controls
      if (playbackControls) {
        playbackControls.style.display = 'block';
      }

      // Update status
      statusElement.textContent = 'Status: Playing speech from TTS engine...';
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';
    }
  });

  // Check if our TTS engine is registered
  chrome.tts.getVoices((voices) => {
    console.log('All available TTS voices:', voices);

    // Try to find our voice with more flexible matching
    const ourVoice = voices.find(voice => {
      const match = voice.voiceName === VOICE_NAME ||
                   voice.extensionId === chrome.runtime.id;

      if (match) {
        console.log('Found our voice:', voice);
      }

      return match;
    });

    if (ourVoice) {
      statusElement.textContent = `Status: ${VOICE_NAME} Engine is registered and ready to use.`;
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';
      statusElement.style.fontWeight = 'bold';
    } else {
      statusElement.textContent = `Status: ${VOICE_NAME} Engine is not registered yet. Please reload the extension.`;
      statusElement.style.backgroundColor = '#f8d7da';
      statusElement.style.color = '#721c24';
    }
  });

  // Add event listener for the play text button
  playTextButton.addEventListener('click', function() {
    // Get the text from the input field
    const text = textInput.value.trim();

    if (!text) {
      // If the text is empty, show an error
      statusElement.textContent = 'Error: Please enter some text to read.';
      statusElement.style.backgroundColor = '#f8d7da';
      statusElement.style.color = '#721c24';
      return;
    }

    // Play the text using the background script
    playTextWithTTS(text);
  });

  // Add event listeners for playback control buttons
  pauseButton.addEventListener('click', function() {
    pausePlayback();
  });

  resumeButton.addEventListener('click', function() {
    resumePlayback();
  });

  stopButton.addEventListener('click', function() {
    stopPlayback();
  });
});
