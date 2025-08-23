# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome extension that provides text-to-speech functionality using the Kokoro 82M v1.0 ONNX model. The extension bundles models for offline TTS processing and uses WebGPU acceleration when available.

## Architecture

- **Main Extension**: Chrome extension with popup, background, and offscreen components
- **Kokoro.js Library**: Core TTS engine library (local dependency)
- **ONNX Runtime**: Uses onnxruntime-web for model inference
- **Audio Processing**: Uses Chrome's offscreen document API and SoundTouchJS for audio processing

## Key Directories

- `src/` - Extension source code (TypeScript)
- `kokoro.js/` - Core TTS library (JavaScript/TypeScript)
- `public/` - Static assets including ONNX models and voices
- `dist/` - Built extension output

## Development Commands

### Main Extension
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production extension to `dist/`
- `npm run preview` - Preview built extension
- `npm run package-extension` - Build and package as zip file

### Kokoro.js Library
- `npm run kokorojs:build` - Build the kokoro-js library
- `cd kokoro.js && npm test` - Run tests for the core library

### Testing
- Tests are located in `kokoro.js/tests/`
- Run tests with `cd kokoro.js && npm test` (uses Vitest)

## Build Process

1. Build kokoro-js library: `npm run kokorojs:build`
2. Build extension: `npm run build`
3. Extension outputs to `dist/` directory

## Technical Stack

- **Frontend**: Vite + TypeScript for extension development
- **TTS Engine**: Kokoro.js with ONNX runtime
- **Audio**: SoundTouchJS for audio worklet processing
- **Build**: Rollup for library, Vite for extension

## Important Files

- `manifest.json` - Chrome extension manifest
- `vite.config.ts` - Vite configuration for extension
- `src/background.ts` - Background service worker
- `src/popup.ts` - Extension popup UI
- `src/kokoro-worker.ts` - Web Worker for TTS processing
- `src/offscreen.ts` - Offscreen document for audio playback