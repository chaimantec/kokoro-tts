import { OffscreenMessage } from './types';
import { KokoroTTS, TextSplitterStream, env } from 'kokoro-js';

env.wasmPaths = "/onnxruntime-web/"

// Access the KokoroTTS and TextSplitterStream from the global window object
declare global {
//   interface Window {
//     KokoroTTS: any;
//     TextSplitterStream: any;
//   }

  interface Navigator {
    gpu?: any;
  }
}

// Global variables
let activeAudio: HTMLAudioElement | null = null;
let kokoroModel: any = null;
let isModelLoading = false;
let audioContext: AudioContext | null = null;
let audioQueue: any[] = [];
let isPlaying = false;
let isPaused = false;
let currentAudioSource: AudioBufferSourceNode | null = null;

// Log function
function log(message: string): void {
  console.log(message);
  const logEl = document.getElementById('log');
  if (logEl) {
    logEl.textContent = (logEl.textContent || '') + message + '\n';
  }
}

// Initialize the audio context
function initAudioContext(): void {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      log('Audio context initialized');
    } catch (error: any) {
      log('Error initializing audio context: ' + error.message);
    }
  }
}

// Function to initialize the Kokoro model
async function initKokoroModel(useWebGPU: boolean = false): Promise<void> {
  if (kokoroModel || isModelLoading) {
    log('Model already loaded or loading');
    return;
  }

  isModelLoading = true;

  try {
    // Send status update
    chrome.runtime.sendMessage({
      type: 'modelStatus',
      status: 'loading'
    });

    log('Initializing Kokoro model...');

    if (useWebGPU && window.navigator.gpu) {
      log('Attempting to use WebGPU for model inference...');

      try {
        // Initialize Kokoro with WebGPU
        log('Loading model with WebGPU...');
        kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'fp32',
          device: 'webgpu'
        });
        log('Model loaded successfully with WebGPU!');
      } catch (gpuError: any) {
        log(`WebGPU initialization failed: ${gpuError.message}`);
        log('Falling back to default backend...');

        // Fall back to default backend
        kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'q8',
          device: 'wasm'
        });
      }
    } else {
      // Initialize Kokoro with default backend
      log('Loading model with default backend...');
      kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm'
      });
    }

    log('Model loaded successfully!');

    // Initialize audio context
    initAudioContext();

    // Send status update
    chrome.runtime.sendMessage({
      type: 'modelStatus',
      status: 'ready'
    });
  } catch (error: any) {
    log(`Error loading model: ${error.message}`);

    // Send status update
    chrome.runtime.sendMessage({
      type: 'modelStatus',
      status: 'error',
      errorMessage: error.message
    });

    kokoroModel = null;
  } finally {
    isModelLoading = false;
  }
}

// Function to play audio chunks from the queue
async function playNextInQueue(): Promise<void> {
  if (audioQueue.length === 0 || isPlaying || isPaused) {
    return;
  }

  isPlaying = true;
  const audioChunk = audioQueue.shift();

  try {
    log(`Playing chunk with length: ${audioChunk.audio.length}, sampling rate: ${audioChunk.sampling_rate}`);

    if (!audioContext) {
      initAudioContext();
    }

    if (!audioContext) {
      throw new Error('Audio context not available');
    }

    // Create audio buffer from Float32Array
    const buffer = audioContext.createBuffer(1, audioChunk.audio.length, audioChunk.sampling_rate);
    const channelData = buffer.getChannelData(0);
    channelData.set(audioChunk.audio);

    // Play the audio
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);

    // Store the current audio source for pause/resume functionality
    currentAudioSource = source;

    // When this chunk ends, play the next one
    source.onended = () => {
      log('Chunk playback completed');
      isPlaying = false;
      currentAudioSource = null;
      playNextInQueue();
    };

    source.start();
    log('Playing audio chunk...');
  } catch (error: any) {
    log('Error playing audio chunk: ' + error.message);
    isPlaying = false;
    currentAudioSource = null;
    playNextInQueue(); // Try the next chunk
  }
}

// Function to pause audio playback
function pauseAudio(): void {
  log('Pausing audio playback');

  // If using HTML Audio element
  if (activeAudio) {
    activeAudio.pause();
  }

  // If using Web Audio API
  if (audioContext && isPlaying) {
    // We can't actually pause a buffer source node, so we need to stop it
    // and recreate it when resuming. For now, we'll just set the isPaused flag
    // and stop adding new chunks to the queue.
    isPaused = true;

    if (currentAudioSource) {
      try {
        currentAudioSource.stop();
        currentAudioSource = null;
      } catch (error) {
        log('Error stopping audio source: ' + error);
      }
    }

    isPlaying = false;
  }
}

// Function to resume audio playback
function resumeAudio(): void {
  log('Resuming audio playback');

  // If using HTML Audio element
  if (activeAudio) {
    activeAudio.play().catch(error => {
      log('Error resuming audio: ' + error);
    });
  }

  // If using Web Audio API
  if (audioContext && isPaused) {
    isPaused = false;

    // Start playing the next chunk in the queue
    playNextInQueue();
  }
}

