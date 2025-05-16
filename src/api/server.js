const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const cors = require('cors');
const textToSpeech = require('@google-cloud/text-to-speech');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());

// Create a mock TTS client (in a real app, you would use a real TTS service)
const mockTtsClient = {
  synthesizeSpeech: async (request) => {
    console.log('TTS Request:', request);
    
    // In a real implementation, this would call a real TTS service
    // For this mock, we'll just return a simple audio buffer
    
    // Create a simple sine wave audio buffer (this is just a placeholder)
    const sampleRate = 16000;
    const duration = 2; // seconds
    const frequency = 440; // Hz (A4 note)
    const amplitude = 0.5;
    
    const numSamples = sampleRate * duration;
    const buffer = Buffer.alloc(numSamples * 2); // 16-bit samples = 2 bytes per sample
    
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin(2 * Math.PI * frequency * i / sampleRate) * amplitude * 32767;
      buffer.writeInt16LE(Math.floor(sample), i * 2);
    }
    
    return [{ audioContent: buffer }];
  }
};

// Use the mock TTS client or a real one if available
const ttsClient = process.env.USE_REAL_TTS 
  ? new textToSpeech.TextToSpeechClient()
  : mockTtsClient;

// TTS stream endpoint
app.get('/api/speech/stream', async (req, res) => {
  try {
    const text = req.query.text || 'No text provided';
    console.log(`TTS request for text: ${text}`);
    
    // Set appropriate headers for audio streaming
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    // Create a simple WAV header
    const createWavHeader = (dataLength) => {
      const buffer = Buffer.alloc(44);
      
      // RIFF chunk descriptor
      buffer.write('RIFF', 0);
      buffer.writeUInt32LE(36 + dataLength, 4); // File size
      buffer.write('WAVE', 8);
      
      // fmt sub-chunk
      buffer.write('fmt ', 12);
      buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
      buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
      buffer.writeUInt16LE(1, 22); // NumChannels (1 for mono)
      buffer.writeUInt32LE(16000, 24); // SampleRate
      buffer.writeUInt32LE(16000 * 2, 28); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
      buffer.writeUInt16LE(2, 32); // BlockAlign (NumChannels * BitsPerSample/8)
      buffer.writeUInt16LE(16, 34); // BitsPerSample
      
      // data sub-chunk
      buffer.write('data', 36);
      buffer.writeUInt32LE(dataLength, 40); // Subchunk2Size
      
      return buffer;
    };
    
    // Request TTS from the client
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'en-US', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'LINEAR16' },
    });
    
    // Create a readable stream from the audio content
    const audioContent = response.audioContent;
    const wavHeader = createWavHeader(audioContent.length);
    
    // Create a readable stream that first sends the WAV header, then the audio content
    const audioStream = new Readable({
      read() {
        this.push(wavHeader);
        this.push(audioContent);
        this.push(null); // End of stream
      }
    });
    
    // Pipe the audio stream to the response
    audioStream.pipe(res);
    
  } catch (error) {
    console.error('Error generating speech:', error);
    res.status(500).send('Error generating speech');
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Create HTTPS server with self-signed certificates
const options = {
  key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem'))
};

// Start the server
https.createServer(options, app).listen(PORT, () => {
  console.log(`TTS API server running at https://localhost:${PORT}`);
  console.log(`Test the API: https://localhost:${PORT}/api/speech/stream?text=Hello+world`);
});
