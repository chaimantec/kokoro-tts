import { OffscreenMessage } from './types';
import { KokoroTTS, TextSplitterStream, env } from 'kokoro-js';
import { PitchShifter } from './audio-processor';

env.wasmPaths = "/onnxruntime-web/"

// Add a PitchShifter instance
let pitchShifter: PitchShifter | null = null;

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
let kokoroModel: any = null;
let isModelLoading = false;
let audioContext: AudioContext | null = null;
let audioQueue: any[] = [];
let isPlaying = false;
let isPaused = false;
let currentAudioSource: AudioBufferSourceNode | null = null;

// Variables for audio playback
let currentChunk: any = null;
let currentBuffer: AudioBuffer | null = null;

// Keep-alive mechanism
let keepAliveInterval: number | null = null;

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
      pitchShifter = new PitchShifter(audioContext);
      pitchShifter.initialize().then(() => {
        log('Audio context and pitch shifter initialized');
      }).catch(error => {
        log('Error initializing pitch shifter: ' + error.message);
      });
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
async function playNextInQueue(speed: number = 1.0, pitch: number = 1.0): Promise<void> {
  try {
    // Check if we can play the next chunk
    if (audioQueue.length === 0 || isPlaying || isPaused) {
      return;
    }

    isPlaying = true;
    currentChunk = audioQueue.shift();

    log(`Playing chunk with length: ${currentChunk.audio.length}, sampling rate: ${currentChunk.sampling_rate}`);

    if (!audioContext) {
      initAudioContext();
    }

    if (!audioContext || !pitchShifter) {
      throw new Error('Audio context or pitch shifter not available');
    }

    // Create audio buffer from Float32Array
    currentBuffer = audioContext.createBuffer(1, currentChunk.audio.length, currentChunk.sampling_rate);
    const channelData = currentBuffer.getChannelData(0);
    channelData.set(currentChunk.audio);

    // Process the buffer with our pitch shifter
    const outputNode = pitchShifter.process(currentBuffer, pitch, speed);
    outputNode.connect(audioContext.destination);

    // Create a source node for tracking playback
    const source = audioContext.createBufferSource();
    source.buffer = currentBuffer;
    
    // Store the current audio source for pause/resume functionality
    currentAudioSource = source;

    // When this chunk ends, play the next one
    const playbackDuration = currentBuffer.duration / speed;
    setTimeout(() => {
      log('Chunk playback completed');
      isPlaying = false;
      currentAudioSource = null;
      currentChunk = null;
      currentBuffer = null;
      playNextInQueue(speed, pitch);
    }, playbackDuration * 1000);

    // Start playing the audio
    pitchShifter.start();

    log('Playing audio chunk...');
  } catch (error: any) {
    log(`Error playing audio chunk: ${error.message}`);
    isPlaying = false;
    currentAudioSource = null;

    // Try the next chunk
    currentChunk = null;
    currentBuffer = null;
    playNextInQueue(speed, pitch);
  }
}

// Function to pause audio playback
function pauseAudio(): void {
  log('Pausing audio playback');

  if (audioContext && isPlaying) {
    // Simply suspend the audio context - this pauses all audio processing
    // without stopping the AudioBufferSourceNode
    audioContext.suspend().then(() => {
      log('Audio context suspended successfully');
      isPaused = true;
      isPlaying = false;
    }).catch(error => {
      log('Error suspending audio context: ' + error);
    });
  }
}

// Function to resume audio playback
function resumeAudio(): void {
  log('Resuming audio playback');

  if (audioContext && isPaused) {
    // Simply resume the audio context - this continues audio processing
    // from exactly where it left off
    audioContext.resume().then(() => {
      log('Audio context resumed successfully');
      isPaused = false;
      isPlaying = true;
    }).catch(error => {
      log('Error resuming audio context: ' + error);
    });
  }
}

// Function to play audio using Kokoro TTS
async function playAudioWithKokoro(
  text: string,
  useWebGPU: boolean = false,
  voice?: string,
  speed?: number,
  pitch?: number
): Promise<void> {
  log(`Generating speech for: "${text}" with voice: ${voice || 'default'}, speed: ${speed || 1.0}, pitch: ${pitch || 1.0}`);

  // Stop any currently playing audio
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
      currentAudioSource = null;
    } catch (error) {
      log('Error stopping audio source: ' + error);
    }
  }

  // Clear any existing audio queue
  audioQueue = [];
  isPlaying = false;
  isPaused = false;

  // Reset audio playback variables
  currentChunk = null;
  currentBuffer = null;

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

    // Prepare generation options
    const options: any = {};
    if (voice) {
      options.voice = voice;
    }

    // Start streaming generation with voice parameter if provided
    for await (const chunk of kokoroModel.stream(splitter, options)) {
      sentenceCount++;
      log(`Received chunk ${sentenceCount}: "${chunk.text}"`);

      // Add the audio chunk to the queue
      audioQueue.push(chunk.audio);
      totalAudioLength += chunk.audio.audio.length;

      // Log detailed information about the audio chunk
      log(`Audio chunk ${sentenceCount}: length=${chunk.audio.audio.length}, sampling_rate=${chunk.audio.sampling_rate}`);

      // Start playing if this is the first chunk and not already playing
      if (sentenceCount === 1) {
        playNextInQueue(speed, pitch);
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
        playAudioWithKokoro(
          message.text,
          useWebGPU,
          message.voice,
          message.speed,
          message.pitch
        )
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
            return playAudioWithKokoro(
              message.text,
              useWebGPU,
              message.voice,
              message.speed,
              message.pitch
            );
          })
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            log('Error initializing model: ' + error.message);
            sendResponse({ success: false, error: error.message });
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
      // Clear the audio queue and reset playing state
      audioQueue = [];
      isPlaying = false;
      isPaused = false;

      // Reset audio playback variables
      currentChunk = null;
      currentBuffer = null;

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

// Function to keep the offscreen document alive
function startKeepAlive(): void {
  // Clear any existing interval
  if (keepAliveInterval !== null) {
    clearInterval(keepAliveInterval);
  }

  // Set up a new interval to ping every 30 seconds
  keepAliveInterval = setInterval(() => {
    log('Keep-alive ping');
    // Perform a minimal operation to keep the document active
    if (audioContext) {
      // Just check the current time to keep the audio context active
      const currentTime = audioContext.currentTime;
      log(`Current audio context time: ${currentTime}`);
    }
  }, 30000) as unknown as number; // 30 seconds
}

// Log when the offscreen document is loaded
console.log('Kokori Speak TTS offscreen document loaded');

// Start the keep-alive mechanism immediately
startKeepAlive();
