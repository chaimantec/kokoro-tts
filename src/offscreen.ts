import { OffscreenMessage } from './types';
import { KokoroTTS, TextSplitterStream, env } from 'kokoro-js';
import { PitchShifter } from './audio-processor';

env.wasmPaths = "/onnxruntime-web/"

// Add a PitchShifter instance
let pitchShifter: PitchShifter | null = null;

declare global {
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

// Model cache keys
const WEBGPU_MODEL_CACHE_KEY = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx';
const WASM_MODEL_CACHE_KEY = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx';
const CACHE_NAME = 'transformers-cache';

// Function to check if a model is already in cache
async function isModelInCache(modelType: 'webgpu' | 'wasm'): Promise<boolean> {
  try {
    const cacheKey = modelType === 'webgpu' ? WEBGPU_MODEL_CACHE_KEY : WASM_MODEL_CACHE_KEY;

    // Check if the Cache API is available
    if ('caches' in window) {
      console.log('looking for model in cache', CACHE_NAME, cacheKey);
      const cache = await caches.open(CACHE_NAME);
      console.log('cache', cache);
      cache.keys().then(keys => console.log('cache keys', keys));
      const response = await cache.match(cacheKey);
      console.log('found model in cache?', !!response);
      return !!response;
    }

    return false;
  } catch (error) {
    console.error(`Error checking cache for ${modelType} model:`, error);
    return false;
  }
}

// Initialize the audio context
function initAudioContext(): void {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      pitchShifter = new PitchShifter(audioContext);
      pitchShifter.initialize().then(() => {
        console.log('Audio context and pitch shifter initialized');
      }).catch(error => {
        console.error('Error initializing pitch shifter: ' + error.message);
      });
    } catch (error: any) {
      console.error('Error initializing audio context: ' + error.message);
    }
  }
}

// Function to initialize the Kokoro model
async function initKokoroModel(useWebGPU: boolean = false, download: boolean = false): Promise<void> {
  if (kokoroModel || isModelLoading) {
    console.log('Model already loaded or loading');
    return;
  }

  isModelLoading = true;

  try {
    const modelType = useWebGPU ? 'webgpu' : 'wasm';
    if (!download && !await isModelInCache(modelType)) {
      chrome.runtime.sendMessage({
        type: 'modelStatus',
        status: 'download_required',
        modelType: modelType,
        modelSize: modelType === 'webgpu' ? '326MB' : '92.4MB'
      });

      throw new Error('Model not loaded. Download required.');
    }

    // Send loading status update
    chrome.runtime.sendMessage({
      type: 'modelStatus',
      status: 'loading'
    });

    console.log('Initializing Kokoro model...');

    if (useWebGPU && window.navigator.gpu) {
      console.log('Attempting to use WebGPU for model inference...');

      try {
        // Initialize Kokoro with WebGPU
        console.log('Loading model with WebGPU...');
        kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'fp32',
          device: 'webgpu'
        });
        console.log('Model loaded successfully with WebGPU!');
      } catch (gpuError: any) {
        console.error(`WebGPU initialization failed: ${gpuError.message}`);
      }
    }

    if (!kokoroModel) {
      // Initialize Kokoro with default backend
      console.log('Loading model with default backend...');
      kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm'
      });
    }

    console.log('Model loaded successfully!');

    // Initialize audio context
    initAudioContext();

    // Send status update
    chrome.runtime.sendMessage({
      type: 'modelStatus',
      status: 'ready'
    });
  } catch (error: any) {
    console.error(`Error loading model: ${error.message}`);

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

    console.log(`Playing chunk with length: ${currentChunk.audio.length}, sampling rate: ${currentChunk.sampling_rate}`);

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
    const timeoutId = setTimeout(() => {
      console.log('Chunk playback completed');
      isPlaying = false;
      currentAudioSource = null;
      currentChunk = null;
      currentBuffer = null;

      // Only proceed to the next chunk if we haven't been stopped
      if (audioQueue.length > 0 && audioContext && audioContext.state !== 'suspended') {
        playNextInQueue(speed, pitch);
      } else {
        console.log('No more chunks to play or playback was stopped');

        // If there are no more chunks and we're not suspended, we've completed playback
        if (audioQueue.length === 0 && audioContext && audioContext.state !== 'suspended') {
          // Notify background script about playback completion
          chrome.runtime.sendMessage({
            type: 'playbackStatus',
            state: 'idle'
          });
        }
      }
    }, playbackDuration * 1000);

    // Store the timeout ID so we can clear it if playback is stopped
    (window as any).currentChunkTimeoutId = timeoutId;

    // Start playing the audio
    pitchShifter.start();

    console.log('Playing audio chunk...');

    // Notify background script about playback status
    chrome.runtime.sendMessage({
      type: 'playbackStatus',
      state: 'playing'
    });
  } catch (error: any) {
    console.error(`Error playing audio chunk: ${error.message}`);
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
  console.log('Pausing audio playback');

  if (audioContext && isPlaying) {
    // Simply suspend the audio context - this pauses all audio processing
    // without stopping the AudioBufferSourceNode
    audioContext.suspend().then(() => {
      console.log('Audio context suspended successfully');
      isPaused = true;
      isPlaying = false;

      // Notify background script about playback status
      chrome.runtime.sendMessage({
        type: 'playbackStatus',
        state: 'paused'
      });
    }).catch(error => {
      console.error('Error suspending audio context: ' + error);
    });
  }
}

