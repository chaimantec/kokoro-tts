import { VOICE_NAME, PlaybackInfoResponse, AVAILABLE_VOICES, TTSSettings, DEFAULT_SETTINGS } from './types';

// Enum for playback state
enum PlaybackState {
  IDLE = 'idle',
  PLAYING = 'playing',
  PAUSED = 'paused'
}

// Global variables to track playback state
let playbackState: PlaybackState = PlaybackState.IDLE;
let currentVoice: string = DEFAULT_SETTINGS.voice;
let currentSpeed: number = DEFAULT_SETTINGS.speed;
let currentPitch: number = DEFAULT_SETTINGS.pitch;

// Function to save settings to Chrome storage
async function saveSettings(): Promise<void> {
  const settings: TTSSettings = {
    voice: currentVoice,
    speed: currentSpeed,
    pitch: currentPitch
  };

  try {
    await chrome.storage.sync.set({ ttsSettings: settings });
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Function to load settings from Chrome storage
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('ttsSettings');
    if (result.ttsSettings) {
      currentVoice = result.ttsSettings.voice || DEFAULT_SETTINGS.voice;
      currentSpeed = result.ttsSettings.speed || DEFAULT_SETTINGS.speed;
      currentPitch = result.ttsSettings.pitch || DEFAULT_SETTINGS.pitch;
      console.log('Settings loaded:', result.ttsSettings);
    } else {
      // Use default settings if none are saved
      currentVoice = DEFAULT_SETTINGS.voice;
      currentSpeed = DEFAULT_SETTINGS.speed;
      currentPitch = DEFAULT_SETTINGS.pitch;
      console.log('Using default settings');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    // Use default settings on error
    currentVoice = DEFAULT_SETTINGS.voice;
    currentSpeed = DEFAULT_SETTINGS.speed;
    currentPitch = DEFAULT_SETTINGS.pitch;
  }
}

// Function to play text using the TTS engine via background script
async function playTextWithTTS(text: string, sendTtsEventId?: number): Promise<void> {
  // Update state
  playbackState = PlaybackState.PLAYING;

  // We'll update the playback controls in updatePlaybackControls()

  // Update playback controls to show pause/stop state
  updatePlaybackControls();

  try {
    // Send message to background script to play audio with voice, speed, and pitch settings
    await chrome.runtime.sendMessage({
      type: 'playTextWithTTS',
      text: text,
      sendTtsEventId: sendTtsEventId,
      voice: currentVoice,
      speed: currentSpeed,
      pitch: currentPitch
    });
  } catch (error: any) {
    console.error('Failed to play audio:', error);

    // Update state
    playbackState = PlaybackState.IDLE;

    // We'll update the playback controls in updatePlaybackControls()

    // Update playback controls to show play state
    updatePlaybackControls();

    // Show error status
    showErrorStatus(`Failed to play audio: ${error.message || 'Unknown error'}`);
  }
}

// Helper function to update the playback controls based on state
function updatePlaybackControls(): void {
  const playControls = document.getElementById('playControls') as HTMLDivElement;
  const pauseStopControls = document.getElementById('pauseStopControls') as HTMLDivElement;
  const resumeStopControls = document.getElementById('resumeStopControls') as HTMLDivElement;

  if (!playControls || !pauseStopControls || !resumeStopControls) return;

  // Hide all controls first
  playControls.style.display = 'none';
  pauseStopControls.style.display = 'none';
  resumeStopControls.style.display = 'none';

  // Show the appropriate controls based on state
  if (playbackState === PlaybackState.PLAYING) {
    pauseStopControls.style.display = 'grid';
  } else if (playbackState === PlaybackState.PAUSED) {
    resumeStopControls.style.display = 'grid';
  } else {
    // IDLE state
    playControls.style.display = 'grid';
  }
}

// Variable to track the current error timeout
let errorTimeoutId: number | null = null;

// Helper function to show error status
function showErrorStatus(message: string): void {
  const statusContainer = document.getElementById('statusContainer') as HTMLDivElement;
  const statusMessage = document.getElementById('statusMessage') as HTMLSpanElement;

  if (statusContainer && statusMessage) {
    // Clear any existing timeout
    if (errorTimeoutId !== null) {
      window.clearTimeout(errorTimeoutId);
      errorTimeoutId = null;
    }

    // Reset any ongoing animations
    statusContainer.style.animation = 'none';
    // Trigger reflow to restart animation
    void statusContainer.offsetWidth;
    statusContainer.style.animation = 'fadeIn 0.3s ease-in-out';

    // Update message and show container
    statusMessage.textContent = message;
    statusContainer.style.display = 'block';

    // Set timeout to hide the error after 3 seconds
    errorTimeoutId = window.setTimeout(() => {
      // Apply fadeOut animation
      statusContainer.style.animation = 'fadeOut 0.3s ease-in-out';

      // Hide after animation completes
      window.setTimeout(() => {
        statusContainer.style.display = 'none';
        errorTimeoutId = null;
      }, 300);
    }, 3000);
  }
}

// Helper function to hide status
function hideStatus(): void {
  const statusContainer = document.getElementById('statusContainer') as HTMLDivElement;
  if (statusContainer) {
    // Clear any existing timeout
    if (errorTimeoutId !== null) {
      window.clearTimeout(errorTimeoutId);
      errorTimeoutId = null;
    }

    statusContainer.style.display = 'none';
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

    // Update playback controls
    updatePlaybackControls();

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

    // Update playback controls
    updatePlaybackControls();

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

  // We'll update the playback controls in updatePlaybackControls()

  // Update playback controls
  updatePlaybackControls();

  // Hide any status messages
  hideStatus();

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

    // Show error if there's an issue with the model
    if (modelStatus === 'error' && modelErrorMessage) {
      showErrorStatus(`Model error: ${modelErrorMessage}`);
    }

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'playbackStatus') {
    // Update playback status
    playbackState = message.state as PlaybackState;

    // Update UI based on playback state
    if (playbackState === PlaybackState.PLAYING) {
      // Hide any error messages
      hideStatus();
    }

    // Update the playback controls
    updatePlaybackControls();

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'error') {
    // Show error message
    showErrorStatus(message.error || 'Unknown error occurred');

    // Update state
    playbackState = PlaybackState.IDLE;

    // Update playback controls
    updatePlaybackControls();

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  }

  // Always send a response to avoid "The message port closed before a response was received" error
  sendResponse({ received: true });
  return true; // Keep the message channel open for async responses
});

