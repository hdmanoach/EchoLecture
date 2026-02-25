import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface SpeakOptions {
  text: string;
  lang?: string;
  voice?: SpeechSynthesisVoice | null;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onBoundary?: (charIndex: number) => void;
  onEnd?: () => void;
}

interface Chunk {
  text: string;
  start: number;
}

const MAX_CHUNK_LENGTH = 220;

const splitLongSentence = (sentence: string, startOffset: number): Chunk[] => {
  const chunks: Chunk[] = [];
  let current = "";
  let currentStart = startOffset;
  let cursor = 0;

  for (const word of sentence.split(/\s+/)) {
    if (!word) continue;

    const next = current ? `${current} ${word}` : word;
    if (next.length <= MAX_CHUNK_LENGTH) {
      if (!current) currentStart = startOffset + cursor;
      current = next;
    } else {
      if (current) chunks.push({ text: current, start: currentStart });
      current = word;
      currentStart = startOffset + cursor;
    }

    cursor += word.length + 1;
  }

  if (current) chunks.push({ text: current, start: currentStart });
  return chunks;
};

const chunkText = (text: string): Chunk[] => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: Chunk[] = [];
  const sentenceRegex = /[^.!?]+[.!?]*\s*/g;
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(normalized)) !== null) {
    const sentence = match[0].trim();
    if (!sentence) continue;

    if (sentence.length <= MAX_CHUNK_LENGTH) {
      chunks.push({ text: sentence, start: match.index });
    } else {
      chunks.push(...splitLongSentence(sentence, match.index));
    }
  }

  if (chunks.length === 0) {
    chunks.push(...splitLongSentence(normalized, 0));
  }

  return chunks;
};

export const useSpeechSynthesis = () => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const queueRef = useRef<Chunk[]>([]);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const sourceTextRef = useRef("");
  const lastCharIndexRef = useRef(0);
  const lastSpeakOptionsRef = useRef<Omit<SpeakOptions, "text"> | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      clearProgressTimer();
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, [isSupported, clearProgressTimer]);

  useEffect(() => {
    if (!isSupported) return;

    const syncState = () => {
      const synth = window.speechSynthesis;
      setIsPaused(synth.paused);
      setIsSpeaking(synth.speaking && !synth.paused);
    };

    syncState();
    const intervalId = window.setInterval(syncState, 180);
    return () => window.clearInterval(intervalId);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    clearProgressTimer();
    queueRef.current = [];
    activeUtteranceRef.current = null;
    sourceTextRef.current = "";
    lastCharIndexRef.current = 0;
    lastSpeakOptionsRef.current = null;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
  }, [isSupported, clearProgressTimer]);

  const startQueue = useCallback(
    (text: string, baseOptions: Omit<SpeakOptions, "text">, startOffset = 0) => {
      const textChunks = chunkText(text);
      if (textChunks.length === 0) return;

      queueRef.current = textChunks.map((chunk) => ({
        ...chunk,
        start: chunk.start + startOffset,
      }));

      const playQueue = () => {
        const next = queueRef.current.shift();
        if (!next) {
          activeUtteranceRef.current = null;
          setIsSpeaking(false);
          setIsPaused(false);
          baseOptions.onEnd?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(next.text);
        utterance.lang = baseOptions.lang ?? "fr-FR";
        utterance.rate = baseOptions.rate ?? 0.9;
        utterance.pitch = baseOptions.pitch ?? 1;
        utterance.volume = baseOptions.volume ?? 1;

        if (baseOptions.voice) {
          utterance.voice = baseOptions.voice;
        }

        let startedAt = 0;
        let pausedAt = 0;
        let pausedDuration = 0;
        let lastBoundaryAt = 0;

        const emitProgress = (relativeIndex: number) => {
          const clamped = Math.max(0, Math.min(relativeIndex, Math.max(0, next.text.length - 1)));
          const absoluteIndex = next.start + clamped;
          if (absoluteIndex < lastCharIndexRef.current) return;
          lastCharIndexRef.current = absoluteIndex;
          baseOptions.onBoundary?.(absoluteIndex);
        };

        utterance.onstart = () => {
          clearProgressTimer();
          setIsSpeaking(true);
          setIsPaused(false);
          startedAt = Date.now();
          pausedDuration = 0;
          lastBoundaryAt = startedAt;
          emitProgress(0);

          progressTimerRef.current = window.setInterval(() => {
            if (!window.speechSynthesis.speaking || window.speechSynthesis.paused) return;

            const now = Date.now();
            if (now - lastBoundaryAt < 500) return;

            const elapsedMs = Math.max(0, now - startedAt - pausedDuration);
            const charsPerSecond = 11 * (utterance.rate || 1);
            const estimatedRelativeIndex = Math.floor((elapsedMs / 1000) * charsPerSecond);
            emitProgress(estimatedRelativeIndex);
          }, 180);
        };

        utterance.onpause = () => {
          pausedAt = Date.now();
          setIsPaused(true);
          setIsSpeaking(false);
        };

        utterance.onresume = () => {
          if (pausedAt > 0) {
            pausedDuration += Date.now() - pausedAt;
            pausedAt = 0;
          }
          setIsPaused(false);
          setIsSpeaking(true);
        };

        utterance.onboundary = (event) => {
          lastBoundaryAt = Date.now();
          emitProgress(event.charIndex);
        };

        utterance.onend = () => {
          emitProgress(next.text.length - 1);
          clearProgressTimer();
          playQueue();
        };
        utterance.onerror = () => {
          clearProgressTimer();
          playQueue();
        };

        activeUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      };

      playQueue();
    },
    [clearProgressTimer],
  );

  const speak = useCallback((options: SpeakOptions) => {
    if (!isSupported) return;

    const text = options.text;
    if (!text.trim()) return;

    window.speechSynthesis.cancel();
    setIsPaused(false);
    options.onStart?.();

    const baseOptions: Omit<SpeakOptions, "text"> = {
      lang: options.lang,
      voice: options.voice,
      rate: options.rate,
      pitch: options.pitch,
      volume: options.volume,
      onBoundary: options.onBoundary,
      onEnd: options.onEnd,
    };
    sourceTextRef.current = text;
    lastCharIndexRef.current = 0;
    lastSpeakOptionsRef.current = baseOptions;
    startQueue(text, baseOptions, 0);
  }, [isSupported, startQueue]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    if (
      !window.speechSynthesis.paused &&
      (window.speechSynthesis.speaking || activeUtteranceRef.current !== null || queueRef.current.length > 0)
    ) {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsSpeaking(false);
    }
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    if (window.speechSynthesis.paused || isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsSpeaking(true);
      return;
    }

    const sourceText = sourceTextRef.current;
    const options = lastSpeakOptionsRef.current;
    const startAt = lastCharIndexRef.current;

    if (!window.speechSynthesis.speaking && options && sourceText && startAt < sourceText.length - 1) {
      window.speechSynthesis.cancel();
      setIsPaused(false);
      startQueue(sourceText.slice(startAt), options, startAt);
    }
  }, [isPaused, isSupported, startQueue]);

  const state = useMemo(() => ({
    voices,
    isSpeaking,
    isPaused,
    isSupported,
  }), [voices, isSpeaking, isPaused, isSupported]);

  return {
    ...state,
    speak,
    pause,
    resume,
    stop,
  };
};