// Function to resume audio playback
function resumeAudio(): void {
  console.log('Resuming audio playback');

  if (audioContext && isPaused) {
    // Simply resume the audio context - this continues audio processing
    // from exactly where it left off
    audioContext.resume().then(() => {
      console.log('Audio context resumed successfully');
      isPaused = false;
      isPlaying = true;

      // Notify background script about playback status
      chrome.runtime.sendMessage({
        type: 'playbackStatus',
        state: 'playing'
      });
    }).catch(error => {
      console.error('Error resuming audio context: ' + error);
    });
  }
}

// Function to play audio using Kokoro TTS
async function playAudioWithKokoro(
  text: string,
  voice?: string,
  speed?: number,
  pitch?: number
): Promise<void> {
  console.log(`Generating speech for: "${text}" with voice: ${voice || 'default'}, speed: ${speed || 1.0}, pitch: ${pitch || 1.0}`);

  // Stop any currently playing audio
  if (currentAudioSource) {
    try {
      currentAudioSource.stop();
      currentAudioSource = null;
    } catch (error) {
      console.error('Error stopping audio source: ' + error);
    }
  }

  // Clear any existing audio queue
  audioQueue = [];
  isPlaying = false;
  isPaused = false;

  // Reset audio playback variables
  currentChunk = null;
  currentBuffer = null;

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
      console.log(`Received chunk ${sentenceCount}: "${chunk.text}"`);

      // Add the audio chunk to the queue
      audioQueue.push(chunk.audio);
      totalAudioLength += chunk.audio.audio.length;

      // Log detailed information about the audio chunk
      console.log(`Audio chunk ${sentenceCount}: length=${chunk.audio.audio.length}, sampling_rate=${chunk.audio.sampling_rate}`);

      // Start playing if this is the first chunk and not already playing
      if (sentenceCount === 1 || !isPlaying) {
        playNextInQueue(speed, pitch);
      }
    }

    console.log('Speech generation completed!');
    console.log(`Generated ${sentenceCount} chunks with total length: ${totalAudioLength} samples`);

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
    console.error('Error generating speech: ' + error.message);

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
  console.log(`WebGPU available: ${hasWebGPU}`);
  return hasWebGPU;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (message: OffscreenMessage, _sender, sendResponse) => {
  console.log('Offscreen document received message: ' + JSON.stringify(message));

  if (message.target === 'offscreen') {
    if (message.type === 'initModel') {
      // Check WebGPU availability in the offscreen document
      const useWebGPU = isWebGPUAvailable();

      // Initialize the model
      initKokoroModel(useWebGPU, !!message.download)
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
      if (!kokoroModel) {
        try {
          // We need to initialize the model first, but we'll need consent
          // if the model isn't already cached
          const useWebGPU = isWebGPUAvailable();
          const modelType = useWebGPU ? 'webgpu' : 'wasm';
          const modelCached = await isModelInCache(modelType);

          if (!modelCached) {
            // We need to download the model
            chrome.runtime.sendMessage({
              type: 'modelStatus',
              status: 'download_required',
              modelType: modelType,
              modelSize: modelType === 'webgpu' ? '326MB' : '92.4MB'
            });

            sendResponse({
              success: false,
              error: 'Model not loaded. Download required.'
            });
            return true;
          }

          await initKokoroModel(useWebGPU, false);
        } catch (error: any) {
          console.error('Error initializing model: ' + error.message);
          sendResponse({ success: false, error: error.message });
        }
      }

      playAudioWithKokoro(
        message.text,
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
    } else if (message.type === 'checkModelStatus') {
      // Check model status and send back to popup
      console.log('Checking model status');

      try {
        // Determine which model type we'll be using
        const useWebGPU = isWebGPUAvailable();
        const modelType = useWebGPU ? 'webgpu' : 'wasm';
        const modelSize = modelType === 'webgpu' ? '326MB' : '92.4MB';

        // Check if model is already in cache
        const modelCached = await isModelInCache(modelType);

        if (kokoroModel) {
          // Model is already loaded
          chrome.runtime.sendMessage({
            type: 'modelStatus',
            status: 'ready'
          });
        } else if (!modelCached) {
          // Model is not in cache, need download
          chrome.runtime.sendMessage({
            type: 'modelStatus',
            status: 'download_required',
            modelType: modelType,
            modelSize: modelSize
          });
        } else {
          // Model is in cache but not loaded
          chrome.runtime.sendMessage({
            type: 'modelStatus',
            status: 'ready'
          });
        }

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Error checking model status:', error);
        sendResponse({ success: false, error: error.message });
      }

      return true;
    } else if (message.type === 'stopAudio') {
      // Immediately stop all audio playback
      console.log('Stopping all audio playback immediately');

      // Clear any pending timeouts for chunk playback
      if ((window as any).currentChunkTimeoutId) {
        clearTimeout((window as any).currentChunkTimeoutId);
        (window as any).currentChunkTimeoutId = null;
        console.log('Cleared pending chunk timeout');
      }

      // Clear the audio queue and reset playing state
      audioQueue = [];
      isPlaying = false;
      isPaused = false;

      // Reset audio playback variables
      currentChunk = null;
      currentBuffer = null;

      // Notify background script about playback status
      chrome.runtime.sendMessage({
        type: 'playbackStatus',
        state: 'idle'
      });

      // Stop any current audio source
      if (currentAudioSource) {
        try {
          currentAudioSource.stop();
          currentAudioSource = null;
        } catch (error) {
          console.error('Error stopping audio source: ' + error);
        }
      }

      // Stop the pitch shifter if it exists
      if (pitchShifter) {
        try {
          pitchShifter.stop();
          console.log('Pitch shifter stopped');
        } catch (error) {
          console.error('Error stopping pitch shifter: ' + error);
        }
      }

      // Suspend the audio context to immediately stop all audio processing
      if (audioContext) {
        try {
          audioContext.suspend().then(() => {
            console.log('Audio context suspended');

            // Create a new audio context to ensure clean state for next playback
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Reinitialize the pitch shifter with the new context
            pitchShifter = new PitchShifter(audioContext);
            pitchShifter.initialize().then(() => {
              console.log('New audio context and pitch shifter initialized after stop');
            }).catch(error => {
              console.error('Error initializing new pitch shifter after stop: ' + error);
            });
          }).catch(error => {
            console.error('Error suspending audio context: ' + error);
          });
        } catch (error) {
          console.error('Error handling audio context during stop: ' + error);
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
    console.log('Keep-alive ping');
    // Perform a minimal operation to keep the document active
    if (audioContext) {
      // Just check the current time to keep the audio context active
      const currentTime = audioContext.currentTime;
      console.log(`Current audio context time: ${currentTime}`);
    }
  }, 30000) as unknown as number; // 30 seconds
}

// Log when the offscreen document is loaded
console.log('Kokoro Speak TTS offscreen document loaded');

// Start the keep-alive mechanism immediately
startKeepAlive();
