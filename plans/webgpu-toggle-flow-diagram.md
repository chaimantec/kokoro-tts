# WebGPU Toggle Feature - Data Flow Diagram

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                         (popup.html)                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  Performance Settings:                                 │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │ Use WebGPU Acceleration            [●─────]   │  │    │
│  │  │ Enable for better performance. Disable if     │  │    │
│  │  │ you experience issues.                        │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ User toggles switch
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      POPUP SCRIPT                               │
│                      (popup.ts)                                 │
│                                                                 │
│  1. Toggle event handler triggered                             │
│  2. Update currentUseWebGPU variable                           │
│  3. Save to chrome.storage.sync                                │
│  4. Show "Reinitializing..." status                            │
│  5. Send 'reinitModel' message to background                   │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ chrome.runtime.sendMessage
                         │ { type: 'reinitModel', useWebGPU: bool }
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                   BACKGROUND SCRIPT                             │
│                   (background.ts)                               │
│                                                                 │
│  1. Receive 'reinitModel' message                              │
│  2. Ensure offscreen document exists                           │
│  3. Forward to offscreen with useWebGPU setting                │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ chrome.runtime.sendMessage
                         │ { target: 'offscreen', type: 'reinitModel', useWebGPU }
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                   OFFSCREEN DOCUMENT                            │
│                   (offscreen.ts)                                │
│                                                                 │
│  1. Receive 'reinitModel' message                              │
│  2. Call reinitializeModel(useWebGPU)                          │
│     ├─ stopAudio(false)                                        │
│     ├─ kokoroWorker.terminate()                                │
│     ├─ Reset flags: isModelReady = false                       │
│     └─ initKokoroModel(useWebGPU)                              │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Create new Worker
                         │ postMessage: { type: 'initModel', useWebGPU }
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      KOKORO WORKER                              │
│                      (kokoro-worker.ts)                         │
│                                                                 │
│  1. Receive 'initModel' message                                │
│  2. Check useWebGPU flag                                       │
│  3. Initialize model:                                          │
│     ├─ if (useWebGPU && navigator.gpu):                        │
│     │   └─ Try WebGPU (device: 'webgpu', dtype: 'fp32')       │
│     └─ else:                                                   │
│         └─ Use WASM (device: 'wasm', dtype: 'q8')             │
│  4. Send 'modelReady' response                                 │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ postMessage: { type: 'modelReady' }
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                   OFFSCREEN DOCUMENT                            │
│                                                                 │
│  - Set isModelReady = true                                     │
│  - Send modelStatus to background                              │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ chrome.runtime.sendMessage
                         │ { type: 'modelStatus', status: 'ready' }
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                   BACKGROUND SCRIPT                             │
│                                                                 │
│  - Log model status                                            │
│  - Enable context menu                                         │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ Response propagates back
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│                      POPUP SCRIPT                               │
│                                                                 │
│  - Hide loading status                                         │
│  - Show success message                                        │
│  - Model ready for use                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## State Flow During Playback

```
┌──────────────────────────────────────────────────────────────┐
│                   User Initiates Playback                    │
│                   (Click Play button)                        │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  popup.ts: Send 'playTextWithTTS' with voice/speed/pitch    │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  background.ts: Load settings from chrome.storage.sync      │
│                 (includes useWebGPU)                         │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  background.ts: Forward to offscreen                         │
│                 { type: 'playAudio', text, voice, speed,     │
│                   pitch, useWebGPU }                         │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  offscreen.ts: Check if model is ready                      │
│                - If not ready: initKokoroModel(useWebGPU)   │
│                - If ready: Use existing model                │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ↓
┌──────────────────────────────────────────────────────────────┐
│  offscreen.ts: Generate and play audio                      │
│                Model uses WebGPU or WASM based on setting    │
└──────────────────────────────────────────────────────────────┘
```

## Storage Structure

```
chrome.storage.sync
└── ttsSettings
    ├── voice: string        (e.g., "af_heart")
    ├── speed: number        (e.g., 1.0)
    ├── pitch: number        (e.g., 1.0)
    └── useWebGPU: boolean   (e.g., true)  <-- NEW
```

