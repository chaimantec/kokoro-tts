# WebGPU Toggle Implementation Plan

## Overview

Add a UI toggle to the Chrome extension to enable/disable WebGPU for the Kokoro TTS model, with model reinitialization when the setting changes.

## Requirements

1. Add WebGPU toggle button between "Voice Settings" and "Keyboard Shortcut" sections in popup.html
2. Default to WebGPU enabled (true) for best performance
3. Save user preference to persist across sessions
4. Reinitialize Kokoro model when setting changes
5. If WebGPU is not available, fallback to WASM (no UI change needed)

## Architecture Flow

```
User toggles WebGPU in popup.html
    ↓
popup.ts saves setting to chrome.storage.sync
    ↓
popup.ts sends 'reinitModel' message to background.ts
    ↓
background.ts forwards to offscreen.ts with new useWebGPU value
    ↓
offscreen.ts terminates existing worker
    ↓
offscreen.ts creates new worker and reinitializes model
    ↓
Model loads with WebGPU (if enabled and available) or WASM
```

## Implementation Steps

### 1. Update Type Definitions (src/types.ts)

**File**: `src/types.ts`

- Add `useWebGPU` property to `TTSSettings` interface (line 39)
- Update `DEFAULT_SETTINGS` constant to include `useWebGPU: true` (line 46)
- Add new message types for model reinitialization:
  - `ReinitModelMessage` interface for popup → background
  - `ReinitModelOffscreenMessage` interface for background → offscreen
  - Add to `BackgroundMessage` and `OffscreenMessage` unions

```typescript
export interface TTSSettings {
  voice: string;
  speed: number;
  pitch: number;
  useWebGPU: boolean; // NEW
}

export const DEFAULT_SETTINGS: TTSSettings = {
  voice: "af_heart",
  speed: 1.0,
  pitch: 1.0,
  useWebGPU: true, // DEFAULT TO ENABLED
};

export interface ReinitModelMessage {
  type: "reinitModel";
  useWebGPU: boolean;
}

export interface ReinitModelOffscreenMessage {
  target: "offscreen";
  type: "reinitModel";
  useWebGPU: boolean;
}
```

### 2. Update Popup HTML (src/popup.html)

**File**: `src/popup.html`
**Location**: Between line 448 (end of Voice Settings) and line 451 (start of Keyboard Shortcut)

Add new settings section with toggle switch:

```html
<div class="settings-section">
  <p class="settings-title">Performance Settings:</p>
  <div class="toggle-control">
    <label for="webgpuToggle" class="toggle-label">
      <span>Use WebGPU Acceleration</span>
      <div class="toggle-switch">
        <input type="checkbox" id="webgpuToggle" checked />
        <span class="toggle-slider"></span>
      </div>
    </label>
    <p class="toggle-description">
      Enable for better performance. Disable if you experience issues.
    </p>
  </div>
</div>
```

Add CSS styles for toggle switch in the `<style>` section:

```css
.toggle-control {
  margin: 10px 0;
}

.toggle-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 5px;
}

.toggle-switch {
  position: relative;
  width: 50px;
  height: 26px;
}

.toggle-switch input[type="checkbox"] {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: var(--transition);
  border-radius: 26px;
  border: 2px solid var(--primary);
}

.toggle-slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--paper);
  transition: var(--transition);
  border-radius: 50%;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--primary);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(24px);
}

.toggle-description {
  font-size: 12px;
  color: var(--text);
  opacity: 0.8;
  margin-top: 5px;
  line-height: 1.4;
}
```

### 3. Update Popup Logic (src/popup.ts)

**File**: `src/popup.ts`

**Changes needed:**

1. Add `currentUseWebGPU` variable (after line 14)
2. Update `saveSettings()` to include `useWebGPU` (line 17-29)
3. Update `loadSettings()` to load `useWebGPU` (line 33-55)
4. Add event listener for WebGPU toggle in `DOMContentLoaded` (around line 333-501)
5. Load WebGPU setting from playback info (line 359-393)

