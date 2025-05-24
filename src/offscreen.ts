import { OffscreenMessage } from './types';
import { PitchShifter } from './audio-processor';
import type { PlaybackStatus } from './types';

// Add a PitchShifter instance
let pitchShifter: PitchShifter | null = null;

declare global {
  interface Navigator {
    gpu?: any;
  }
}

// Web worker for TTS generation
let kokoroWorker: Worker | null = null;
let isModelLoading = false;
let isModelReady = false;
let audioContext: AudioContext | null = null;
let audioQueue: any[] = [];
let isPlaying = false;
let isPaused = false;
let playbackStatus: PlaybackStatus = 'idle';
let currentAudioSource: AudioBufferSourceNode | null = null;
let currentPlaybackId: string | null = null; // Unique ID for current playback session

// Keep-alive mechanism
let keepAliveInterval: number | null = null;

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

// Function to initialize the web worker and Kokoro model
async function initKokoroModel(useWebGPU: boolean = false): Promise<void> {
  if (isModelReady || isModelLoading) {
    console.log('Model already loaded or loading');
    return;
  }

  isModelLoading = true;

  try {
    // Send loading status update
    chrome.runtime.sendMessage({
      type: 'modelStatus',
      status: 'loading'
    });

    console.log('Initializing Kokoro worker...');

    // Create the web worker if it doesn't exist
    if (!kokoroWorker) {
      kokoroWorker = new Worker(new URL('./kokoro-worker.ts', import.meta.url), {
        type: 'module'
      });

      // Set up worker message handler
      kokoroWorker.onmessage = handleWorkerMessage;
      kokoroWorker.onerror = (error) => {
        console.error('Worker error:', error);
        chrome.runtime.sendMessage({
          type: 'modelStatus',
          status: 'error',
          errorMessage: 'Worker initialization failed'
        });
      };
    }

    // Initialize the model in the worker
    const initPromise = new Promise<void>((resolve, reject) => {
      const messageId = generatePlaybackId();

      // Store the promise resolvers for this message
      (window as any).workerPromises = (window as any).workerPromises || {};
      (window as any).workerPromises[messageId] = { resolve, reject };

      kokoroWorker!.postMessage({
        id: messageId,
        type: 'initModel',
        data: { 
          voicePath: chrome.runtime.getURL('voices') || '/voices',
          useWebGPU }
      });
    });

    await initPromise;

    console.log('Model loaded successfully in worker!');
    isModelReady = true;

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

    isModelReady = false;
  } finally {
    isModelLoading = false;
  }
}

