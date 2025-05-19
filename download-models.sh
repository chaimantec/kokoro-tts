#!/bin/bash

# Script to download Kokoro TTS model files from Hugging Face

# Set the target directory
TARGET_DIR="public/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx"

# Create the directory structure if it doesn't exist
mkdir -p "$TARGET_DIR"

# URLs for the model files
MODEL_URL="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx?download=true"
MODEL_QUANTIZED_URL="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx?download=true"

echo "Downloading model files to $TARGET_DIR..."

# Download the model.onnx file
echo "Downloading model.onnx (this may take a while, it's about 326MB)..."
curl -L "$MODEL_URL" -o "$TARGET_DIR/model.onnx"

# Check if download was successful
if [ $? -eq 0 ]; then
    echo "Successfully downloaded model.onnx"
else
    echo "Failed to download model.onnx"
    exit 1
fi

# Download the model_quantized.onnx file
echo "Downloading model_quantized.onnx (this may take a while, it's about 92MB)..."
curl -L "$MODEL_QUANTIZED_URL" -o "$TARGET_DIR/model_quantized.onnx"

# Check if download was successful
if [ $? -eq 0 ]; then
    echo "Successfully downloaded model_quantized.onnx"
else
    echo "Failed to download model_quantized.onnx"
    exit 1
fi

echo "All model files have been downloaded successfully!"
echo "Files are located in: $TARGET_DIR"
