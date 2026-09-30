import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { transcribeVoice } from "../api/client";
import type { ComplaintLanguage } from "@civicpulse/shared";

interface VoiceRecorderProps {
  value: string;
  reportLanguage: ComplaintLanguage | "auto";
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

interface SpeechResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}

interface SpeechErrorLike {
  error: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEventLike) => void) | null;
  onerror: ((event: SpeechErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const speakingLanguages = [
  ["hi-IN", "Hindi"],
  ["en-IN", "English (India)"],
  ["bn-IN", "Bengali"],
  ["ta-IN", "Tamil"],
  ["te-IN", "Telugu"],
  ["mr-IN", "Marathi"],
  ["gu-IN", "Gujarati"],
  ["kn-IN", "Kannada"],
  ["ml-IN", "Malayalam"],
  ["pa-IN", "Punjabi"],
] as const;

function appendText(base: string, spoken: string): string {
  const left = base.trimEnd();
  const right = spoken.trim();
  if (!right) return base;
  return left ? `${left}${/\s$/u.test(base) ? "" : " "}${right}` : right;
}

function recordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

async function convertToGeminiAudio(file: Blob): Promise<File> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const sampleRate = 16_000;
    const frameCount = Math.ceil(decoded.duration * sampleRate);
    const pcm = new DataView(new ArrayBuffer(44 + frameCount * 2));
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) =>
      decoded.getChannelData(index),
    );
    pcm.setUint8(0, 82);
    pcm.setUint8(1, 73);
    pcm.setUint8(2, 70);
    pcm.setUint8(3, 70);
    pcm.setUint32(4, 36 + frameCount * 2, true);
    pcm.setUint8(8, 87);
    pcm.setUint8(9, 65);
    pcm.setUint8(10, 86);
    pcm.setUint8(11, 69);
    pcm.setUint8(12, 102);
    pcm.setUint8(13, 109);
    pcm.setUint8(14, 116);
    pcm.setUint8(15, 32);
    pcm.setUint32(16, 16, true);
    pcm.setUint16(20, 1, true);
    pcm.setUint16(22, 1, true);
    pcm.setUint32(24, sampleRate, true);
    pcm.setUint32(28, sampleRate * 2, true);
    pcm.setUint16(32, 2, true);
    pcm.setUint16(34, 16, true);
    pcm.setUint8(36, 100);
    pcm.setUint8(37, 97);
    pcm.setUint8(38, 116);
    pcm.setUint8(39, 97);
    pcm.setUint32(40, frameCount * 2, true);
    // Resampling work is O(output frames × source channels).
    for (let frame = 0; frame < frameCount; frame += 1) {
      const sourceIndex = (frame * decoded.sampleRate) / sampleRate;
      const lower = Math.min(Math.floor(sourceIndex), decoded.length - 1);
      const upper = Math.min(lower + 1, decoded.length - 1);
      const fraction = sourceIndex - lower;
      const mixed = channels.reduce((sum, channel) => {
        const sample =
          (channel[lower] ?? 0) * (1 - fraction) + (channel[upper] ?? 0) * fraction;
        return sum + sample / channels.length;
      }, 0);
      const clipped = Math.max(-1, Math.min(1, mixed));
      pcm.setInt16(44 + frame * 2, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
    }
    return new File([pcm], "civicpulse-audio.wav", { type: "audio/wav" });
  } finally {
    await context.close();
  }
}

function friendlySpeechError(code: string): string {
  const messages: Record<string, string> = {
    "not-allowed":
      "Microphone permission is blocked. Allow microphone access in your browser settings, or type your report instead.",
    "no-speech": "No speech was detected. Try again or type your report instead.",
    "audio-capture": "No microphone was found. Connect a microphone or type your report instead.",
    network: "Browser speech recognition could not connect. Try recording again or type your report instead.",
    "language-not-supported":
      "Speech recognition does not support this language here. Choose another language or type your report instead.",
  };
  return messages[code] ?? "Speech recognition failed. You can type your report instead.";
}