// Function to handle messages from the web worker
function handleWorkerMessage(event: MessageEvent): void {
  const { id, type, data } = event.data;
  console.log(`Received worker message: ${type} with id: ${id}`);

  // Get the promise resolvers for this message
  const workerPromises = (window as any).workerPromises || {};
  const promise = workerPromises[id];

  switch (type) {
    case 'modelReady':
      if (promise) {
        promise.resolve();
        delete workerPromises[id];
      }
      break;

    case 'modelError':
      if (promise) {
        promise.reject(new Error(data.error));
        delete workerPromises[id];
      }
      break;

    case 'audioChunk':
      // Add the audio chunk to the queue for playback
      if (data.playbackId !== currentPlaybackId) {
        console.log(`Received audio chunk for old playback session - ignoring. Current playback ID: ${currentPlaybackId}, received playback ID: ${data.playbackId}`);
        return;
      }
      console.log(`Received audio chunk ${data.chunkIndex}: "${data.text}"`);
      audioQueue.push(data);

      // Start playing if this is the first chunk and not already playing
      if (data.chunkIndex === 1 || !isPlaying) {
        playNextInQueue(data.speed, data.pitch);
      }
      break;

    case 'generationComplete':
      console.log(`Speech generation completed! Generated ${data.totalChunks} chunks: playbackId=${data.playbackId}`);
      break;

    case 'generationError':
      console.error(`Speech generation error: ${data.error}`);
      // Send error event
      chrome.runtime.sendMessage({
        type: 'ttsEvent',
        eventType: 'error',
        utterance: '',
        errorMessage: `Error generating speech: ${data.error}`
      });
      break;

    default:
      console.warn(`Unknown worker message type: ${type}`);
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
    const currentChunk = audioQueue.shift();

    console.log(`Playing chunk with length: ${currentChunk.audio.audio.length}, sampling rate: ${currentChunk.audio.sampling_rate}`);

    if (!audioContext) {
      initAudioContext();
    }

    if (!audioContext || !pitchShifter) {
      throw new Error('Audio context or pitch shifter not available');
    }

    // Create audio buffer from Float32Array
    const currentBuffer = audioContext.createBuffer(1, currentChunk.audio.audio.length, currentChunk.audio.sampling_rate);
    const channelData = currentBuffer.getChannelData(0);
    channelData.set(currentChunk.audio.audio);

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

// Helper function to generate a unique ID
function generatePlaybackId(): string {
  return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

// Function to play audio using Kokoro TTS via web worker
async function playAudioWithKokoro(
  text: string,
  voice: string,
  speed: number,
  pitch: number
): Promise<void> {
  console.log(`Generating speech for: "${text}" with voice: ${voice || 'default'}, speed: ${speed || 1.0}, pitch: ${pitch || 1.0}`);

  // Generate a new playback ID for this session
  const playbackId = generatePlaybackId();
  console.log(`Starting new playback session with ID: ${playbackId}`);

  // Set as current playback ID
  currentPlaybackId = playbackId;

  // Clear any existing audio queue
  audioQueue = [];
  isPlaying = false;
  isPaused = false;

  try {
    // Send start event immediately
    chrome.runtime.sendMessage({
      type: 'ttsEvent',
      eventType: 'start',
      utterance: text
    });

    // Ensure we have a worker and model ready
    if (!kokoroWorker || !isModelReady) {
      throw new Error('Worker or model not ready');
    }

    // Send generation request to worker
    kokoroWorker.postMessage({
      id: playbackId,
      type: 'generateSpeech',
      data: {
        text,
        voice,
        speed,
        pitch,
        playbackId
      }
    });

    // Set up completion checking
    const checkPlaybackComplete = () => {
      // Only continue checking if this playback session is still current
      if (currentPlaybackId !== playbackId) {
        console.log(`Playback completion check cancelled - session ${playbackId} is no longer current`);
        return;
      }

      if (isPlaying || audioQueue.length > 0) {
        setTimeout(checkPlaybackComplete, 100);
      } else {
        // Send end event only if this session is still current
        chrome.runtime.sendMessage({
          type: 'ttsEvent',
          eventType: 'end',
          utterance: text
        });
      }
    };

    // Start checking for completion after a short delay to allow first chunk to arrive
    setTimeout(checkPlaybackComplete, 1000);

  } catch (error: any) {
    // Only send error if this playback session is still current
    if (currentPlaybackId === playbackId) {
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
}

// Function to check if WebGPU is available
function isWebGPUAvailable(): boolean {
  const hasWebGPU = !!window.navigator.gpu;
  console.log(`WebGPU available: ${hasWebGPU}`);
  return hasWebGPU;
}

function stopAudio(notify:boolean) {
  // Immediately stop all audio playback
  console.log('Stopping all audio playback immediately');

  // Invalidate the current playback ID to stop TTS streaming
  const oldPlaybackId = currentPlaybackId;
  currentPlaybackId = null;
  console.log(`Invalidated playback ID: ${oldPlaybackId}`);

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

  // Notify background script about playback status
  if (notify) {
    chrome.runtime.sendMessage({
      type: 'playbackStatus',
      state: 'idle'
    });
  }

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
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (message: OffscreenMessage, _sender, sendResponse) => {
  console.log('Offscreen document received message: ' + JSON.stringify(message));

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
      // Check if model is ready
      if (!isModelReady) {
        try {
          // Initialize the model first
          const useWebGPU = isWebGPUAvailable();
          await initKokoroModel(useWebGPU);
        } catch (error: any) {
          console.error('Error initializing model: ' + error.message);
          sendResponse({ success: false, error: error.message });
          return true;
        }
      }

      stopAudio(false);

      playAudioWithKokoro(
        message.text,
        message.voice || "af_heart",
        message.speed || 1.0,
        message.pitch || 1.0
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
        if (isModelReady) {
          // Model is already loaded
          chrome.runtime.sendMessage({
            type: 'modelStatus',
            status: 'ready'
          });
        } else {
          // Model is not loaded yet, but we'll consider it ready
          // since we're bundling the model files
          chrome.runtime.sendMessage({
            type: 'modelStatus',
            status: 'ready'
          });

          // Initialize the model in the background
          const useWebGPU = isWebGPUAvailable();
          initKokoroModel(useWebGPU);
        }

        sendResponse({ success: true });
      } catch (error: any) {
        console.error('Error checking model status:', error);
        sendResponse({ success: false, error: error.message });
      }

      return true;
    } else if (message.type === 'stopAudio') {
      stopAudio(true);
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