```typescript
// Line 14 - Add variable
let currentUseWebGPU: boolean = DEFAULT_SETTINGS.useWebGPU;

// Update saveSettings() to include useWebGPU
async function saveSettings(): Promise<void> {
  const settings: TTSSettings = {
    voice: currentVoice,
    speed: currentSpeed,
    pitch: currentPitch,
    useWebGPU: currentUseWebGPU
  };
  // ... rest of function
}

// Update loadSettings() to load useWebGPU
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get('ttsSettings');
    if (result.ttsSettings) {
      currentVoice = result.ttsSettings.voice || DEFAULT_SETTINGS.voice;
      currentSpeed = result.ttsSettings.speed || DEFAULT_SETTINGS.speed;
      currentPitch = result.ttsSettings.pitch || DEFAULT_SETTINGS.pitch;
      currentUseWebGPU = result.ttsSettings.useWebGPU ?? DEFAULT_SETTINGS.useWebGPU;
      // ... rest of function
    }
  }
  // ... rest of function
}

// In DOMContentLoaded, add:
const webgpuToggle = document.getElementById('webgpuToggle') as HTMLInputElement;

// After loading settings:
webgpuToggle.checked = currentUseWebGPU;

// Add event listener for WebGPU toggle
webgpuToggle.addEventListener('change', async function() {
  const newUseWebGPU = this.checked;

  if (newUseWebGPU !== currentUseWebGPU) {
    currentUseWebGPU = newUseWebGPU;

    // Save the setting
    await saveSettings();

    // Show loading status
    showStatus('Reinitializing model with new settings...', 'loading', false);

    // Send message to background to reinitialize model
    try {
      await chrome.runtime.sendMessage({
        type: 'reinitModel',
        useWebGPU: currentUseWebGPU
      });

      // Show success message
      showStatus('Model reinitialized successfully', 'loading', true);
    } catch (error: any) {
      // Show error and revert toggle
      showErrorStatus(`Failed to reinitialize model: ${error.message}`);
      this.checked = !newUseWebGPU;
      currentUseWebGPU = !newUseWebGPU;
    }
  }
});
```

### 4. Update Background Script (src/background.ts)

**File**: `src/background.ts`

**Changes needed:**

1. Add message handler for 'reinitModel' message (around line 16-225)
2. Update `loadSettings()` to include `useWebGPU` (line 365-383)
3. Pass `useWebGPU` to offscreen when calling `readTextWithCustomTTS` and in TTS engine listener

```typescript
// In chrome.runtime.onMessage.addListener (around line 16):
else if (message.type === 'reinitModel') {
  // Reinitialize the model with new WebGPU setting
  (async () => {
    try {
      // Ensure we have an offscreen document
      await ensureOffscreenDocument();

      // Send message to offscreen document to reinitialize model
      await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'reinitModel',
        useWebGPU: message.useWebGPU
      });

      sendResponse({ success: true });
    } catch (error: any) {
      console.error('Error reinitializing model:', error);
      sendResponse({
        success: false,
        error: error.message || 'Unknown error'
      });
    }
  })();
  return true; // Keep the message channel open for async responses
}

// Update loadSettings() to return useWebGPU:
async function loadSettings(): Promise<TTSSettings> {
  try {
    const result = await chrome.storage.sync.get('ttsSettings');
    if (result.ttsSettings) {
      console.log('Settings loaded:', result.ttsSettings);
      return {
        voice: result.ttsSettings.voice || DEFAULT_SETTINGS.voice,
        speed: result.ttsSettings.speed || DEFAULT_SETTINGS.speed,
        pitch: result.ttsSettings.pitch || DEFAULT_SETTINGS.pitch,
        useWebGPU: result.ttsSettings.useWebGPU ?? DEFAULT_SETTINGS.useWebGPU
      };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  // Return default settings if none are saved or on error
  console.log('Using default settings');
  return { ...DEFAULT_SETTINGS };
}

// Update PlayAudioMessage to include useWebGPU when sending to offscreen
// (Lines 270-277 and 435-442 - add useWebGPU to the message)
```

### 5. Update Offscreen Script (src/offscreen.ts)

**File**: `src/offscreen.ts`

**Changes needed:**