// Function to play audio using Kokoro TTS
async function playAudioWithKokoro(text: string, useWebGPU: boolean = false): Promise<void> {
  log('Generating speech for: ' + text);

  // Stop any currently playing audio
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  // Clear any existing audio queue
  audioQueue = [];
  isPlaying = false;
  isPaused = false;

  // Make sure the model is initialized
  if (!kokoroModel) {
    try {
      await initKokoroModel(useWebGPU);
    } catch (error: any) {
      log('Failed to initialize model: ' + error.message);

      // Send error event
      chrome.runtime.sendMessage({
        type: 'ttsEvent',
        eventType: 'error',
        utterance: text,
        errorMessage: `Failed to initialize model: ${error.message}`
      });

      return;
    }
  }

  try {
    // Send start event immediately
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'start',
      utterance: text
    });

    // Use the TextSplitterStream for proper sentence splitting
    const splitter = new TextSplitterStream();

    // Split the text into sentences and push them to the stream
    splitter.push(text);

    // Close the stream to indicate no more text will be added
    splitter.close();

    // Use the stream method with the TextSplitterStream
    let sentenceCount = 0;
    let totalAudioLength = 0;

    // Start streaming generation
    for await (const chunk of kokoroModel.stream(splitter)) {
      sentenceCount++;
      log(`Received chunk ${sentenceCount}: "${chunk.text}"`);

      // Add the audio chunk to the queue
      audioQueue.push(chunk.audio);
      totalAudioLength += chunk.audio.audio.length;

      // Log detailed information about the audio chunk
      log(`Audio chunk ${sentenceCount}: length=${chunk.audio.audio.length}, sampling_rate=${chunk.audio.sampling_rate}`);

      // Start playing if this is the first chunk and not already playing
      if (sentenceCount === 1) {
        playNextInQueue();
      }
    }

    log('Speech generation completed!');
    log(`Generated ${sentenceCount} chunks with total length: ${totalAudioLength} samples`);

    // Wait for all audio to finish playing
    const checkPlaybackComplete = () => {
      if (isPlaying || audioQueue.length > 0) {
        setTimeout(checkPlaybackComplete, 100);
      } else {
        // Send end event
        chrome.runtime.sendMessage({
          type: 'ttsEvent',
          eventType: 'end',
          utterance: text
        });
      }
    };

    checkPlaybackComplete();
  } catch (error: any) {
    log('Error generating speech: ' + error.message);

    // Send error event
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'error',
      utterance: text,
      errorMessage: `Error generating speech: ${error.message}`
    });
  }
}

// Legacy function to play audio from the API (keeping for fallback)
function playAudioFromApi(text: string): void {
  log('Offscreen document playing audio from API for: ' + text);

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
    log('Audio playback ended');

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

// Function to check if WebGPU is available
function isWebGPUAvailable(): boolean {
  const hasWebGPU = !!window.navigator.gpu;
  log(`WebGPU available: ${hasWebGPU}`);
  return hasWebGPU;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  log('Offscreen document received message: ' + JSON.stringify(message));

  if (message.target === 'offscreen') {
    if (message.type === 'initModel') {
      // Check WebGPU availability in the offscreen document
      const useWebGPU = isWebGPUAvailable();

      // Initialize the model
      initKokoroModel(useWebGPU)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });

      // Return true to indicate we will send a response asynchronously
      return true;
    } else if (message.type === 'playAudio' && message.text) {
      // Check WebGPU availability in the offscreen document
      const useWebGPU = isWebGPUAvailable();

      // Use Kokoro TTS if the model is loaded, otherwise fall back to API
      if (kokoroModel) {
        playAudioWithKokoro(message.text, useWebGPU)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            sendResponse({ success: false, error: error.message });
          });
      } else {
        // Try to initialize the model first
        initKokoroModel(useWebGPU)
          .then(() => {
            // Now use Kokoro TTS
            return playAudioWithKokoro(message.text, useWebGPU);
          })
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            // Fall back to API if model initialization fails
            log('Falling back to API: ' + error.message);
            playAudioFromApi(message.text);
            sendResponse({ success: true });
          });
      }

      // Return true to indicate we will send a response asynchronously
      return true;
    } else if (message.type === 'pauseAudio') {
      // Pause audio playback
      pauseAudio();
      sendResponse({ success: true });
      return true;
    } else if (message.type === 'resumeAudio') {
      // Resume audio playback
      resumeAudio();
      sendResponse({ success: true });
      return true;
    } else if (message.type === 'stopAudio') {
      // Stop any currently playing audio
      if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
      }

      // Clear the audio queue and reset playing state
      audioQueue = [];
      isPlaying = false;
      isPaused = false;

      // Stop any current audio source
      if (currentAudioSource) {
        try {
          currentAudioSource.stop();
          currentAudioSource = null;
        } catch (error) {
          log('Error stopping audio source: ' + error);
        }
      }

      sendResponse({ success: true });
      return true;
    }
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Log when the offscreen document is loaded
console.log('Sherlock TTS offscreen document loaded');
