#!/bin/bash

# Create a zip file of the extension
echo "Packaging Kokoro TTS Engine extension..."
cd src/extension
zip -r ../../kokoro-tts-engine.zip ./*
cd ../..
echo "Extension packaged as kokoro-tts-engine.zip"
echo "You can install this in Chrome by going to chrome://extensions/, enabling Developer mode, and dragging the zip file onto the page."