## Message Flow Summary

### Initialize/Reinitialize Flow

1. **Popup → Background**: `{ type: 'reinitModel', useWebGPU: boolean }`
2. **Background → Offscreen**: `{ target: 'offscreen', type: 'reinitModel', useWebGPU: boolean }`
3. **Offscreen → Worker**: `{ type: 'initModel', data: { voicePath, useWebGPU } }`
4. **Worker → Offscreen**: `{ type: 'modelReady' }`
5. **Offscreen → Background**: `{ type: 'modelStatus', status: 'ready' }`

### Playback Flow (with WebGPU setting)

1. **Popup → Background**: `{ type: 'playTextWithTTS', text, voice, speed, pitch }`
2. **Background loads settings** from `chrome.storage.sync` (includes useWebGPU)
3. **Background → Offscreen**: `{ target: 'offscreen', type: 'playAudio', text, voice, speed, pitch }`
4. **Offscreen** checks if model ready, initializes with useWebGPU from storage if needed
5. **Offscreen → Worker**: `{ type: 'generateSpeech', data: { text, voice, speed, pitch, playbackId } }`
6. **Worker → Offscreen**: `{ type: 'audioChunk', data: { audio, text, chunkIndex } }` (multiple times)
7. **Offscreen** plays audio chunks
8. **Offscreen → Background**: `{ type: 'playbackStatus', state: 'playing/idle' }`
9. **Background → Popup**: Status updates

## Key Implementation Points

### 1. Settings Persistence

- Use `chrome.storage.sync` for cross-device sync
- Default value: `useWebGPU: true`
- Load on popup open and before model initialization

### 2. Model Lifecycle

- **Creation**: Worker created in `initKokoroModel()`
- **Usage**: Model persists across multiple TTS requests
- **Destruction**: Worker terminated on reinit via `kokoroWorker.terminate()`
- **Recreation**: New worker with fresh settings

### 3. Fallback Behavior

```typescript
if (useWebGPU && navigator.gpu) {
  // Try WebGPU (fp32, better performance)
  kokoroModel = await KokoroTTS.from_pretrained(..., {
    dtype: 'fp32',
    device: 'webgpu'
  });
} else {
  // Use WASM (q8, reliable)
  kokoroModel = await KokoroTTS.from_pretrained(..., {
    dtype: 'q8',
    device: 'wasm'
  });
}
```

### 4. Error Handling

- If WebGPU fails to initialize → Automatic fallback to WASM
- If reinit fails → Revert toggle state, show error message
- If playback initiated during reinit → Queue or reject with status message

## UI State Management

```typescript
// Global state in popup.ts
let currentUseWebGPU: boolean = DEFAULT_SETTINGS.useWebGPU;

// On load
async function loadSettings() {
  // Load from chrome.storage.sync
  currentUseWebGPU = result.ttsSettings?.useWebGPU ?? true;
  webgpuToggle.checked = currentUseWebGPU;
}

// On change
webgpuToggle.addEventListener("change", async () => {
  currentUseWebGPU = this.checked;
  await saveSettings(); // Persist to storage
  await reinitializeModel(); // Trigger reinit
});
```

## Testing Scenarios

| Scenario        | WebGPU Available | Toggle State | Expected Backend |
| --------------- | ---------------- | ------------ | ---------------- |
| Default install | Yes              | ON (default) | WebGPU           |
| Default install | No               | ON (default) | WASM (fallback)  |
| User toggle OFF | Yes              | OFF          | WASM             |
| User toggle OFF | No               | OFF          | WASM             |
| User toggle ON  | Yes              | ON           | WebGPU           |
| User toggle ON  | No               | ON           | WASM (fallback)  |

## Performance Considerations

- **Model Size**: ~82M parameters (Kokoro-82M)
- **WebGPU**: Faster inference, better for repeated use
- **WASM**: Slightly slower, but more compatible
- **Reinitialization**: Takes 2-5 seconds, stops current playback
