# Sherlock TTS

Sherlock TTS is a Chrome extension that provides text-to-speech functionality with a Sherlock Holmes theme. The extension registers a custom TTS engine that uses a local API endpoint for speech synthesis.

## Overview

This project implements a Chrome extension that allows users to have selected text read aloud using a custom text-to-speech engine. The extension is designed with a Sherlock Holmes theme and provides multiple ways to interact with the TTS functionality.

## Features

- **Custom TTS Engine**: Registers a custom TTS engine with Chrome
- **Multiple Activation Methods**:
  - Context menu option when text is selected
  - Keyboard shortcut (Ctrl+Shift+S or ⌘+Shift+S on Mac)
- **Background Audio Processing**: Uses Chrome's offscreen document API to play audio without requiring the popup to be open
- **Local API Integration**: Connects to a local API endpoint (`https://localhost:3000/api/speech/stream`) for speech synthesis
- **Sherlock Holmes Theme**: Styled with a Sherlock Holmes aesthetic

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Google Chrome browser

### Chrome Extension Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/sherlock-tts.git
   cd sherlock-tts
   ```

2. Set up the API server (required for TTS functionality):
   ```
   cd src/api
   npm run setup
   npm start
   ```
   This will start the API server at `https://localhost:3000`.

3. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked" and select the `src/extension` directory
   - The extension should now be installed and ready to use

4. Package the extension (optional):
   ```
   ./package-extension.sh
   ```
   This will create a `sherlock-tts-engine.zip` file that you can distribute.

## Usage

### Using the Extension

1. Make sure your local API server is running at `https://localhost:3000`
2. Select text on any webpage
3. Use one of the following methods to activate the TTS:
   - **Context Menu**: Right-click on the selected text and choose "Read with Sherlock TTS"
   - **Keyboard Shortcut**: Press `Ctrl+Shift+S` (or `⌘+Shift+S` on Mac)
4. The selected text will be read aloud automatically

### Extension Popup

The extension popup provides additional functionality:

1. Click on the Sherlock TTS icon in your browser toolbar
2. Use the buttons to:
   - **Play Sample Text**: Test the TTS engine with a sample text
   - **Test API Endpoint**: Verify the connection to the API endpoint
3. View the status of the TTS engine and instructions for use

## API Endpoint

The Chrome extension expects a local API endpoint at `https://localhost:3000/api/speech/stream` that:

- Accepts a `text` query parameter with the text to be spoken
- Returns an audio stream (MP3, WAV, or other browser-supported audio format)

Example API call:
```
https://localhost:3000/api/speech/stream?text=Hello+world
```

## Browser Compatibility

- The Chrome extension is compatible with Google Chrome and Chromium-based browsers
- The web application uses the Web Speech API, which is supported in most modern browsers

## Technical Implementation

### Chrome Extension Architecture

The extension uses a modern architecture with several key components:

1. **Background Script**: Handles the core extension functionality
   - Registers the custom TTS engine
   - Manages the context menu
   - Processes keyboard shortcuts
   - Coordinates with the offscreen document

2. **Offscreen Document**: Handles audio playback
   - Uses the Web Audio API to play audio from the API endpoint
   - Communicates with the background script via messages
   - Enables audio playback without requiring the popup to be open

3. **Popup**: Provides a user interface
   - Displays status information
   - Offers testing functionality
   - Shows usage instructions

### Technologies Used

- **Chrome Extension APIs**:
  - `ttsEngine`: For registering a custom TTS engine
  - `tts`: For text-to-speech functionality
  - `contextMenus`: For adding context menu items
  - `commands`: For keyboard shortcuts
  - `offscreen`: For background audio processing
  - `notifications`: For user notifications
  - `scripting`: For accessing page content

- **Web Technologies**:
  - JavaScript (ES6+)
  - HTML5/CSS3
  - Web Audio API

## Troubleshooting

If the TTS engine is not working:

1. **API Server Issues**:
   - Make sure your local API server is running at `https://localhost:3000`
   - Check that the API endpoint is accessible by visiting `https://localhost:3000/health`
   - Verify that the API can process requests by testing with `https://localhost:3000/api/speech/stream?text=test`

2. **Extension Issues**:
   - Verify that the extension is properly installed and enabled
   - Check the browser console for any error messages (right-click on the extension icon and select "Inspect popup")
   - Try reloading the extension from the `chrome://extensions/` page

3. **Permission Issues**:
   - Make sure you've granted all necessary permissions to the extension
   - For keyboard shortcuts, you may need to configure them in `chrome://extensions/shortcuts`

## Development Process

This extension was developed through an iterative process to overcome several technical challenges:

1. **Initial Implementation**: Started with a basic Chrome extension that registered a custom TTS engine
2. **Audio Playback Challenge**: Addressed the limitation that background scripts cannot directly play audio
3. **Popup Dependency**: Solved the issue of requiring the popup to be open for audio playback
4. **Offscreen Document Solution**: Implemented the offscreen document API for background audio processing
5. **Multiple Activation Methods**: Added keyboard shortcuts for improved user experience

## Future Enhancements

Potential improvements for future versions:

1. **Voice Options**: Add multiple voice options with different characteristics
2. **Reading Speed Controls**: Allow users to adjust reading speed directly from the context menu
3. **Text Highlighting**: Highlight text as it's being read
4. **Reading Queue**: Enable queueing of multiple text selections for sequential reading
5. **Cloud API Integration**: Option to use cloud-based TTS services for higher quality voices
6. **User Preferences**: Save and restore user preferences for voice, speed, etc.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
