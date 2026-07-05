import {
  PlaybackInfoResponse,
  AVAILABLE_VOICES,
  TTSSettings,
  DEFAULT_SETTINGS,
  DictionaryEntry,
  TTS_DICTIONARY_STORAGE_KEY,
  normalizeDictionaryEntries
} from './types';

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
let currentUseWebGPU: boolean = DEFAULT_SETTINGS.useWebGPU;
let currentNumThreads: number = DEFAULT_SETTINGS.numThreads;
let dictionaryEntries: DictionaryEntry[] = [];
let editingDictionaryEntryId: string | null = null;

// Function to save settings to Chrome storage
async function saveSettings(): Promise<void> {
  const settings: TTSSettings = {
    voice: currentVoice,
    speed: currentSpeed,
    pitch: currentPitch,
    useWebGPU: currentUseWebGPU,
    numThreads: currentNumThreads
  };

  try {
    await chrome.storage.local.set({ ttsSettings: settings });
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Function to load settings from Chrome storage
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('ttsSettings');
    if (result.ttsSettings) {
      currentVoice = result.ttsSettings.voice || DEFAULT_SETTINGS.voice;
      currentSpeed = result.ttsSettings.speed || DEFAULT_SETTINGS.speed;
      currentPitch = result.ttsSettings.pitch || DEFAULT_SETTINGS.pitch;
      currentUseWebGPU = result.ttsSettings.useWebGPU ?? DEFAULT_SETTINGS.useWebGPU;
      currentNumThreads = result.ttsSettings.numThreads ?? DEFAULT_SETTINGS.numThreads;
      console.log('Settings loaded:', result.ttsSettings);
    } else {
      // Use default settings if none are saved
      currentVoice = DEFAULT_SETTINGS.voice;
      currentSpeed = DEFAULT_SETTINGS.speed;
      currentPitch = DEFAULT_SETTINGS.pitch;
      currentUseWebGPU = DEFAULT_SETTINGS.useWebGPU;
      currentNumThreads = DEFAULT_SETTINGS.numThreads;
      console.log('Using default settings');
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    // Use default settings on error
    currentVoice = DEFAULT_SETTINGS.voice;
    currentSpeed = DEFAULT_SETTINGS.speed;
    currentPitch = DEFAULT_SETTINGS.pitch;
    currentUseWebGPU = DEFAULT_SETTINGS.useWebGPU;
    currentNumThreads = DEFAULT_SETTINGS.numThreads;
  }
}

// Function to play text using the TTS engine via background script
async function playTextWithTTS(text: string, speculative: boolean, sendTtsEventId?: number): Promise<void> {
  // Model is always ready since it's bundled
  playbackState = PlaybackState.PLAYING;

  // Update playback controls to show pause/stop state
  updatePlaybackControls();

  try {
    // Send message to background script to play audio with voice, speed, and pitch settings
    await chrome.runtime.sendMessage({
      type: 'playTextWithTTS',
      text: text,
      speculative: speculative,
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

async function loadDictionary(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(TTS_DICTIONARY_STORAGE_KEY);
    dictionaryEntries = normalizeDictionaryEntries(result[TTS_DICTIONARY_STORAGE_KEY]);
    renderDictionary();
  } catch (error) {
    console.error('Error loading dictionary:', error);
    dictionaryEntries = [];
    renderDictionary();
    showErrorStatus('Unable to load dictionary.');
  }
}

async function saveDictionary(): Promise<void> {
  try {
    await chrome.storage.sync.set({ [TTS_DICTIONARY_STORAGE_KEY]: dictionaryEntries });
    renderDictionary();
  } catch (error) {
    console.error('Error saving dictionary:', error);
    showErrorStatus('Unable to save dictionary.');
  }
}

function showMainPage(): void {
  const mainPage = document.getElementById('mainPage') as HTMLElement | null;
  const dictionaryPage = document.getElementById('dictionaryPage') as HTMLElement | null;

  if (mainPage && dictionaryPage) {
    mainPage.hidden = false;
    dictionaryPage.hidden = true;
  }
}

function showDictionaryPage(): void {
  const mainPage = document.getElementById('mainPage') as HTMLElement | null;
  const dictionaryPage = document.getElementById('dictionaryPage') as HTMLElement | null;

  if (mainPage && dictionaryPage) {
    mainPage.hidden = true;
    dictionaryPage.hidden = false;
  }

  loadDictionary();
}

function resetDictionaryForm(): void {
  const wordInput = document.getElementById('dictionaryWordInput') as HTMLInputElement | null;
  const pronunciationInput = document.getElementById('dictionaryPronunciationInput') as HTMLInputElement | null;
  const caseSensitiveInput = document.getElementById('dictionaryCaseSensitiveInput') as HTMLInputElement | null;
  const saveButton = document.getElementById('saveDictionaryEntryButton') as HTMLButtonElement | null;

  editingDictionaryEntryId = null;

  if (wordInput) {
    wordInput.value = '';
  }

  if (pronunciationInput) {
    pronunciationInput.value = '';
  }

  if (caseSensitiveInput) {
    caseSensitiveInput.checked = true;
  }

  if (saveButton) {
    saveButton.textContent = 'Add';
  }
}

function editDictionaryEntry(entry: DictionaryEntry): void {
  const wordInput = document.getElementById('dictionaryWordInput') as HTMLInputElement | null;
  const pronunciationInput = document.getElementById('dictionaryPronunciationInput') as HTMLInputElement | null;
  const caseSensitiveInput = document.getElementById('dictionaryCaseSensitiveInput') as HTMLInputElement | null;
  const saveButton = document.getElementById('saveDictionaryEntryButton') as HTMLButtonElement | null;

  editingDictionaryEntryId = entry.id;

  if (wordInput) {
    wordInput.value = entry.word;
    wordInput.focus();
  }

  if (pronunciationInput) {
    pronunciationInput.value = entry.pronunciation;
  }

  if (caseSensitiveInput) {
    caseSensitiveInput.checked = entry.caseSensitive;
  }

  if (saveButton) {
    saveButton.textContent = 'Update';
  }
}

function renderDictionary(): void {
  const dictionaryList = document.getElementById('dictionaryList') as HTMLDivElement | null;

  if (!dictionaryList) {
    return;
  }

  dictionaryList.replaceChildren();

  if (dictionaryEntries.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'dictionary-empty';
    emptyMessage.textContent = 'No dictionary entries yet.';
    dictionaryList.appendChild(emptyMessage);
    return;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'dictionary-table-wrap';

  const table = document.createElement('table');
  table.className = 'dictionary-table';

  const colgroup = document.createElement('colgroup');
  const wordColumn = document.createElement('col');
  wordColumn.className = 'dictionary-word-column';
  const pronunciationColumn = document.createElement('col');
  pronunciationColumn.className = 'dictionary-pronunciation-column';
  const caseColumn = document.createElement('col');
  caseColumn.className = 'dictionary-case-column';
  const actionColumn = document.createElement('col');
  actionColumn.className = 'dictionary-action-column';
  colgroup.append(wordColumn, pronunciationColumn, caseColumn, actionColumn);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Word', 'Pronunciation', 'Case', ''].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');

  dictionaryEntries.forEach((entry) => {
    const row = document.createElement('tr');

    const wordElement = document.createElement('td');
    wordElement.className = 'dictionary-word-cell';
    wordElement.textContent = entry.word;

    const pronunciationElement = document.createElement('td');
    pronunciationElement.className = 'dictionary-pronunciation-cell';
    pronunciationElement.textContent = entry.pronunciation;

    const caseElement = document.createElement('td');
    const caseBadge = document.createElement('span');
    caseBadge.className = 'dictionary-case-badge';
    caseBadge.textContent = entry.caseSensitive ? 'Exact' : 'Ignore';
    caseElement.appendChild(caseBadge);

    const actionsCell = document.createElement('td');
    const actionsElement = document.createElement('div');
    actionsElement.className = 'dictionary-table-actions';

    const editButton = document.createElement('button');
    editButton.className = 'button secondary-button table-action-button';
    editButton.type = 'button';
    editButton.title = 'Edit';
    editButton.setAttribute('aria-label', `Edit ${entry.word}`);
    editButton.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M4 17.3V20h2.7L17.8 8.9l-2.7-2.7L4 17.3zM19.7 7c.4-.4.4-1 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0l-1 1 2.7 2.7 1-1z"/></svg>';
    editButton.addEventListener('click', () => editDictionaryEntry(entry));

    const deleteButton = document.createElement('button');
    deleteButton.className = 'button danger-button table-action-button';
    deleteButton.type = 'button';
    deleteButton.title = 'Delete';
    deleteButton.setAttribute('aria-label', `Delete ${entry.word}`);
    deleteButton.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 4l1-1h6l1 1h4v2H4V4h4z"/></svg>';
    deleteButton.addEventListener('click', async () => {
      dictionaryEntries = dictionaryEntries.filter((candidate) => candidate.id !== entry.id);
      if (editingDictionaryEntryId === entry.id) {
        resetDictionaryForm();
      }
      await saveDictionary();
    });

    actionsElement.append(editButton, deleteButton);
    actionsCell.appendChild(actionsElement);
    row.append(wordElement, pronunciationElement, caseElement, actionsCell);
    tbody.appendChild(row);
  });

  table.append(colgroup, thead, tbody);
  tableWrap.appendChild(table);
  dictionaryList.appendChild(tableWrap);
}

function createDictionaryEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hasSameDictionaryKey(entry: DictionaryEntry, word: string, caseSensitive: boolean): boolean {
  if (entry.caseSensitive !== caseSensitive) {
    return false;
  }

  return caseSensitive ? entry.word === word : entry.word.toLowerCase() === word.toLowerCase();
}

function normalizeSelectedText(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[ \t\f\v]+/g, ' ').trim();
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
    // Model status is always ready since model is bundled
    console.log('Received model status update:', message.status);

    // Show error if there's an issue with the model
    if (message.status === 'error' && message.errorMessage) {
      showErrorStatus(`Model error: ${message.errorMessage}`);
    }

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  } else if (message.type === 'playbackStatus') {
    console.log('Received playback status update:', message.state);

    // Update playback status (model is always ready)
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
    const isInjectable =
      tab.url &&
      (tab.url.startsWith('http:') || tab.url.startsWith('https:') || tab.url.startsWith('file:')) &&
      tab.status === 'complete';

    if (!isInjectable) {
      return '';
    }

    // Execute a script to get the selected text
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: () => window.getSelection()?.toString() || ''
    });

    const selectedText = normalizeSelectedText(results[0].result as string);
    console.log('Selected text:', selectedText);
    return selectedText;
  } catch (error) {
    console.error('Error getting selected text:', error);
    return '';
  }
}

