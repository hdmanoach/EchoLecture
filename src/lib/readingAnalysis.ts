export type IssueType = "logic" | "grammar" | "vocabulary";

export interface AnalysisIssue {
  id: string;
  type: IssueType;
  message: string;
  excerpt: string;
  index: number;
  line: number;
  column: number;
}

export interface CorrectionSuggestion {
  diagnosis: string;
  correction: string;
}

interface SentenceInfo {
  sentence: string;
  start: number;
}

const toLineColumn = (text: string, index: number) => {
  const safe = Math.max(0, Math.min(index, text.length));
  const before = text.slice(0, safe);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
};

const sentenceParts = (text: string): SentenceInfo[] => {
  const matches: SentenceInfo[] = [];
  const regex = /[^.!?\n]+[.!?]?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const sentence = match[0].trim();
    if (!sentence) continue;
    matches.push({ sentence, start: match.index });
  }

  return matches;
};

const buildIssue = (
  text: string,
  type: IssueType,
  message: string,
  index: number,
  excerpt: string,
): AnalysisIssue => {
  const { line, column } = toLineColumn(text, index);
  const id = `${type}-${index}-${message}`;
  return {
    id,
    type,
    message,
    excerpt: excerpt.slice(0, 180),
    index,
    line,
    column,
  };
};

const clampIndex = (index: number, max: number) => Math.max(0, Math.min(index, Math.max(0, max - 1)));

export const mapIssueToLineColumn = (text: string, issue: Omit<AnalysisIssue, "line" | "column" | "id">): AnalysisIssue => {
  const safeIndex = clampIndex(issue.index, text.length);
  const { line, column } = toLineColumn(text, safeIndex);
  const id = `${issue.type}-${safeIndex}-${issue.message}`;
  return {
    ...issue,
    id,
    index: safeIndex,
    line,
    column,
  };
};

export const analyzeDocumentPrefix = (text: string): AnalysisIssue[] => {
  const issues: AnalysisIssue[] = [];
  const sentences = sentenceParts(text);

  for (const { sentence, start } of sentences) {
    const words = sentence.match(/[A-Za-zÀ-ÿ']+/g) ?? [];
    const normalized = sentence.toLowerCase();

    if (words.length > 22 && !/[.!?]$/.test(sentence)) {
      issues.push(
        buildIssue(
          text,
          "grammar",
          "Phrase tres longue sans ponctuation finale claire.",
          start,
          sentence,
        ),
      );
    }

    if (/\s{2,}/.test(sentence)) {
      const localIndex = sentence.search(/\s{2,}/);
      issues.push(
        buildIssue(
          text,
          "grammar",
          "Espaces multiples detectes, structure potentiellement confuse.",
          start + Math.max(localIndex, 0),
          sentence,
        ),
      );
    }

    const repeatedWord = sentence.match(/\b([A-Za-zÀ-ÿ']{3,})\b(?:\s+\1\b){2,}/i);
    if (repeatedWord?.index !== undefined) {
      issues.push(
        buildIssue(
          text,
          "vocabulary",
          `Repetition forte du mot "${repeatedWord[1]}".`,
          start + repeatedWord.index,
          sentence,
        ),
      );
    }

    if ((normalized.includes("mais") && normalized.includes("donc")) ||
        (normalized.includes("cependant") && normalized.includes("par consequent"))) {
      issues.push(
        buildIssue(
          text,
          "logic",
          "Connecteurs possiblement contradictoires dans la meme phrase.",
          start,
          sentence,
        ),
      );
    }

    if (words.length > 0) {
      const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
      const ratio = uniqueWords.size / words.length;
      if (words.length >= 18 && ratio < 0.45) {
        issues.push(
          buildIssue(
            text,
            "vocabulary",
            "Variete lexicale faible sur une phrase longue.",
            start,
            sentence,
          ),
        );
      }
    }
  }

  const unique = new Map<string, AnalysisIssue>();
  for (const issue of issues) {
    if (!unique.has(issue.id)) unique.set(issue.id, issue);
  }

  return [...unique.values()].sort((a, b) => a.index - b.index);
};

type RawAiIssue = {
  type?: unknown;
  message?: unknown;
  excerpt?: unknown;
  index?: unknown;
};

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || "gemini-2.0-flash";

export const isAiConfigured = () => Boolean(GEMINI_API_KEY);

const extractJsonObject = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return "{\"issues\":[]}";
};

export const analyzeWithGemini = async (text: string, signal?: AbortSignal): Promise<AnalysisIssue[]> => {
  if (!GEMINI_API_KEY || !text.trim()) return [];

  const payload = {
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `Analyse ce texte francais et retourne UNIQUEMENT un JSON {"issues":[...]}. ` +
              `Chaque issue doit inclure: type (logic|grammar|vocabulary), message, excerpt, index.\n\n` +
              `Texte:\n${text.slice(0, 10000)}`,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text:
            "Detecte uniquement les problemes reels de logique, grammaire et vocabulaire. " +
            "Sois factuel, pas de contenu invente.",
        },
      ],
    },
    tools: [],
    safetySettings: [],
    responseSchema: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          properties: {
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                message: { type: "string" },
                excerpt: { type: "string" },
                index: { type: "number" },
              },
            },
          },
        },
      },
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Gemini error ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "{\"issues\":[]}";
  const content = extractJsonObject(raw);
  let parsed: { issues?: RawAiIssue[] } = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { issues: [] };
  }

  const issues = (parsed.issues ?? [])
    .map((item) => {
      const type = item.type;
      const message = item.message;
      const excerpt = item.excerpt;
      const index = item.index;
      if (
        (type !== "logic" && type !== "grammar" && type !== "vocabulary") ||
        typeof message !== "string" ||
        typeof excerpt !== "string" ||
        typeof index !== "number"
      ) {
        return null;
      }
      return mapIssueToLineColumn(text, { type, message, excerpt, index });
    })
    .filter((v): v is AnalysisIssue => Boolean(v));

  return issues.sort((a, b) => a.index - b.index);
};

