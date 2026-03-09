# Storage Migration: Sync to Local - Implementation Summary

## Overview

This document provides the executive summary and implementation checklist for migrating the Kokoro TTS Chrome extension from synced to local storage.

## Problem

Settings are currently synced across Chrome instances using `chrome.storage.sync`. This causes issues because:

- **Hardware-specific settings** (WebGPU support, CPU thread count) differ between machines
- Syncing these causes inappropriate configurations on machines with different capabilities

## Solution

Replace `chrome.storage.sync` with `chrome.storage.local` to store settings locally on each machine.

## Implementation Approach

**Selected:** Option A - Simple migration (start fresh with defaults)

- Users will need to reconfigure settings on each machine after update
- Cleaner implementation without migration logic
- Appropriate given hardware-specific nature of settings

## Changes Required

### 1. File: [`src/background.ts`](src/background.ts:385)

**Function:** `loadSettings()`
**Line:** 385

```diff
- const result = await chrome.storage.sync.get('ttsSettings');
+ const result = await chrome.storage.local.get('ttsSettings');
```

### 2. File: [`src/popup.ts`](src/popup.ts:29)

**Function:** `saveSettings()`
**Line:** 29

```diff
- await chrome.storage.sync.set({ ttsSettings: settings });
+ await chrome.storage.local.set({ ttsSettings: settings });
```

### 3. File: [`src/popup.ts`](src/popup.ts:39)

**Function:** `loadSettings()`
**Line:** 39

```diff
- const result = await chrome.storage.sync.get('ttsSettings');
+ const result = await chrome.storage.local.get('ttsSettings');
```

### 4. File: [`CHANGELOG`](CHANGELOG:1)

Add entry documenting this change.

## Implementation Checklist

- [x] Analyze codebase and identify all `chrome.storage.sync` usage
- [x] Verify [`manifest.json`](manifest.json:6) has correct permissions (✓ already has `"storage"`)
- [ ] Update [`src/background.ts:385`](src/background.ts:385)
- [ ] Update [`src/popup.ts:29`](src/popup.ts:29)
- [ ] Update [`src/popup.ts:39`](src/popup.ts:39)
- [ ] Update [`CHANGELOG`](CHANGELOG:1)
- [ ] Build and test the extension
- [ ] Verify settings are stored locally only
- [ ] Verify settings persist after browser restart
- [ ] Verify settings do NOT sync to other Chrome instances

## Testing Scenarios

### Functional Testing

1. **Save Settings:** Change voice/speed/pitch/WebGPU/threads → Close popup → Reopen → Verify settings persisted
2. **Browser Restart:** Configure settings → Close browser → Restart → Open extension → Verify settings persisted
3. **No Sync:** Configure settings on Machine A → Sign in to Chrome on Machine B → Verify settings NOT synced

### Settings to Test

- ✓ Voice selection
- ✓ Speed slider
- ✓ Pitch slider
- ✓ WebGPU toggle
- ✓ NumThreads input

## Expected Behavior After Update

### First Launch After Update

- Extension uses default settings on each machine
- Users will see default values in popup

### User Action Required

- Users should reconfigure their preferred settings on each machine
- This is expected and appropriate for hardware-specific settings

## Risk Assessment

**Risk Level:** ⚠️ **LOW**

**Justification:**

- Simple API change (same method signatures)
- No data structure modifications
- No logic changes
- Fallback to defaults if settings don't exist (already implemented)

**Potential Issues:**

- Users may be confused about settings reset (can be addressed in update notes)
- No technical risks identified

## Additional Notes

### Why Not Include Migration Logic?

We chose not to implement one-time migration from sync to local because:

1. **Hardware-specific settings:** The primary settings (WebGPU, numThreads) should be configured per-machine anyway
2. **Simplicity:** Avoids additional migration code and potential edge cases
3. **Clean slate:** Ensures each machine gets optimal settings for its hardware
4. **User preferences:** Voice/speed/pitch are easy to reconfigure

### Manifest Permissions

The [`manifest.json`](manifest.json:6) already includes:

```json
"permissions": ["ttsEngine", "storage", "contextMenus", "offscreen", "commands", "scripting", "activeTab"]
```

The `"storage"` permission covers both `sync` and `local` storage APIs. ✓ No change needed.

## Conclusion

This is a straightforward, low-risk change that addresses the core issue of hardware-specific settings being inappropriately synced. The implementation requires:

- **3 line changes** in code files
- **1 entry** in CHANGELOG
- **Total effort:** Minimal

Ready for implementation in Code mode.
