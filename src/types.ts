// Common constants
export const VOICE_NAME = 'Kokoro Speak';

// Available voices
export const AVAILABLE_VOICES = [
  { id: 'af_heart', name: 'Heart (Female) ❤️' },
  { id: 'af_alloy', name: 'Alloy (Female)' },
  { id: 'af_aoede', name: 'Aoede (Female)' },
  { id: 'af_bella', name: 'Bella (Female) ❤️' },
  { id: 'af_jessica', name: 'Jessica (Female)' }, 
  { id: 'af_kore', name: 'Kore (Female)' },
  { id: 'af_nicole', name: 'Nicole (Female) ❤️' },
  { id: 'af_nova', name: 'Nova (Female)' },
  { id: 'af_river', name: 'River (Female)' },
  { id: 'af_sarah', name: 'Sarah (Female)' },
  { id: 'af_sky', name: 'Sky (Female)' },

  { id: 'am_adam', name: 'Adam (Male)' },
  { id: 'am_echo', name: 'Echo (Male)' },
  { id: 'am_eric', name: 'Eric (Male)' },  
  { id: 'am_fenrir', name: 'Fenrir (Male)' },
  { id: 'am_liam', name: 'Liam (Male)' },
  { id: 'am_michael', name: 'Michael (Male)' },
  { id: 'am_onyx', name: 'Onyx (Male)' },
  { id: 'am_puck', name: 'Puck (Male)' },
  { id: 'am_santa', name: 'Santa (Male)' },

  { id: 'bf_emma', name: 'Emma (British Female) ❤️' },
  { id: 'bf_isabella', name: 'Isabella (British Female)' },
  { id: 'bm_george', name: 'George (British Male)' },
  { id: 'bm_lewis', name: 'Lewis (British Male)' },
  { id: 'bf_alice', name: 'Alice (British Female)' },
  { id: 'bf_lily', name: 'Lily (British Female)' },
  { id: 'bm_daniel', name: 'Daniel (British Male)' },
  { id: 'bm_fable', name: 'Fable (British Male)' }
];

// Settings interface for storage
export interface TTSSettings {
  voice: string;
  speed: number;
  pitch: number;
}

// Default settings
export const DEFAULT_SETTINGS: TTSSettings = {
  voice: 'af_heart',
  speed: 1.0,
  pitch: 1.0
};

// Message types
export interface SpeechEndedMessage {
  type: 'speechEnded';
  utterance: string;
  sendTtsEventId?: number;
}

export interface SpeechErrorMessage {
  type: 'speechError';
  errorMessage: string;
  sendTtsEventId?: number;
}

export interface GetPlaybackInfoMessage {
  type: 'getPlaybackInfo';
}

export interface PlayTextWithTTSMessage {
  type: 'playTextWithTTS';
  text: string;
  sendTtsEventId?: number;
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface PausePlaybackMessage {
  type: 'pausePlayback';
}

export interface ResumePlaybackMessage {
  type: 'resumePlayback';
}

export interface StopPlaybackMessage {
  type: 'stopPlayback';
}

export interface PlaybackStatusMessage {
  type: 'playbackStatus';
  state: 'idle' | 'playing' | 'paused';
}

export interface TtsEventMessage {
  type: 'ttsEvent';
  eventType: 'start' | 'end' | 'error';
  utterance: string;
  errorMessage?: string;
}

export interface PlayAudioMessage {
  target: 'offscreen';
  type: 'playAudio';
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
}

export interface PauseAudioMessage {
  target: 'offscreen';
  type: 'pauseAudio';
}

export interface ResumeAudioMessage {
  target: 'offscreen';
  type: 'resumeAudio';
}

export interface StopAudioMessage {
  target: 'offscreen';
  type: 'stopAudio';
}

export interface InitModelMessage {
  target: 'offscreen';
  type: 'initModel';
}

export interface ModelStatusMessage {
  type: 'modelStatus';
  status: 'loading' | 'ready' | 'error';
  errorMessage?: string;
}

export type BackgroundMessage =
  | SpeechEndedMessage
  | SpeechErrorMessage
  | GetPlaybackInfoMessage
  | PlayTextWithTTSMessage
  | PausePlaybackMessage
  | ResumePlaybackMessage
  | StopPlaybackMessage
  | TtsEventMessage
  | ModelStatusMessage;

export type OffscreenMessage =
  | PlayAudioMessage
  | PauseAudioMessage
  | ResumeAudioMessage
  | StopAudioMessage
  | InitModelMessage;

// Response types
export interface PlaybackInfoResponse {
  isSpeaking: boolean;
  utterance: string | null;
  sendTtsEventId: number | null;
  voice?: string;
  speed?: number;
  pitch?: number;
}

// Extend Chrome types
declare global {
  namespace chrome {
    namespace ttsEngine {
      interface TtsEvent {
        id: number;
      }

      function sendTtsEvent(
        eventId: number,
        event: {
          type: string;
          charIndex?: number;
          length?: number;
          errorMessage?: string;
        }
      ): void;
    }

    namespace offscreen {
      interface CreateDocumentOptions {
        url: string;
        reasons: string[];
        justification: string;
      }
    }
  }
}
