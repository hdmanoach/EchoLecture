import React, { useMemo } from "react";

interface ReadingProgressProps {
  text: string;
  currentCharIndex: number;
  color: "sky" | "emerald";
  title: string;
}

const COLOR_CLASS = {
  sky: "bg-sky-200/80 decoration-sky-600",
  emerald: "bg-emerald-200/80 decoration-emerald-600",
};

const WINDOW_SIZE = 240;

const ReadingProgress: React.FC<ReadingProgressProps> = ({
  text,
  currentCharIndex,
  color,
  title,
}) => {
  const content = useMemo(() => {
    if (!text.trim()) {
      return { before: "", current: "", after: "" };
    }

    const safeIndex = Math.max(0, Math.min(currentCharIndex, text.length - 1));
    const startWindow = Math.max(0, safeIndex - WINDOW_SIZE / 2);
    const endWindow = Math.min(text.length, safeIndex + WINDOW_SIZE / 2);

    let wordStart = safeIndex;
    while (wordStart > startWindow && text[wordStart - 1] !== " ") {
      wordStart -= 1;
    }

    let wordEnd = safeIndex;
    while (wordEnd < endWindow && text[wordEnd] !== " ") {
      wordEnd += 1;
    }

    const before = text.slice(startWindow, wordStart);
    const current = text.slice(wordStart, Math.max(wordStart + 1, wordEnd)).trim();
    const after = text.slice(Math.max(wordStart + 1, wordEnd), endWindow);

    return {
      before: startWindow > 0 ? `...${before}` : before,
      current: current || text[safeIndex],
      after: endWindow < text.length ? `${after}...` : after,
    };
  }, [text, currentCharIndex]);

  if (!text.trim()) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <p className="text-sm leading-7 text-slate-700 break-words">
        <span>{content.before}</span>
        <span className={`rounded px-1 font-semibold underline decoration-4 ${COLOR_CLASS[color]}`}>
          {content.current}
        </span>
        <span>{content.after}</span>
      </p>
    </div>
  );
};

export default ReadingProgress;