const fallbackSuggestion = (text: string): CorrectionSuggestion => ({
  diagnosis: "Analyse IA indisponible. Ajoute VITE_GEMINI_API_KEY pour une correction intelligente.",
  correction: text.trim(),
});

const parseSuggestion = (raw: string): CorrectionSuggestion => {
  const content = extractJsonObject(raw);
  try {
    const parsed = JSON.parse(content) as { diagnosis?: unknown; correction?: unknown };
    if (typeof parsed.diagnosis === "string" && typeof parsed.correction === "string") {
      return {
        diagnosis: parsed.diagnosis.trim(),
        correction: parsed.correction.trim(),
      };
    }
  } catch {
    // ignore
  }
  return fallbackSuggestion(raw);
};

const requestGeminiSuggestion = async (prompt: string, signal?: AbortSignal): Promise<CorrectionSuggestion> => {
  if (!GEMINI_API_KEY) return fallbackSuggestion("");

  const payload = {
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text:
            "Tu es un correcteur de texte francais. " +
            "Retourne uniquement un JSON {\"diagnosis\":\"...\",\"correction\":\"...\"}.",
        },
      ],
    },
  };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) throw new Error(`Gemini error ${response.status}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  return parseSuggestion(raw);
};

export const suggestCorrectionForIssue = async (
  fullText: string,
  issue: AnalysisIssue,
  signal?: AbortSignal,
): Promise<CorrectionSuggestion> => {
  if (!isAiConfigured()) return fallbackSuggestion(issue.excerpt);

  const contextStart = Math.max(0, issue.index - 180);
  const contextEnd = Math.min(fullText.length, issue.index + 220);
  const context = fullText.slice(contextStart, contextEnd);
  const prompt =
    `Contexte du document:\n${context}\n\n` +
    `Probleme detecte: ${issue.type} | ${issue.message}\n` +
    `Extrait cible: ${issue.excerpt}\n\n` +
    "Donne le diagnostic et une version corrigee concise et propre.";

  return requestGeminiSuggestion(prompt, signal);
};

export const analyzeSelectedTextWithGemini = async (
  selectedText: string,
  signal?: AbortSignal,
): Promise<CorrectionSuggestion> => {
  if (!selectedText.trim()) return fallbackSuggestion("");
  if (!isAiConfigured()) return fallbackSuggestion(selectedText);

  const prompt =
    `Analyse ce bloc de texte selectionne:\n${selectedText}\n\n` +
    "Explique les incoherences de structure/logique/grammaire puis propose une correction complete copiable.";

  return requestGeminiSuggestion(prompt, signal);
};
