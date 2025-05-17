import { VOICE_NAME, PlaybackInfoResponse } from './types';

// Global variable to track the active audio element
let activeAudio: HTMLAudioElement | null = null;

// Function to play audio from the API
function playAudioFromApi(text: string, sendTtsEventId?: number): HTMLAudioElement {
  // Stop any currently playing audio
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  // Create a new audio element
  const encodedText = encodeURIComponent(text);
  const apiUrl = `https://localhost:3000/api/speech/stream?text=${encodedText}`;

  const audio = new Audio(apiUrl);
  activeAudio = audio;

  // Set up event handlers
  audio.onended = () => {
    console.log('Audio playback ended');

    // Send a message to the background script
    chrome.runtime.sendMessage({
      type: 'speechEnded',
      utterance: text,
      sendTtsEventId: sendTtsEventId
    });

    // Clear the reference to the audio element
    if (activeAudio === audio) {
      activeAudio = null;
    }
  };

  audio.onerror = (error) => {
    console.error('Audio playback error:', error);

    // Send a message to the background script
    chrome.runtime.sendMessage({
      type: 'speechError',
      errorMessage: `Error playing audio: ${error instanceof Event ? 'Unknown error' : 'Error playing audio'}`,
      sendTtsEventId: sendTtsEventId
    });

    // Clear the reference to the audio element
    if (activeAudio === audio) {
      activeAudio = null;
    }
  };

  // Start playing the audio
  audio.play().catch(error => {
    console.error('Failed to play audio:', error);

    // Send a message to the background script
    chrome.runtime.sendMessage({
      type: 'speechError',
      errorMessage: `Failed to play audio: ${error.message || 'Unknown error'}`,
      sendTtsEventId: sendTtsEventId
    });

    // Clear the reference to the audio element
    if (activeAudio === audio) {
      activeAudio = null;
    }
  });

  return audio;
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  console.log('Popup received message:', message);

  if (message.type === 'stopSpeech') {
    // Stop any currently playing audio
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }

    // Send a response to acknowledge receipt of the message
    sendResponse({ received: true });
    return true; // Keep the message channel open for async responses
  }

  // Always send a response to avoid "The message port closed before a response was received" error
  sendResponse({ received: true });
  return true; // Keep the message channel open for async responses
});

document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status') as HTMLDivElement;
  const textInput = document.getElementById('textInput') as HTMLTextAreaElement;
  const playTextButton = document.getElementById('playTextButton') as HTMLButtonElement;

  console.log('Sherlock TTS Engine popup opened');

  // Check if there's an active speech request from the background script
  chrome.runtime.sendMessage({ type: 'getPlaybackInfo' }, (response: PlaybackInfoResponse) => {
    if (response && response.isSpeaking && response.utterance) {
      console.log('Found active speech request:', response);

      // Update status
      statusElement.textContent = 'Status: Playing speech from TTS engine...';
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';

      // Play the audio
      playAudioFromApi(response.utterance, response.sendTtsEventId || undefined);
    }
  });

  // Check if our TTS engine is registered
  chrome.tts.getVoices((voices) => {
    console.log('All available TTS voices:', voices);

    // Try to find our voice with more flexible matching
    const ourVoice = voices.find(voice => {
      const match = voice.voiceName === VOICE_NAME ||
                   voice.extensionId === chrome.runtime.id;

      if (match) {
        console.log('Found our voice:', voice);
      }

      return match;
    });

    if (ourVoice) {
      statusElement.textContent = `Status: ${VOICE_NAME} Engine is registered and ready to use.`;
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';
      statusElement.style.fontWeight = 'bold';
    } else {
      statusElement.textContent = `Status: ${VOICE_NAME} Engine is not registered yet. Please reload the extension.`;
      statusElement.style.backgroundColor = '#f8d7da';
      statusElement.style.color = '#721c24';
    }
  });

  // Add event listener for the play text button
  playTextButton.addEventListener('click', function() {
    // Get the text from the input field
    const text = textInput.value.trim();

    if (!text) {
      // If the text is empty, show an error
      statusElement.textContent = 'Error: Please enter some text to read.';
      statusElement.style.backgroundColor = '#f8d7da';
      statusElement.style.color = '#721c24';
      return;
    }

    // Update status
    statusElement.textContent = 'Status: Playing text...';
    statusElement.style.backgroundColor = '#EED5AB';
    statusElement.style.color = '#744D26';

    // Play the audio directly using our helper function
    const audio = playAudioFromApi(text);

    // Set up additional event handlers for UI updates
    audio.onended = () => {
      // Update status (in addition to the default handler)
      statusElement.textContent = `Status: Playback completed.`;
      statusElement.style.backgroundColor = '#EED5AB';
      statusElement.style.color = '#744D26';
    };

    audio.onerror = () => {
      // Update status (in addition to the default handler)
      statusElement.textContent = `Error: Failed to play audio. Check the console for details.`;
      statusElement.style.backgroundColor = '#f8d7da';
      statusElement.style.color = '#721c24';
    };
  });
});
