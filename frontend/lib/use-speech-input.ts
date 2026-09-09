"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognition,
  joinTranscript,
  speechErrorMessage,
  type SpeechRecognitionLike,
} from "./speech";

const SILENCE_MS = 1500;

interface UseSpeechInputArgs {
  /** Called once the user stops speaking and the countdown elapses. */
  onAutoSend: (text: string) => void;
  lang?: string;
}

/**
 * Web Speech API wrapper: live partial transcript while speaking, then an
 * auto-send after a short silence that the user can cancel.
 */
export function useSpeechInput({ onAutoSend, lang = "en-US" }: UseSpeechInputArgs) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [pendingSend, setPendingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalsRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoSendRef = useRef(onAutoSend);

  useEffect(() => {
    onAutoSendRef.current = onAutoSend;
  }, [onAutoSend]);

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    finalsRef.current = [];
    setFinalText("");
    setInterim("");
    setPendingSend(false);
  }, [clearTimer]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  /** Cancel a queued auto-send but keep listening, so the user can carry on talking. */
  const cancelPending = useCallback(() => {
    clearTimer();
    setPendingSend(false);
    reset();
  }, [clearTimer, reset]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("This browser doesn't support voice input. Try Chrome, or type instead.");
      return;
    }

    setError(null);
    reset();

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalsRef.current.push(text);
        else interimText += text;
      }

      setInterim(interimText);
      const joined = joinTranscript(finalsRef.current);
      setFinalText(joined);

      // Any new speech postpones the send; silence lets it fire.
      clearTimer();
      if (joined) {
        setPendingSend(true);
        timerRef.current = setTimeout(() => {
          setPendingSend(false);
          const toSend = joinTranscript(finalsRef.current);
          finalsRef.current = [];
          setFinalText("");
          setInterim("");
          if (toSend) onAutoSendRef.current(toSend);
        }, SILENCE_MS);
      }
    };

    recognition.onerror = (event) => {
      const message = speechErrorMessage(event.error);
      if (message) setError(message);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Couldn't start the microphone. Type your answer instead.");
    }
  }, [clearTimer, lang, reset]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    supported,
    listening,
    /** What to show in the input while speaking: finals plus the in-flight words. */
    liveText: joinTranscript([finalText, interim]),
    pendingSend,
    error,
    start,
    stop,
    toggle,
    cancelPending,
    clearError: () => setError(null),
  };
}