1. Add function to reinitialize model (terminate worker and reinit)
2. Update `initKokoroModel()` to accept and respect `useWebGPU` parameter instead of auto-detecting
3. Add message handler for 'reinitModel'
4. Update 'playAudio' handler to pass `useWebGPU` from settings instead of auto-detecting

```typescript
// Update initKokoroModel signature (line 49)
async function initKokoroModel(useWebGPU: boolean): Promise<void> {
  // Remove auto-detection logic (line 521)
  // Use the passed useWebGPU parameter directly
}

// Add function to reinitialize model
async function reinitializeModel(useWebGPU: boolean): Promise<void> {
  console.log(`Reinitializing model with WebGPU: ${useWebGPU}`);

  // Stop any current playback
  stopAudio(false);

  // Terminate the existing worker
  if (kokoroWorker) {
    kokoroWorker.terminate();
    kokoroWorker = null;
    isModelReady = false;
    isModelLoading = false;
    console.log('Terminated existing worker');
  }

  // Reinitialize with new settings
  await initKokoroModel(useWebGPU);

  console.log('Model reinitialized successfully');
}

// Add message handler (around line 512-566)
else if (message.type === 'reinitModel') {
  try {
    await reinitializeModel(message.useWebGPU);
    sendResponse({ success: true });
  } catch (error: any) {
    console.error('Error reinitializing model:', error);
    sendResponse({ success: false, error: error.message });
  }
  return true;
}

// Update playAudio handler to get useWebGPU from stored settings
if (message.type === 'playAudio' && message.text) {
  if (!isModelReady) {
    try {
      // Load useWebGPU from settings instead of auto-detecting
      const result = await chrome.storage.sync.get('ttsSettings');
      const useWebGPU = result.ttsSettings?.useWebGPU ?? true;
      await initKokoroModel(useWebGPU);
    } catch (error: any) {
      // ... error handling
    }
  }
  // ... rest of handler
}
```

### 6. Update Message Types

Update the type definitions to include the new `useWebGPU` property in relevant message types:

- `PlayAudioMessage` - add optional `useWebGPU?: boolean`
- Add `ReinitModelMessage` and `ReinitModelOffscreenMessage` as shown in step 1

## Testing Checklist

After implementation, test the following scenarios:

1. ✅ **Fresh Install**: Extension should default to WebGPU enabled
2. ✅ **Toggle On to Off**: UI should update, model should reinitialize with WASM
3. ✅ **Toggle Off to On**: UI should update, model should reinitialize with WebGPU (if available)
4. ✅ **Setting Persistence**: Close and reopen popup, setting should be remembered
5. ✅ **Audio Playback**: Test TTS playback works with both settings
6. ✅ **Model Reinitialization**: Verify no memory leaks when switching multiple times
7. ✅ **WebGPU Unavailable**: On browsers without WebGPU, toggle should still work (falls back to WASM)
8. ✅ **Error Handling**: Test behavior when model fails to load

## UI Design Specification

### Toggle Section Layout

```
┌─────────────────────────────────────────────┐
│  Performance Settings:                      │
│  ┌───────────────────────────────────────┐  │
│  │ Use WebGPU Acceleration        [ON]  │  │
│  │ Enable for better performance.       │  │
│  │ Disable if you experience issues.    │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Visual States

- **ON**: Toggle slider moves to right, background color changes to primary color
- **OFF**: Toggle slider on left, background color stays gray
- **Loading**: Show status message "Reinitializing model..." while switching

## Benefits

1. **User Control**: Users can disable WebGPU if they experience compatibility issues
2. **Performance**: Default to WebGPU for best performance when available
3. **Persistence**: Setting saved across sessions
4. **Clean UX**: Simple toggle switch that's easy to understand
5. **No Breaking Changes**: Backward compatible with existing installations

## Migration Strategy

For existing users:

- When they first open the extension after update, `useWebGPU` will default to `true`
- This maintains current behavior (auto-detect and use if available)
- Users can then manually toggle off if needed

## Notes

- The toggle controls the **preference**, not the availability
- If WebGPU is not available in the browser, WASM will be used regardless of toggle state
- No need to show WebGPU availability status in UI (keep it simple)
- Model reinitialization stops any current playback
