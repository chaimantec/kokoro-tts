import { KokoroTTS, env, TextSplitterStream } from 'kokoro-js';

// Configure environment for the worker
env.wasmPaths = "/onnxruntime-web/"
env.allowRemoteModels = false;
env.allowLocalModels = true;

declare global {
  interface Navigator {
    gpu?: any;
  }
}

// Worker state
let kokoroModel: any = null;
let isModelLoading = false;
let currentPlaybackId:string = '';

// Message types for worker communication
interface WorkerMessage {
  id: string;
  type: 'initModel' | 'generateSpeech';
  data?: any;
}

interface InitModelData {
  voicePath: string;
  useWebGPU?: boolean;
}

interface GenerateSpeechData {
  text: string;
  voice: string;
  speed: number;
  pitch: number;
  playbackId: string;
}

interface WorkerResponse {
  id: string;
  type: 'modelReady' | 'modelError' | 'audioChunk' | 'generationComplete' | 'generationError';
  data?: any;
}

// Function to initialize the Kokoro model
async function initKokoroModel(voicePath: string, useWebGPU: boolean = false): Promise<void> {
  if (kokoroModel || isModelLoading) {
    console.log('Model already loaded or loading in worker');
    return;
  }

  console.log('worker: voicePath', voicePath);
  env.voicePath = voicePath
  isModelLoading = true;

  try {
    console.log('Initializing Kokoro model in worker...');

    if (useWebGPU && self.navigator?.gpu) {
      console.log('Attempting to use WebGPU for model inference in worker...');

      try {
        // Initialize Kokoro with WebGPU using bundled model
        console.log('Loading model with WebGPU in worker...');
        kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          dtype: 'fp32',
          device: 'webgpu'
        });
        console.log('Model loaded successfully with WebGPU in worker!');
      } catch (gpuError: any) {
        console.error(`WebGPU initialization failed in worker: ${gpuError.message}`);
      }
    }

    if (!kokoroModel) {
      // Initialize Kokoro with default backend using bundled model
      console.log('Loading model with default backend in worker...');
      kokoroModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8',
        device: 'wasm'
      });
    }

    console.log('Model loaded successfully in worker!');
  } catch (error: any) {
    console.error(`Error loading model in worker: ${error.message}`);
    kokoroModel = null;
    throw error;
  } finally {
    isModelLoading = false;
  }
}

// Function to generate speech using Kokoro TTS
async function generateSpeech(text: string, voice: string, speed:number, pitch:number, playbackId: string): Promise<void> {
  console.log(`Generating speech in worker for: "${text}" with voice: ${voice || 'default'}`);

  if (!kokoroModel) {
    throw new Error('Model not loaded');
  }

  try {
    currentPlaybackId = playbackId;
    console.log('worker getting speech...', text);
    console.log('playbackid', playbackId);

    // Use the TextSplitterStream for proper sentence splitting
    const splitter = new TextSplitterStream();

    // Split the text into sentences and push them to the stream
    splitter.push(text);

    // Close the stream to indicate no more text will be added
    splitter.close();

    // Prepare generation options
    const options: any = {};
    if (voice) {
      options.voice = voice;
    }

    let sentenceCount = 0;
    let totalAudioLength = 0;

    console.log("worker about to stream...");

    // Start streaming generation with voice parameter if provided
    for await (const chunk of kokoroModel.stream(splitter, options)) {
      if (currentPlaybackId !== playbackId) {
        console.log(`Received audio chunk for old playback session - ignoring. Current playback ID: ${currentPlaybackId}, received playback ID: ${playbackId}`);
        continue;
      }

      sentenceCount++;
      console.log(`Worker received chunk ${sentenceCount} from ${playbackId}: "${chunk.text}"`);

      // Send the audio chunk back to the main thread
      const response: WorkerResponse = {
        id: playbackId || '',
        type: 'audioChunk',
        data: {
          playbackId,
          voice,
          speed,
          pitch,
          audio: chunk.audio,
          text: chunk.text,
          chunkIndex: sentenceCount
        }
      };

      self.postMessage(response);
      totalAudioLength += chunk.audio.audio.length;

      // Log detailed information about the audio chunk
      console.log(`Audio chunk ${sentenceCount}: length=${chunk.audio.audio.length}, sampling_rate=${chunk.audio.sampling_rate}`);
    }

    console.log(`Speech generation completed in worker! Generated ${sentenceCount} chunks with total length: ${totalAudioLength} samples`);

    // Send completion message
    const completionResponse: WorkerResponse = {
      id: playbackId || '',
      type: 'generationComplete',
      data: {
        playbackId,
        voice,
        speed,
        pitch,
        totalChunks: sentenceCount,
        totalAudioLength: totalAudioLength
      }
    };

    self.postMessage(completionResponse);
  } catch (error: any) {
    console.error('Error generating speech in worker: ' + error.message);

    // Send error message
    const errorResponse: WorkerResponse = {
      id: playbackId || '',
      type: 'generationError',
      data: {
        error: error.message
      }
    };

    self.postMessage(errorResponse);
  }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data } = event.data;
  console.log(`Worker received message: ${type} with id: ${id}`);

  try {
    switch (type) {
      case 'initModel':
        const initData = data as InitModelData;
        console.log('initData', initData);
        await initKokoroModel(initData?.voicePath, initData?.useWebGPU || false);
        
        const modelResponse: WorkerResponse = {
          id,
          type: 'modelReady',
          data: { success: true }
        };
        self.postMessage(modelResponse);
        break;

      case 'generateSpeech':
        const speechData = data as GenerateSpeechData;
        await generateSpeech(speechData.text, speechData.voice, speechData.speed, speechData.pitch, speechData.playbackId);
        break;

      default:
        console.warn(`Unknown message type in worker: ${type}`);
    }
  } catch (error: any) {
    console.error(`Error handling message in worker: ${error.message}`);
    
    const errorResponse: WorkerResponse = {
      id,
      type: type === 'initModel' ? 'modelError' : 'generationError',
      data: { error: error.message }
    };
    self.postMessage(errorResponse);
  }
});

// Log when the worker is loaded
console.log('Kokoro TTS worker loaded and ready');