// Function to get selected text from the active tab
async function getSelectedTextFromActiveTab(): Promise<string> {
  try {
    // Get the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      console.error('No active tab found');
      return '';
    }

    const tab = tabs[0];
    const isInjectable = tab.url && 
      (tab.url.startsWith('http:') || 
      tab.url.startsWith('https:') || 
      tab.url.startsWith('file:')) && 
      tab.status === 'complete';

    if (!isInjectable) {
      return '';
    }

    // Execute a script to get the selected text
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => window.getSelection()?.toString() || ''
    });

    const selectedText = results[0].result as string;
    console.log('Selected text:', selectedText);
    return selectedText;
  } catch (error) {
    console.error('Error getting selected text:', error);
    return '';
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const textInput = document.getElementById('textInput') as HTMLTextAreaElement;
  const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
  const speedSlider = document.getElementById('speedSlider') as HTMLInputElement;
  const pitchSlider = document.getElementById('pitchSlider') as HTMLInputElement;
  const speedValue = document.getElementById('speedValue') as HTMLSpanElement;
  const pitchValue = document.getElementById('pitchValue') as HTMLSpanElement;
  const playButton = document.getElementById('playButton') as HTMLButtonElement;
  const pauseButton = document.getElementById('pauseButton') as HTMLButtonElement;
  const resumeButton = document.getElementById('resumeButton') as HTMLButtonElement;
  const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
  const stopButtonAlt = document.getElementById('stopButtonAlt') as HTMLButtonElement;

  console.log('Kokori Speak TTS Engine popup opened');

  // Check for selected text when popup opens
  (async () => {
    try {
      const selectedText = await getSelectedTextFromActiveTab();
      if (selectedText) {
        console.log('Found selected text when popup opened');

        // Always set the text in the input field
        textInput.value = selectedText;

        // Only play the text if no audio is currently playing
        if (playbackState === PlaybackState.IDLE) {
          console.log('No audio currently playing, reading selected text');
          playTextWithTTS(selectedText);
        } else {
          console.log('Audio already playing, just pasted text in textbox');
        }
      }
    } catch (error) {
      console.error('Error handling selected text on popup open:', error);
    }
  })();

  // Populate voice selection dropdown
  AVAILABLE_VOICES.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = voice.name;
    voiceSelect.appendChild(option);
  });

  // Set default voice
  voiceSelect.value = currentVoice;

  // Load saved settings
  loadSettings().then(() => {
    // Update UI with loaded settings
    voiceSelect.value = currentVoice;
    speedSlider.value = currentSpeed.toString();
    speedValue.textContent = currentSpeed.toFixed(1);
    pitchSlider.value = currentPitch.toString();
    pitchValue.textContent = currentPitch.toFixed(1);
  });

  // Add event listeners for voice, speed, and pitch controls
  voiceSelect.addEventListener('change', function() {
    currentVoice = this.value;
    saveSettings(); // Save when changed
  });

  speedSlider.addEventListener('input', function() {
    currentSpeed = parseFloat(this.value);
    speedValue.textContent = currentSpeed.toFixed(1);
  });

  speedSlider.addEventListener('change', function() {
    // Save when slider is released
    saveSettings();
  });

  pitchSlider.addEventListener('input', function() {
    currentPitch = parseFloat(this.value);
    pitchValue.textContent = currentPitch.toFixed(1);
  });

  pitchSlider.addEventListener('change', function() {
    // Save when slider is released
    saveSettings();
  });

  // Initialize playback controls state
  updatePlaybackControls();

  // Check if there's an active speech request from the background script
  chrome.runtime.sendMessage({ type: 'getPlaybackInfo' }, (response: PlaybackInfoResponse) => {
    if (response && response.isSpeaking && response.utterance) {
      console.log('Found active speech request:', response);

      // Update state
      playbackState = PlaybackState.PLAYING;

      // Update voice, speed, and pitch if available
      if (response.voice) {
        currentVoice = response.voice;
        voiceSelect.value = currentVoice;
      }

      if (response.speed) {
        currentSpeed = response.speed;
        speedSlider.value = currentSpeed.toString();
        speedValue.textContent = currentSpeed.toFixed(1);
      }

      if (response.pitch) {
        currentPitch = response.pitch;
        pitchSlider.value = currentPitch.toString();
        pitchValue.textContent = currentPitch.toFixed(1);
      }

      // We'll update the playback controls in updatePlaybackControls()

      // Update playback controls
      updatePlaybackControls();
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

    if (!ourVoice) {
      showErrorStatus(`${VOICE_NAME} Engine is not registered yet. Please reload the extension.`);
    }
  });

  // Add event listener for the play button
  playButton.addEventListener('click', function() {
    // Get the text from the input field
    const text = textInput.value.trim();

    if (!text) {
      // If the text is empty, show an error
      showErrorStatus('Please enter some text to read.');
      return;
    }

    // Play the text using the background script
    playTextWithTTS(text);
  });

  // Add event listener for the pause button
  pauseButton.addEventListener('click', function() {
    pausePlayback();
  });

  // Add event listener for the resume button
  resumeButton.addEventListener('click', function() {
    resumePlayback();
  });

  // Add event listeners for both stop buttons
  stopButton.addEventListener('click', function() {
    stopPlayback();
  });

  stopButtonAlt.addEventListener('click', function() {
    stopPlayback();
  });
});
