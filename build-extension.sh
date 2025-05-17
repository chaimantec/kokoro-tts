#!/bin/bash

# Build the extension with Vite
echo "Building Kokoro TTS Engine extension..."
npm run build

# Copy the manifest.json file to the dist directory
echo "Extension built successfully in the dist directory."
echo "You can load this as an unpacked extension in Chrome by going to chrome://extensions/, enabling Developer mode, and clicking 'Load unpacked'."
