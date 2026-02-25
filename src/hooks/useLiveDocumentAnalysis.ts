import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeDocumentPrefix,
  analyzeWithGemini,
  isAiConfigured,
  mapIssueToLineColumn,
  type AnalysisIssue,
} from "../lib/readingAnalysis";

const AI_STEP = 1200;

const dedupeIssues = (issues: AnalysisIssue[]) => {
  const map = new Map<string, AnalysisIssue>();
  for (const issue of issues) {
    if (!map.has(issue.id)) map.set(issue.id, issue);
  }
  return [...map.values()].sort((a, b) => a.index - b.index);
};

export const useLiveDocumentAnalysis = (text: string, currentIndex: number) => {
  const [heuristicIssues, setHeuristicIssues] = useState<AnalysisIssue[]>([]);
  const [aiIssues, setAiIssues] = useState<AnalysisIssue[]>([]);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiEnabled = isAiConfigured();
  const aiCacheRef = useRef<Map<number, AnalysisIssue[]>>(new Map());

  useEffect(() => {
    aiCacheRef.current = new Map();
    setAiIssues([]);
    setAiError(null);
  }, [text]);

  useEffect(() => {
    if (!text.trim()) {
      setHeuristicIssues([]);
      return;
    }

    const upperBound = Math.min(text.length, Math.max(currentIndex + 1, 400));
    const prefix = text.slice(0, upperBound);
    setHeuristicIssues(analyzeDocumentPrefix(prefix).slice(0, 24));
  }, [text, currentIndex]);

  useEffect(() => {
    if (!aiEnabled) {
      setAiIssues([]);
      setAiError(null);
      return;
    }

    if (!text.trim()) {
      setAiIssues([]);
      return;
    }

    const upperBound = Math.min(text.length, Math.max(currentIndex + 1, 400));
    const bucket = Math.floor(upperBound / AI_STEP);
    const prefixLimit = Math.min(text.length, (bucket + 1) * AI_STEP);

    if (aiCacheRef.current.has(bucket)) {
      setAiIssues(aiCacheRef.current.get(bucket) ?? []);
      return;
    }

    const controller = new AbortController();
    setAiAnalyzing(true);
    setAiError(null);

    const run = async () => {
      try {
        const prefix = text.slice(0, prefixLimit);
        const aiResult = await analyzeWithGemini(prefix, controller.signal);

        const mapped = aiResult.map((issue) => mapIssueToLineColumn(prefix, issue));
        aiCacheRef.current.set(bucket, mapped.slice(0, 24));
        setAiIssues(mapped.slice(0, 24));
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setAiError("Analyse IA Gemini indisponible (verifie la cle API).");
        }
      } finally {
        if (!controller.signal.aborted) setAiAnalyzing(false);
      }
    };

    void run();
    return () => controller.abort();
  }, [aiEnabled, text, currentIndex]);

  const analysisIssues = useMemo(() => dedupeIssues([...heuristicIssues, ...aiIssues]), [heuristicIssues, aiIssues]);

  return {
    analysisIssues,
    aiEnabled,
    aiAnalyzing,
    aiError,
  };
};
