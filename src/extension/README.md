# Kokoro TTS Engine Chrome Extension

A Chrome extension that registers a custom TTS (Text-to-Speech) engine that uses a local API endpoint for speech synthesis.

## Features

- Registers a custom TTS engine with Chrome
- Uses a local API endpoint (`https://localhost:3000/api/speech/stream`) for speech synthesis
- Works with Chrome's built-in TTS functionality (right-click and "Read aloud")

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the `src/extension` directory
5. The extension should now be installed and ready to use

## Usage

1. Make sure your local API server is running at `https://localhost:3000`
2. Right-click on any text on a webpage and select "Read aloud"
3. Chrome should use the Kokoro TTS engine to read the text

## API Endpoint

The extension expects a local API endpoint at `https://localhost:3000/api/speech/stream` that:

- Accepts a `text` query parameter with the text to be spoken
- Returns an audio stream (MP3, WAV, or other browser-supported audio format)

Example API call:
```
https://localhost:3000/api/speech/stream?text=Hello+world
```

## Troubleshooting

If the TTS engine is not working:

1. Make sure your local API server is running
2. Check that the API endpoint is accessible
3. Verify that the extension is properly installed
4. Check the browser console for any error messages

## License

MIT
