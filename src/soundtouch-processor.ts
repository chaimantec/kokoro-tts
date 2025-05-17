// This file serves as a wrapper for the SoundTouch AudioWorklet
// It will be used to replace the current WSOLA-based pitch-processor.js

/**
 * This file is responsible for setting up the SoundTouch AudioWorklet
 * for pitch shifting in the Chrome extension.
 */

// We'll use the SoundTouch AudioWorklet from the @soundtouchjs/audio-worklet package
// The worklet file is located at node_modules/@soundtouchjs/audio-worklet/dist/soundtouch-worklet.js
// We need to make this file available to the extension

// Export a function to initialize the SoundTouch AudioWorklet
export async function initializeSoundTouchWorklet(context: AudioContext): Promise<void> {
  try {
    // Load the SoundTouch AudioWorklet
    // The file is copied from node_modules to the extension's directory during build
    const workletUrl = chrome.runtime.getURL('soundtouch-worklet.js');
    console.log(`Loading SoundTouch AudioWorklet from: ${workletUrl}`);

    await context.audioWorklet.addModule(workletUrl);
    console.log('SoundTouch AudioWorklet initialized successfully');

    // Verify that the worklet was loaded correctly
    if (context.state === 'suspended') {
      // Resume the audio context if it's suspended
      await context.resume();
      console.log('Audio context resumed');
    }
  } catch (error) {
    console.error('Failed to initialize SoundTouch AudioWorklet:', error);
    throw error;
  }
}

// Export a function to create a SoundTouch AudioWorkletNode
export function createSoundTouchNode(
  context: AudioContext,
  options: {
    pitch?: number;
    tempo?: number;
    rate?: number;
    pitchSemitones?: number;
  } = {}
): AudioWorkletNode {
  // Create the SoundTouch AudioWorkletNode with proper options
  const soundTouchNode = new AudioWorkletNode(context, 'soundtouch-processor', {
    // Use 128 samples per block for better performance
    processorOptions: {
      bufferSize: 128
    },
    // Ensure we have enough output channels
    outputChannelCount: [2]
  });

  // Set default values for all parameters to ensure proper initialization
  // Default values based on the SoundTouch worklet parameter descriptors
  soundTouchNode.parameters.get('rate')!.value = 1.0;
  soundTouchNode.parameters.get('tempo')!.value = 1.0;
  soundTouchNode.parameters.get('pitch')!.value = 1.0;
  soundTouchNode.parameters.get('pitchSemitones')!.value = 0;

  // Now override with any provided options
  if (options.pitch !== undefined) {
    soundTouchNode.parameters.get('pitch')!.value = options.pitch;
    console.log(`Setting pitch parameter to ${options.pitch}`);
  }

  if (options.tempo !== undefined) {
    soundTouchNode.parameters.get('tempo')!.value = options.tempo;
    console.log(`Setting tempo parameter to ${options.tempo}`);
  }

  if (options.rate !== undefined) {
    soundTouchNode.parameters.get('rate')!.value = options.rate;
    console.log(`Setting rate parameter to ${options.rate}`);
  }

  if (options.pitchSemitones !== undefined) {
    soundTouchNode.parameters.get('pitchSemitones')!.value = options.pitchSemitones;
    console.log(`Setting pitchSemitones parameter to ${options.pitchSemitones}`);
  }

  return soundTouchNode;
}
