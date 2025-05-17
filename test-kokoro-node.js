// Test script for kokoro-js in Node.js
import { KokoroTTS } from 'kokoro-js';
import fs from 'fs/promises';

// Function to initialize Kokoro and test basic functionality
async function testKokoro() {
  try {
    console.log('Initializing Kokoro...');

    // Initialize Kokoro
    const kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX');
    console.log('Model loaded successfully!');

    // Test text-to-speech functionality
    const text = 'This is a test of the Kokoro text-to-speech system.';
    console.log(`Generating speech for: "${text}"`);

    // Generate speech
    const audioBuffer = await kokoro.generate(text);
    console.log('Speech generated successfully!');

    // Check the structure of the audio buffer
    console.log('Audio buffer type:', typeof audioBuffer);
    console.log('Audio buffer properties:', Object.keys(audioBuffer));

    if (audioBuffer && audioBuffer.audio) {
      console.log('Audio buffer audio length:', audioBuffer.audio.length);
      console.log('Sampling rate:', audioBuffer.sampling_rate);

      // Save the audio to a file
      const outputPath = 'test-output.wav';

      // Create a simple WAV header
      const wavHeader = createWavHeader(audioBuffer.audio.length * 2, audioBuffer.sampling_rate);

      // Convert Float32Array to Int16Array for WAV format
      const audioData = new Int16Array(audioBuffer.audio.length);
      for (let i = 0; i < audioBuffer.audio.length; i++) {
        // Convert float to int16
        audioData[i] = Math.max(-32768, Math.min(32767, audioBuffer.audio[i] * 32767));
      }

      // Combine header and audio data
      const wavBuffer = Buffer.concat([
        Buffer.from(wavHeader),
        Buffer.from(audioData.buffer)
      ]);

      await fs.writeFile(outputPath, wavBuffer);
      console.log(`Audio saved to ${outputPath}`);
    } else {
      console.log('Audio buffer structure is different than expected');
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

    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    console.log('Kokoro test completed successfully!');
  } catch (error) {
    console.error('Error testing Kokoro:', error);
  }
}

// Run the test
testKokoro();