document.addEventListener('DOMContentLoaded', function () {
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
  const webgpuToggle = document.getElementById('webgpuToggle') as HTMLInputElement;
  const numThreadsInput = document.getElementById('numThreadsInput') as HTMLInputElement;
  const openDictionaryButton = document.getElementById('openDictionaryButton') as HTMLButtonElement;
  const backToMainButton = document.getElementById('backToMainButton') as HTMLButtonElement;
  const dictionaryForm = document.getElementById('dictionaryForm') as HTMLFormElement;
  const dictionaryWordInput = document.getElementById('dictionaryWordInput') as HTMLInputElement;
  const dictionaryPronunciationInput = document.getElementById('dictionaryPronunciationInput') as HTMLInputElement;
  const dictionaryCaseSensitiveInput = document.getElementById('dictionaryCaseSensitiveInput') as HTMLInputElement;

  console.log('Kokoro Speak TTS Engine popup opened');

  // First load saved settings, then check if there's active playback (which will override settings)
  loadSettings().then(() => {
    // Update UI with loaded settings
    voiceSelect.value = currentVoice;
    speedSlider.value = currentSpeed.toString();
    speedValue.textContent = currentSpeed.toFixed(1);
    pitchSlider.value = currentPitch.toString();
    pitchValue.textContent = currentPitch.toFixed(1);
    webgpuToggle.checked = currentUseWebGPU;
    numThreadsInput.value = currentNumThreads.toString();
    // Set initial disabled state based on WebGPU
    numThreadsInput.disabled = currentUseWebGPU;

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
          playTextWithTTS(selectedText, true);
        } else {
          console.log('Audio already playing, just pasted text in textbox');
        }
      }
    } catch (error) {
      console.error('Error handling selected text on popup open:', error);
    }
  })();

  // Populate voice selection dropdown
  AVAILABLE_VOICES.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = voice.name;
    voiceSelect.appendChild(option);
  });

  // Set default voice
  voiceSelect.value = currentVoice;

  // Add event listeners for voice, speed, and pitch controls
  voiceSelect.addEventListener('change', function () {
    currentVoice = this.value;
    saveSettings(); // Save when changed
  });

  speedSlider.addEventListener('input', function () {
    currentSpeed = parseFloat(this.value);
    speedValue.textContent = currentSpeed.toFixed(1);
  });

  speedSlider.addEventListener('change', function () {
    // Save when slider is released
    saveSettings();
  });

  pitchSlider.addEventListener('input', function () {
    currentPitch = parseFloat(this.value);
    pitchValue.textContent = currentPitch.toFixed(1);
  });

  pitchSlider.addEventListener('change', function () {
    // Save when slider is released
    saveSettings();
  });

  // Add event listener for WebGPU toggle
  webgpuToggle.addEventListener('change', async function () {
    const newUseWebGPU = this.checked;

    // Enable/disable numThreads input based on WebGPU state
    numThreadsInput.disabled = newUseWebGPU;

    if (newUseWebGPU !== currentUseWebGPU) {
      currentUseWebGPU = newUseWebGPU;

      // Save the setting
      await saveSettings();

      // Show loading status
      showStatus('Reinitializing model with new settings...', 'loading', false);

      // Send message to background to reinitialize model
      try {
        await chrome.runtime.sendMessage({
          type: 'reinitModel',
          useWebGPU: currentUseWebGPU,
          numThreads: currentNumThreads
        });

        // Show success message
        showStatus('Model reinitialized successfully', 'loading', true);
      } catch (error: any) {
        // Show error and revert toggle
        showErrorStatus(`Failed to reinitialize model: ${error.message}`);
        this.checked = !newUseWebGPU;
        currentUseWebGPU = !newUseWebGPU;
        numThreadsInput.disabled = currentUseWebGPU;
      }
    }
  });

  // Add event listener for numThreads input
  numThreadsInput.addEventListener('input', function () {
    const value = parseInt(this.value, 10);

    // Validate: only allow non-negative integers
    if (isNaN(value) || value < 0) {
      this.value = currentNumThreads.toString();
      return;
    }

    currentNumThreads = value;
  });

  numThreadsInput.addEventListener('change', async function () {
    // Validate again on change
    const value = parseInt(this.value, 10);

    if (isNaN(value) || value < 0) {
      this.value = currentNumThreads.toString();
      showErrorStatus('Number of threads must be a non-negative integer');
      return;
    }

    currentNumThreads = value;

    // Save the setting
    await saveSettings();

    // Only reinitialize if not using WebGPU (numThreads only affects WASM)
    if (!currentUseWebGPU) {
      showStatus('Reinitializing model with new thread count...', 'loading', false);

      try {
        await chrome.runtime.sendMessage({
          type: 'reinitModel',
          useWebGPU: currentUseWebGPU,
          numThreads: currentNumThreads
        });

        showStatus('Model reinitialized successfully', 'loading', true);
      } catch (error: any) {
        showErrorStatus(`Failed to reinitialize model: ${error.message}`);
      }
    } else {
      // Just save, don't reinitialize (WebGPU doesn't use threads)
      showStatus('Thread count saved', 'loading', true);
    }
  });

  openDictionaryButton.addEventListener('click', function () {
    showDictionaryPage();
  });

  backToMainButton.addEventListener('click', function () {
    resetDictionaryForm();
    showMainPage();
  });

  dictionaryForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    const word = dictionaryWordInput.value.trim();
    const pronunciation = dictionaryPronunciationInput.value.trim();
    const caseSensitive = dictionaryCaseSensitiveInput.checked;

    if (!word || !pronunciation) {
      showErrorStatus('Dictionary word and pronunciation are required.');
      return;
    }

    const duplicateEntry = dictionaryEntries.find(
      (entry) => entry.id !== editingDictionaryEntryId && hasSameDictionaryKey(entry, word, caseSensitive)
    );

    if (duplicateEntry) {
      duplicateEntry.word = word;
      duplicateEntry.pronunciation = pronunciation;
      dictionaryEntries = dictionaryEntries.filter((entry) => entry.id !== editingDictionaryEntryId);
    } else if (editingDictionaryEntryId) {
      dictionaryEntries = dictionaryEntries.map((entry) =>
        entry.id === editingDictionaryEntryId ? { ...entry, word, pronunciation, caseSensitive } : entry
      );
    } else {
      dictionaryEntries = [
        ...dictionaryEntries,
        {
          id: createDictionaryEntryId(),
          word,
          pronunciation,
          caseSensitive
        }
      ];
    }

    await saveDictionary();
    resetDictionaryForm();
  });

  // Initialize playback controls state
  updatePlaybackControls();

  // Add event listener for the play button
  playButton.addEventListener('click', function () {
    // Get the text from the input field
    const text = textInput.value.trim();

    if (!text) {
      // If the text is empty, show an error
      showErrorStatus('Please enter some text to read.');
      return;
    }

    // Play the text using the background script
    playTextWithTTS(text, false);
  });

  // Add event listener for the pause button
  pauseButton.addEventListener('click', function () {
    pausePlayback();
  });

  // Add event listener for the resume button
  resumeButton.addEventListener('click', function () {
    resumePlayback();
  });

  // Add event listeners for both stop buttons
  stopButton.addEventListener('click', function () {
    stopPlayback();
  });

  stopButtonAlt.addEventListener('click', function () {
    stopPlayback();
  });

  // No need for download button as model is bundled
  if (downloadModelButton) {
    downloadModelButton.style.display = 'none';
  }

  // Load and display keyboard shortcut information
  loadKeyboardShortcutInfo();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes[TTS_DICTIONARY_STORAGE_KEY]) {
    return;
  }

  dictionaryEntries = normalizeDictionaryEntries(changes[TTS_DICTIONARY_STORAGE_KEY].newValue);
  renderDictionary();
});

// Function to load and display keyboard shortcut information
async function loadKeyboardShortcutInfo(): Promise<void> {
  try {
    // Get the current keyboard shortcut
    const commands = await chrome.commands.getAll();
    const readCommand = commands.find((cmd) => cmd.name === 'read-selected-text');

    const currentShortcutElement = document.getElementById('currentShortcut');
    const changeShortcutLink = document.getElementById('changeShortcutLink') as HTMLAnchorElement;

    if (currentShortcutElement && changeShortcutLink) {
      if (readCommand && readCommand.shortcut) {
        currentShortcutElement.textContent = readCommand.shortcut;
      } else {
        currentShortcutElement.textContent = 'Not set';
      }

      // Add click handler for the change shortcut link
      changeShortcutLink.addEventListener('click', (e) => {
        e.preventDefault();
        // Open Chrome extensions shortcuts page
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
      });
    }
  } catch (error) {
    console.error('Error loading keyboard shortcut info:', error);
    const currentShortcutElement = document.getElementById('currentShortcut');
    if (currentShortcutElement) {
      currentShortcutElement.textContent = 'Error loading shortcut';
    }
  }
}
