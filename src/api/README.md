# Kokoro TTS API Server

This is a simple API server that provides a text-to-speech endpoint for the Kokoro TTS Chrome extension.

## Features

- HTTPS server with self-signed certificates
- `/api/speech/stream` endpoint that accepts a `text` query parameter
- Returns an audio stream of the synthesized speech

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Install dependencies:
   ```
   npm install
   ```

2. Generate self-signed certificates:
   ```
   npm run generate-certs
   ```

3. Start the server:
   ```
   npm start
   ```

4. The server will be running at `https://localhost:3000`

## API Endpoints

### GET /api/speech/stream

Converts text to speech and returns an audio stream.

**Query Parameters:**

- `text` (required): The text to be converted to speech

**Example:**

```
https://localhost:3000/api/speech/stream?text=Hello+world
```

### GET /health

Health check endpoint.

**Example:**

```
https://localhost:3000/health
```

## Notes

- The server uses self-signed certificates, so you may need to accept the security warning in your browser
- In a production environment, you would use proper SSL certificates
- The current implementation uses a mock TTS service. In a real application, you would use a proper TTS service like Google Cloud Text-to-Speech
