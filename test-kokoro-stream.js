// Test script for kokoro-js streaming in Node.js
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import fs from 'fs/promises';

// Parse command line arguments
const args = process.argv.slice(2);
const useWebGPU = args.includes('--webgpu');

// Function to initialize Kokoro and test streaming functionality
async function testKokoroStreaming() {
  try {
    console.log('Initializing Kokoro...');

    // Initialize Kokoro with or without WebGPU
    let kokoro;

    if (useWebGPU) {
      console.log('Attempting to use WebGPU for model inference...');
      try {
        kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
          backend: 'webgpu'
        });
        console.log('Model loaded successfully with WebGPU!');
      } catch (error) {
        console.error('WebGPU initialization failed:', error.message);
        console.log('Falling back to default backend...');
        kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX');
      }
    } else {
      console.log('Using default backend...');
      kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX');
    }

    console.log('Model loaded successfully!');

    // Test text-to-speech functionality with streaming
    const text = 'This is a test of the Kokoro text-to-speech system. It uses streaming to generate audio in chunks. This allows for faster playback, as the audio can start playing before the entire text is processed. The TextSplitterStream class is used to split the text into sentences, which are then processed one by one.';
    console.log(`Generating speech for: "${text}"`);

    // Create a TextSplitterStream
    const splitter = new TextSplitterStream();

    // Push the text to the stream
    splitter.push(text);

    // Close the stream to indicate no more text will be added
    splitter.close();

    // Generate speech using streaming
    let chunkCount = 0;
    let totalAudioLength = 0;
    const audioChunks = [];

    console.log('Starting streaming generation...');

    // Process each chunk as it's generated
    for await (const chunk of kokoro.stream(splitter)) {
      chunkCount++;
      console.log(`\nChunk ${chunkCount}: "${chunk.text}"`);
      console.log(`Phonemes: "${chunk.phonemes}"`);
      console.log(`Audio length: ${chunk.audio.audio.length}, Sampling rate: ${chunk.audio.sampling_rate}`);

      // Store the audio chunk
      audioChunks.push(chunk.audio);
      totalAudioLength += chunk.audio.audio.length;

      // Save each chunk to a separate file
      await saveWavFile(`chunk-${chunkCount}.wav`, chunk.audio);
    }

    console.log('\nStreaming generation completed!');
    console.log(`Generated ${chunkCount} chunks with total length: ${totalAudioLength} samples`);

    // Combine all chunks into a single audio file
    if (chunkCount > 0) {
      const combinedAudio = {
        audio: new Float32Array(totalAudioLength),
        sampling_rate: audioChunks[0].sampling_rate
      };

      let offset = 0;
      for (const chunk of audioChunks) {
        combinedAudio.audio.set(chunk.audio, offset);
        offset += chunk.audio.length;
      }

      // Save the combined audio
      await saveWavFile('combined.wav', combinedAudio);
      console.log('Combined audio saved to combined.wav');
    }

    console.log('Kokoro streaming test completed successfully!');
  } catch (error) {
    console.error('Error testing Kokoro streaming:', error);
  }
}

// Function to save audio as a WAV file
async function saveWavFile(filename, audioData) {
  // Create a WAV header
  const wavHeader = createWavHeader(audioData.audio.length * 2, audioData.sampling_rate);

  // Convert Float32Array to Int16Array for WAV format
  const audioBuffer = new Int16Array(audioData.audio.length);
  for (let i = 0; i < audioData.audio.length; i++) {
    // Convert float to int16
    audioBuffer[i] = Math.max(-32768, Math.min(32767, audioData.audio[i] * 32767));
  }

  // Combine header and audio data
  const wavBuffer = Buffer.concat([
    Buffer.from(wavHeader),
    Buffer.from(audioBuffer.buffer)
  ]);

  // Save to file
  await fs.writeFile(filename, wavBuffer);
  console.log(`Audio saved to ${filename}`);
}

// Function to create a WAV header
function createWavHeader(dataLength, sampleRate) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // File length
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // Channels
  view.setUint16(22, 1, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // Block align (channels * bytes per sample)
  view.setUint16(32, 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, dataLength, true);

  return buffer;
}

// Helper function to write a string to a DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Run the test
testKokoroStreaming();
