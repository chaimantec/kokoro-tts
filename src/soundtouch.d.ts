declare module 'soundtouchjs' {
  export class SoundTouch {
    constructor();
    pitch: number;
    tempo: number;
    rate: number;
  }

  export class SimpleFilter {
    constructor(sourceSound: WebAudioBufferSource, soundTouch: SoundTouch);
    extract(target: Float32Array, numFrames: number): number;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer, context: AudioContext);
    extract(target: Float32Array, numFrames: number): number;
    position: number;
    sourcePosition: number;
  }
}
