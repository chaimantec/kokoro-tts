import { PlaybackInfoResponse, AVAILABLE_VOICES, TTSSettings, DEFAULT_SETTINGS } from './types';

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
  // First check if the model is ready before attempting to play
  if (modelStatus !== 'ready') {
    console.log('Model is not ready, cannot play audio. Current status:', modelStatus);

    // Show appropriate error message
    if (modelStatus === 'download_required') {
      showErrorStatus('Please download the model before playing audio.');
    } else if (modelStatus === 'loading') {
      showErrorStatus('Model is still loading. Please wait...');
    } else {
      showErrorStatus('TTS model is not ready. Please check model status.');
    }

    return;
  }

  // Only update state if model is ready
  playbackState = PlaybackState.PLAYING;

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

// Helper function to show status message
function showStatus(message: string, type: 'error' | 'loading' = 'error', autoHide: boolean = true): void {
  const statusContainer = document.getElementById('statusContainer') as HTMLDivElement;
  const statusElement = document.getElementById('status') as HTMLDivElement;
  const statusType = document.getElementById('statusType') as HTMLElement;
  const statusMessage = document.getElementById('statusMessage') as HTMLSpanElement;

  if (statusContainer && statusMessage && statusElement && statusType) {
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

    // Update status type
    if (type === 'error') {
      statusElement.className = 'status error';
      statusType.textContent = 'Error:';
    } else if (type === 'loading') {
      statusElement.className = 'status loading';
      statusType.textContent = 'Status:';
    }

    // Update message and show container
    statusMessage.textContent = message;
    statusContainer.style.display = 'block';

    // Set timeout to hide the status after 3 seconds if autoHide is true
    if (autoHide) {
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
}

// Helper function to show error status (for backward compatibility)
function showErrorStatus(message: string): void {
  showStatus(message, 'error', true);
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

// Function to initiate model download
function initiateModelDownload(modelType: 'webgpu' | 'wasm', modelSize: string): void {
  // Hide any existing error messages
  hideStatus();

  // Send download request to background script
  chrome.runtime.sendMessage({
    type: 'modelDownload',
    modelType: modelType
  });

  // Show loading message with loading style and no auto-hide
  showStatus(`Downloading ${modelSize} model. Please wait...`, 'loading', false);
}

// Global variable to track model status
let modelStatus: 'loading' | 'ready' | 'error' | 'unknown' | 'download_required' = 'unknown';
let modelErrorMessage: string | null = null;
let modelDownloadType: 'webgpu' | 'wasm' | null = null;
let modelDownloadSize: string | null = null;

// Function to show the model download message
function showModelDownloadMessage(modelType: 'webgpu' | 'wasm', modelSize: string): void {
  const modelDownloadMessage = document.getElementById('modelDownloadMessage') as HTMLDivElement;
  const modelDownloadText = document.getElementById('modelDownloadText') as HTMLParagraphElement;

  if (modelDownloadMessage && modelDownloadText) {
    // Update the message text with model type and size
    modelDownloadText.textContent = `A ${modelSize} ${modelType.toUpperCase()} model needs to be downloaded to enable voice functionality.`;

    // Store the model type and size for later use
    modelDownloadType = modelType;
    modelDownloadSize = modelSize;

    // Show the message
    modelDownloadMessage.style.display = 'block';
  }
}

// Function to hide the model download message
function hideModelDownloadMessage(): void {
  const modelDownloadMessage = document.getElementById('modelDownloadMessage') as HTMLDivElement;

  if (modelDownloadMessage) {
    modelDownloadMessage.style.display = 'none';
  }
}

// Function to check model status
async function checkModelStatus(): Promise<void> {
  try {
    // Send a message to the background script to check model status
    chrome.runtime.sendMessage({
      type: 'checkModelStatus'
    }, (response) => {
      if (response && response.modelStatus) {
        // Update the global model status variable
        modelStatus = response.modelStatus;
        console.log('Model status updated:', modelStatus);

        if (response.modelStatus === 'ready') {
          // Model is ready, hide the download message
          hideModelDownloadMessage();
          // No need to reset playback state if model is ready
        } else if (response.modelStatus === 'download_required' && response.modelType && response.modelSize) {
          // Model needs to be downloaded, show the download message
          showModelDownloadMessage(response.modelType, response.modelSize);

          // Reset playback state to idle if we were trying to play
          if (playbackState !== PlaybackState.IDLE) {
            console.log('Resetting playback state to idle because model needs to be downloaded');
            playbackState = PlaybackState.IDLE;
            updatePlaybackControls();
          }
        } else if (response.modelStatus === 'loading') {
          // Model is loading, show a loading message
          showStatus('Loading Kokoro model. Please wait...', 'loading', false);

          // Reset playback state to idle if we were trying to play
          if (playbackState !== PlaybackState.IDLE) {
            console.log('Resetting playback state to idle because model is loading');
            playbackState = PlaybackState.IDLE;
            updatePlaybackControls();
          }
        }
      } else {
        console.log('No model status in response:', response);
      }
    });
  } catch (error) {
    console.error('Error checking model status:', error);
    // Set model status to error in case of exception
    modelStatus = 'error';

    // Reset playback state to idle on error
    if (playbackState !== PlaybackState.IDLE) {
      console.log('Resetting playback state to idle due to model status error');
      playbackState = PlaybackState.IDLE;
      updatePlaybackControls();
    }
  }
}

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
    console.log('Received model status update:', modelStatus);

    // Show error if there's an issue with the model
    if (modelStatus === 'error' && modelErrorMessage) {
      showErrorStatus(`Model error: ${modelErrorMessage}`);
    }
    // Show persistent download message if download is required
    else if (modelStatus === 'download_required' && message.modelType && message.modelSize) {
      console.log('Model download required:', message);
      showModelDownloadMessage(message.modelType, message.modelSize);

      // Reset playback state to idle if we were trying to play
      if (playbackState !== PlaybackState.IDLE) {
        playbackState = PlaybackState.IDLE;
        updatePlaybackControls();
      }
    }
    // Show loading message if the model is loading
    else if (modelStatus === 'loading') {
      showStatus('Loading TTS model. Please wait...', 'loading', false);
    }
    // Hide the download message and loading status if the model is ready
    else if (modelStatus === 'ready') {
      hideModelDownloadMessage();
      hideStatus();
    }

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'playbackStatus') {
    console.log('Received playback status update:', message.state, 'Current model status:', modelStatus);

    // Only update playback status if the model is ready
    if (modelStatus === 'ready') {
      // Update playback status
      playbackState = message.state as PlaybackState;

      // Update UI based on playback state
      if (playbackState === PlaybackState.PLAYING) {
        // Hide any error messages
        hideStatus();
      }

      // Update the playback controls
      updatePlaybackControls();
    } else {
      console.log('Ignoring playback status update because model is not ready. Model status:', modelStatus);
      // Force playback state to idle if model is not ready
      playbackState = PlaybackState.IDLE;
      updatePlaybackControls();
    }

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
  const downloadModelButton = document.getElementById('downloadModelButton') as HTMLButtonElement;

  console.log('Kokoro Speak TTS Engine popup opened');

  // First load saved settings, then check if there's active playback (which will override settings)
  loadSettings().then(() => {
    // Update UI with loaded settings
    voiceSelect.value = currentVoice;
    speedSlider.value = currentSpeed.toString();
    speedValue.textContent = currentSpeed.toFixed(1);
    pitchSlider.value = currentPitch.toString();
    pitchValue.textContent = currentPitch.toFixed(1);

    // Now check if there is text playing when popup opens (this will override settings if needed)
    chrome.runtime.sendMessage({ type: 'getPlaybackInfo' }, (response: PlaybackInfoResponse) => {
      if (response) {
        console.log('Current playback info:', response);

        // Update voice, speed, and pitch if available (regardless of model status)
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

        // Update playback state based on whether speech is active
        if (response.isSpeaking) {
          console.log('Found active speech when popup opened');
          // Set playback state to PLAYING (we'll check model status later)
          playbackState = PlaybackState.PLAYING;
        }

        // Update the UI controls based on current state
        updatePlaybackControls();

        // If model isn't ready but we're trying to play, we'll reset this when checking model status
      }
    });
  });

  // Check for selected text when popup opens
  (async () => {
    try {
      const selectedText = await getSelectedTextFromActiveTab();
      if (selectedText) {
        console.log('Found selected text when popup opened');

        // Always set the text in the input field
        textInput.value = selectedText;

        // Only play the text if no audio is currently playing and model is ready
        if (playbackState === PlaybackState.IDLE) {
          // We'll check model status in playTextWithTTS function
          console.log('No audio currently playing, reading selected text if model is ready');
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

  // Add event listener for the download model button
  if (downloadModelButton) {
    downloadModelButton.addEventListener('click', function() {
      if (modelDownloadType && modelDownloadSize) {
        // Initiate model download directly
        initiateModelDownload(modelDownloadType, modelDownloadSize);
      }
    });
  }

  // Check model status when popup opens
  checkModelStatus();
});
