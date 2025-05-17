// Pitch-shifting implementation using SoundTouch.js and Web Audio API
import { initializeSoundTouchWorklet, createSoundTouchNode } from './soundtouch-processor';

export class PitchShifter {
  private context: AudioContext;
  private processor: AudioWorkletNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private isInitialized = false;

  constructor(context: AudioContext) {
    this.context = context;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize the SoundTouch AudioWorklet
      await initializeSoundTouchWorklet(this.context);
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize PitchShifter:', error);
      throw error;
    }
  }

  process(buffer: AudioBuffer, pitch: number = 1.0, speed: number = 1.0): AudioNode {
    if (!this.isInitialized) {
      throw new Error('PitchShifter not initialized. Call initialize() first.');
    }

    // Create source node
    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;

    // If no pitch adjustment needed and speed is 1.0, just return the source
    if (pitch === 1.0 && speed === 1.0) {
      return this.source;
    }

    this.source.playbackRate.value = speed;
    pitch = pitch / speed;

    // Create the SoundTouch processor
    // SoundTouch separates pitch and tempo/rate, so we need to set them accordingly
    this.processor = createSoundTouchNode(this.context, {
      // Set pitch directly
      pitch: pitch,
      // tempo doesn't work for me (or too slow)
      tempo: 1.0,
      // Set rate to 1.0 to ensure it doesn't interfere with tempo
      rate: 1.0
    });

    console.log(`Creating SoundTouch processor with pitch: ${pitch}, tempo: ${speed}, rate: 1.0`);

    // Connect the source to the processor
    this.source.connect(this.processor);

    return this.processor;
  }

  start(when: number = 0): void {
    if (this.source) {
      this.source.start(when);
    }
  }

  stop(when: number = 0): void {
    if (this.source) {
      this.source.stop(when);
    }
  }
}
