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

  // Show playback controls
  const playbackControls = document.getElementById('playbackControls');
  if (playbackControls) {
    playbackControls.style.display = 'grid';
  }

  // Update play/pause button to show pause state
  updatePlayPauseButton();

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

    // Hide playback controls
    if (playbackControls) {
      playbackControls.style.display = 'none';
    }

    // Update play/pause button to show play state
    updatePlayPauseButton();

    // Show error status
    showErrorStatus(`Failed to play audio: ${error.message || 'Unknown error'}`);
  }
}

// Helper function to update the play/pause button state
function updatePlayPauseButton(): void {
  const playPauseButton = document.getElementById('playPauseButton') as HTMLButtonElement;
  if (!playPauseButton) return;

  const playContent = playPauseButton.querySelector('.button-content:first-child') as HTMLElement;
  const pauseContent = playPauseButton.querySelector('.button-content:last-child') as HTMLElement;

  if (playbackState === PlaybackState.PLAYING) {
    // Show pause state
    if (playContent) playContent.style.display = 'none';
    if (pauseContent) pauseContent.style.display = 'flex';
  } else {
    // Show play state
    if (playContent) playContent.style.display = 'flex';
    if (pauseContent) pauseContent.style.display = 'none';
  }
}

// Helper function to show error status
function showErrorStatus(message: string): void {
  const statusContainer = document.getElementById('statusContainer') as HTMLDivElement;
  const statusMessage = document.getElementById('statusMessage') as HTMLSpanElement;

  if (statusContainer && statusMessage) {
    statusMessage.textContent = message;
    statusContainer.style.display = 'block';
  }
}

// Helper function to hide status
function hideStatus(): void {
  const statusContainer = document.getElementById('statusContainer') as HTMLDivElement;
  if (statusContainer) {
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

    // Update play/pause button
    updatePlayPauseButton();

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

    // Update play/pause button
    updatePlayPauseButton();

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

  // Update play/pause button
  updatePlayPauseButton();

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
    const playbackControls = document.getElementById('playbackControls');

    if (playbackState === PlaybackState.PLAYING) {
      if (playbackControls) {
        playbackControls.style.display = 'grid';
      }
      // Hide any error messages
      hideStatus();
    } else if (playbackState === PlaybackState.PAUSED) {
      if (playbackControls) {
        playbackControls.style.display = 'grid';
      }
    } else {
      // IDLE state
      if (playbackControls) {
        playbackControls.style.display = 'none';
      }
    }

    // Update play/pause button state
    updatePlayPauseButton();

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'error') {
    // Show error message
    showErrorStatus(message.error || 'Unknown error occurred');

    // Update state
    playbackState = PlaybackState.IDLE;

    // Update UI
    updatePlayPauseButton();

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  }

  // Always send a response to avoid "The message port closed before a response was received" error
  sendResponse({ received: true });
  return true; // Keep the message channel open for async responses
});

document.addEventListener('DOMContentLoaded', function() {
  const textInput = document.getElementById('textInput') as HTMLTextAreaElement;
  const voiceSelect = document.getElementById('voiceSelect') as HTMLSelectElement;
  const speedSlider = document.getElementById('speedSlider') as HTMLInputElement;
  const pitchSlider = document.getElementById('pitchSlider') as HTMLInputElement;
  const speedValue = document.getElementById('speedValue') as HTMLSpanElement;
  const pitchValue = document.getElementById('pitchValue') as HTMLSpanElement;
  const playPauseButton = document.getElementById('playPauseButton') as HTMLButtonElement;
  const resumeButton = document.getElementById('resumeButton') as HTMLButtonElement;
  const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
  const playbackControls = document.getElementById('playbackControls') as HTMLDivElement;

  console.log('Kokori Speak TTS Engine popup opened');

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

  // Initialize play/pause button state
  updatePlayPauseButton();

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

      // Show playback controls
      if (playbackControls) {
        playbackControls.style.display = 'grid';
      }

      // Update play/pause button
      updatePlayPauseButton();
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

  // Add event listener for the play/pause button
  playPauseButton.addEventListener('click', function() {
    if (playbackState === PlaybackState.IDLE) {
      // Get the text from the input field
      const text = textInput.value.trim();

      if (!text) {
        // If the text is empty, show an error
        showErrorStatus('Please enter some text to read.');
        return;
      }

      // Play the text using the background script
      playTextWithTTS(text);
    } else if (playbackState === PlaybackState.PLAYING) {
      // Pause playback
      pausePlayback();
    } else if (playbackState === PlaybackState.PAUSED) {
      // Resume playback
      resumePlayback();
    }
  });

  // Add event listeners for playback control buttons
  resumeButton.addEventListener('click', function() {
    resumePlayback();
  });

  stopButton.addEventListener('click', function() {
    stopPlayback();
  });
});
