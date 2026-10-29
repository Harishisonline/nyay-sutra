"use client";

import { useEffect, useRef, useState } from "react";
import type { Language, TranscribeResponse } from "@nyay/shared";
import { HttpError, api } from "@/lib/api";

type Phase = "idle" | "recording" | "transcribing";

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

const SPEECH_LANG: Record<Language, string> = {
  english: "en-IN",
  hinglish: "hi-IN",
  marathi: "mr-IN",
  hindi: "hi-IN",
};

function speechRecognition(): SpeechRec | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** Records one question and sends it to /voice/transcribe. Live text is best-effort from the browser. */
export function useVoiceCapture(language: Language, onHeard?: (result: TranscribeResponse) => void) {
  const onHeardRef = useRef(onHeard);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [live, setLive] = useState("");
  const [heard, setHeard] = useState<TranscribeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const languageRef = useRef(language);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<SpeechRec | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    languageRef.current = language;
    onHeardRef.current = onHeard;
  }, [language, onHeard]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      speechRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      if (seconds >= 30 && recorderRef.current && recorderRef.current.state !== "inactive") {
        setPhase("transcribing");
        recorderRef.current.stop();
        speechRef.current?.stop();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  function release() {
    speechRef.current?.stop();
    speechRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  async function start() {
    setError(null);
    setHeard(null);
    setLive("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser cannot record audio. Type your question instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void finish(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      const recognition = speechRecognition();
      if (recognition) {
        recognition.lang = SPEECH_LANG[languageRef.current];
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (ev) => {
          let text = "";
          for (let i = 0; i < ev.results.length; i += 1) {
            const chunk = ev.results[i]?.[0]?.transcript;
            if (chunk) text += chunk;
          }
          if (mounted.current) setLive(text.trim());
        };
        recognition.onerror = () => undefined;
        try {
          recognition.start();
          speechRef.current = recognition;
        } catch {
          speechRef.current = null;
        }
      }
      setElapsed(0);
      setPhase("recording");
    } catch {
      release();
      setError("Microphone access denied. Enable it in browser settings to ask by voice.");
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setPhase("transcribing");
      recorderRef.current.stop();
      speechRef.current?.stop();
    }
  }

  async function finish(blob: Blob) {
    release();
    if (!mounted.current) return;
    if (blob.size < 100) {
      setPhase("idle");
      setError("Could not transcribe. Try typing instead.");
      return;
    }
    try {
      const result = await api.transcribe(blob, languageRef.current);
      if (!mounted.current) return;
      setHeard(result);
      setLive("");
      onHeardRef.current?.(result);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof HttpError ? err.message : "Could not transcribe. Try typing instead.");
    } finally {
      if (mounted.current) setPhase("idle");
    }
  }

  return { phase, elapsed, live, heard, error, setError, setHeard, start, stop };
}
