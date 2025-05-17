// Common constants
export const VOICE_NAME = 'Sherlock TTS';
export const VOICE_LANG = 'en-US';

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