export function VoiceRecorder({
  value,
  onTranscript,
  disabled = false,
}: VoiceRecorderProps) {
  const reducedMotion = useReducedMotion();
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<BrowserSpeechRecognition | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textAtStart = useRef("");
  const recognitionFinal = useRef("");
  const fallbackAfterEnd = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const latestValueRef = useRef(value);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState("hi-IN");

  onTranscriptRef.current = onTranscript;
  latestValueRef.current = value;

  function clearAutoStop() {
    if (autoStop.current !== null) clearTimeout(autoStop.current);
    autoStop.current = null;
  }

  async function startMediaRecording() {
    setError("");
    textAtStart.current = value;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Speech recognition is unavailable and audio recording is not supported. You can type your report instead.");
      return;
    }
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = activeStream;
      const mimeType = recordingMimeType();
      const activeRecorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      activeRecorder.onstop = async () => {
        clearAutoStop();
        activeStream.getTracks().forEach((track) => track.stop());
        stream.current = null;
        setRecording(false);
        const type = activeRecorder.mimeType.split(";")[0] || "audio/webm";
        const extension = type === "audio/mp4" ? "mp4" : "webm";
        const file = new File(chunks.current, `civicpulse-audio.${extension}`, { type });
        if (!file.size) {
          setError("No audio was captured. You can type your report instead.");
          return;
        }
        setTranscribing(true);
        setError("");
        try {
          const geminiAudio = await convertToGeminiAudio(file);
          const transcript = await transcribeVoice(geminiAudio, language);
          onTranscriptRef.current(appendText(latestValueRef.current, transcript));
        } catch (cause) {
          setError(
            cause instanceof Error
              ? `${cause.message} You can type your report instead.`
              : "Transcription failed. You can type your report instead.",
          );
        } finally {
          setTranscribing(false);
        }
      };
      activeRecorder.start(200);
      recorder.current = activeRecorder;
      setRecording(true);
      autoStop.current = setTimeout(() => {
        if (activeRecorder.state === "recording") activeRecorder.stop();
      }, 45_000);
    } catch (cause) {
      const message =
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? friendlySpeechError("not-allowed")
          : "Could not access the microphone. You can type your report instead.";
      setError(message);
    }
  }

  function startSpeechRecognition() {
    const windowWithRecognition = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Constructor =
      windowWithRecognition.SpeechRecognition ?? windowWithRecognition.webkitSpeechRecognition;
    if (!Constructor) {
      void startMediaRecording();
      return;
    }

    setError("");
    textAtStart.current = value;
    recognitionFinal.current = "";
    fallbackAfterEnd.current = false;
    const activeRecognition = new Constructor();
    activeRecognition.lang = language;
    activeRecognition.continuous = true;
    activeRecognition.interimResults = true;
    activeRecognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) recognitionFinal.current += transcript;
        else interim += transcript;
      }
      onTranscriptRef.current(
        appendText(textAtStart.current, `${recognitionFinal.current}${interim}`),
      );
    };
    activeRecognition.onerror = (event) => {
      if (event.error === "network") {
        fallbackAfterEnd.current = true;
        onTranscriptRef.current(textAtStart.current);
        setError("");
      } else {
        setError(friendlySpeechError(event.error));
      }
      activeRecognition.stop();
    };
    activeRecognition.onend = () => {
      recognition.current = null;
      setRecording(false);
      if (fallbackAfterEnd.current) {
        fallbackAfterEnd.current = false;
        void startMediaRecording();
        return;
      }
      if (recognitionFinal.current.trim()) {
        onTranscriptRef.current(appendText(textAtStart.current, recognitionFinal.current));
      }
    };
    recognition.current = activeRecognition;
    try {
      activeRecognition.start();
      setRecording(true);
    } catch {
      recognition.current = null;
      void startMediaRecording();
    }
  }

  function startRecording() {
    if (typeof window !== "undefined") startSpeechRecognition();
  }

  function stopRecording() {
    clearAutoStop();
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return (
    <div className="voice-control">
      <div className={`voice-mic-wrap${recording ? " is-recording" : ""}`}>
        <AnimatePresence>
          {recording && !reducedMotion && (
            <>
              <motion.span
                className="mic-ripple mic-ripple-one"
                aria-hidden="true"
                initial={{ scale: 0.75, opacity: 0.55 }}
                animate={{ scale: 1.55, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.7, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                className="mic-ripple mic-ripple-two"
                aria-hidden="true"
                initial={{ scale: 0.75, opacity: 0.4 }}
                animate={{ scale: 1.55, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.7, delay: 0.85, repeat: Infinity, ease: "easeOut" }}
              />
            </>
          )}
        </AnimatePresence>
        <button
          type="button"
          className={`mic-button${recording ? " mic-button-active" : ""}`}
          onClick={recording ? stopRecording : startRecording}
          disabled={disabled || transcribing}
          aria-label={recording ? "Stop transcription recording" : "Start voice transcription"}
        >
          {recording ? <Square size={22} fill="currentColor" /> : <Mic size={26} strokeWidth={1.8} />}
        </button>
      </div>
      <div className="voice-copy">
        <strong>{transcribing ? "Transcribing..." : recording ? "Listening" : "Prefer to speak?"}</strong>
        <span>
          {transcribing
            ? "Your words will appear here for you to review."
            : recording
              ? "Tap to stop recording"
              : "Tap the mic to add words to your report"}
        </span>
        <label className="language-chip" htmlFor="speaking-language">
          Speaking language
          <select
            id="speaking-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={recording || transcribing || disabled}
            aria-label="Speaking language"
          >
            {speakingLanguages.map(([code, name]) => (
              <option value={code} key={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span>Choose the language you will speak.</span>
      </div>
      {recording && (
        <div className="waveform" aria-label="Recording in progress" role="img">
          {Array.from({ length: 18 }, (_, index) => (
            <span key={index} style={{ animationDelay: `${index * 47}ms` }} />
          ))}
        </div>
      )}
      {error && (
        <p className="field-error voice-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
