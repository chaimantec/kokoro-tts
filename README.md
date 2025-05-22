# Kokoro Speak Chrome Extension

A Chrome extension that provides text-to-speech functionality using the Kokoro 82M v1.0 model. The extension bundles ONNX models for offline TTS processing.

[Chrome Web Store Link](https://chromewebstore.google.com/detail/kokoro-speak/apfbmojocfgjmleahkfaphoehbphpigm)

## Features

- **Bundled TTS Model**: Uses Kokoro TTS ONNX models for offline speech synthesis
- **WebGPU Acceleration**: Utilizes WebGPU when available for faster processing
- **Multiple Activation Methods**:
  - Context menu option when text is selected
  - Keyboard shortcut (Ctrl+Shift+S or ⌘+Shift+S on Mac)
  - Extension popup with text input
- **Background Audio Processing**: Uses Chrome's offscreen document API for audio playback
- **Voice/Speed/Pitch Controls**: Adjustable voice, speed, and pitch settings

## Getting Started

### Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/chaimantec/kokoro-tts.git
   cd kokoro-tts
   npm install
   ```

2. Download model files:
   ```bash
   ./download-models.sh
   ```
   Downloads ONNX model files (~418MB total) to `public/models/`.

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the extension:
   ```bash
   npm run kokorojs:build
   npm run build
   ```

5. Load in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` directory

## Usage

### Basic Usage

1. Select text on any webpage
2. Either:
   - Right-click and select "Read with Kokoro"
   - Press `Ctrl+Shift+S` (or `⌘+Shift+S` on Mac)
   - Click extension icon and use the popup interface

### Technical Notes

- Models are bundled with the extension (~418MB):
  - `model.onnx` (326MB): Full precision model for WebGPU
  - `model_quantized.onnx` (92MB): Quantized model for WASM
- Settings are saved between sessions
- Uses Chrome's offscreen document API for background audio processing

## License

MIT License
