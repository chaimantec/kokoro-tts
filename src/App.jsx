import { useState, useEffect } from 'react'
import { useSpeechSynthesis } from 'react-speech-kit'
import styled from 'styled-components'
import './App.css'

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 2rem;
`;

const TextArea = styled.textarea`
  width: 100%;
  height: 200px;
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  border: 1px solid #ccc;
  font-size: 1rem;
  resize: vertical;
`;

const ControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
`;

const Button = styled.button`
  background-color: #646cff;
  color: white;
  border: none;
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.3s;

  &:hover {
    background-color: #535bf2;
  }

  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`;

const VoiceSelector = styled.select`
  padding: 0.8rem;
  border-radius: 8px;
  border: 1px solid #ccc;
  font-size: 1rem;
  width: 100%;
`;

const RangeContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const RangeLabel = styled.label`
  min-width: 100px;
  text-align: left;
`;

const RangeInput = styled.input`
  flex: 1;
`;

function App() {
  const [text, setText] = useState('Welcome to Kokoro TTS. Type or paste your text here, and I will read it for you.');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const { speak, cancel, speaking, supported, voices } = useSpeechSynthesis();
  const [selectedVoice, setSelectedVoice] = useState(null);

  useEffect(() => {
    if (voices && voices.length > 0) {
      setSelectedVoice(voices[0]);
    }
  }, [voices]);

  const handleSpeak = () => {
    speak({
      text,
      voice: selectedVoice,
      rate,
      pitch,
      volume
    });
  };

  if (!supported) {
    return (
      <Container>
        <Title>Kokoro TTS</Title>
        <p>Your browser does not support the Web Speech API. Please try a different browser.</p>
      </Container>
    );
  }

  return (
    <Container>
      <Title>Kokoro TTS</Title>

      <TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste your text here..."
      />

      <ControlsContainer>
        <VoiceSelector
          value={selectedVoice ? voices.indexOf(selectedVoice) : 0}
          onChange={(e) => setSelectedVoice(voices[e.target.value])}
          disabled={!voices || voices.length === 0}
        >
          {voices && voices.map((voice, index) => (
            <option key={index} value={index}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </VoiceSelector>

        <RangeContainer>
          <RangeLabel>Rate:</RangeLabel>
          <RangeInput
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
          />
          <span>{rate}</span>
        </RangeContainer>

        <RangeContainer>
          <RangeLabel>Pitch:</RangeLabel>
          <RangeInput
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value))}
          />
          <span>{pitch}</span>
        </RangeContainer>

        <RangeContainer>
          <RangeLabel>Volume:</RangeLabel>
          <RangeInput
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
          />
          <span>{volume}</span>
        </RangeContainer>
      </ControlsContainer>

      <ButtonContainer>
        <Button onClick={handleSpeak} disabled={speaking || !text}>
          {speaking ? 'Speaking...' : 'Speak'}
        </Button>
        <Button onClick={cancel} disabled={!speaking}>
          Stop
        </Button>
      </ButtonContainer>
    </Container>
  );
}

export default App
