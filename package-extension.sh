#!/bin/bash

# Build the extension first
echo "Building Kokoro TTS Engine extension..."
npm run build

# Create a zip file of the extension
echo "Packaging Kokoro TTS Engine extension..."
cd dist
zip -r ../kokoro-speak.zip ./*
cd ..
echo "Extension packaged as kokoro-speak.zip"
echo "You can install this in Chrome by going to chrome://extensions/, enabling Developer mode, and dragging the zip file onto the page."
