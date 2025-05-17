// Test script for kokoro-js
import { KokoroTTS } from 'kokoro-js';

// Function to initialize Kokoro and test basic functionality
async function testKokoro() {
  try {
    console.log('Initializing Kokoro...');

    // Initialize Kokoro
    const kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX');

    // Model is loaded during from_pretrained
    console.log('Model loaded successfully!');

    // Test text-to-speech functionality
    const text = 'This is a test of the Kokoro text-to-speech system.';
    console.log(`Generating speech for: "${text}"`);

    // Generate speech
    const audioBuffer = await kokoro.textToSpeech(text);
    console.log('Speech generated successfully!');
    console.log('Audio buffer length:', audioBuffer.length);

    console.log('Kokoro test completed successfully!');
  } catch (error) {
    console.error('Error testing Kokoro:', error);
  }
}

// Run the test
testKokoro();
