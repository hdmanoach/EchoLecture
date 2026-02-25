import React, { useRef, useState } from "react";
import { getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import Tesseract from "tesseract.js";
import ReadingProgress from "./ReadingProgress";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { configurePdfWorker } from "./pdfWorker";
import { useLiveDocumentAnalysis } from "./hooks/useLiveDocumentAnalysis";
import {
  analyzeSelectedTextWithGemini,
  suggestCorrectionForIssue,
  type AnalysisIssue,
  type CorrectionSuggestion,
} from "./lib/readingAnalysis";
import {
  deleteHistoryEntry,
  loadHistoryByType,
  saveHistoryEntry,
  type ReadingHistoryEntry,
} from "./lib/readingHistory";

configurePdfWorker();

interface PDFTextItem {
  str: string;
}

interface ReadingSlice {
  text: string;
  startOffset: number;
}

interface NormalizedText {
  normalized: string;
  indexMap: number[];
}

const JUMP_CHAR_COUNT = 260;

const normalizeWithMap = (input: string): NormalizedText => {
  let normalized = "";
  const indexMap: number[] = [];
  let previousWasSpace = true;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const isSpace = /\s/.test(char);

    if (isSpace) {
      if (!previousWasSpace) {
        normalized += " ";
        indexMap.push(i);
        previousWasSpace = true;
      }
      continue;
    }

    normalized += char;
    indexMap.push(i);
    previousWasSpace = false;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    indexMap.pop();
  }

  return { normalized, indexMap };
};

const PdfReader: React.FC = () => {
  const [texte, setTexte] = useState("");
  const [loading, setLoading] = useState(false);
  const [documentName, setDocumentName] = useState("Document PDF");
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [activeReadingText, setActiveReadingText] = useState("");
  const [activeDocCharIndex, setActiveDocCharIndex] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<ReadingHistoryEntry[]>([]);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [issueSuggestions, setIssueSuggestions] = useState<Record<string, CorrectionSuggestion>>({});
  const [issueLoadingId, setIssueLoadingId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selectedTextSuggestion, setSelectedTextSuggestion] = useState<CorrectionSuggestion | null>(null);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { voices, isSpeaking, isPaused, isSupported, speak, pause, resume, stop } = useSpeechSynthesis();
  const { analysisIssues, aiEnabled, aiAnalyzing, aiError } = useLiveDocumentAnalysis(texte, activeDocCharIndex);

  React.useEffect(() => {
    setHistoryEntries(loadHistoryByType("pdf"));
  }, []);

  const activeIssue = analysisIssues.find((issue) => issue.id === activeIssueId) ?? null;

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // noop
    }
  };

  const loadIssueSuggestion = async (issue: AnalysisIssue) => {
    setActiveIssueId(issue.id);
    if (issueSuggestions[issue.id]) return;
    setIssueLoadingId(issue.id);
    try {
      const suggestion = await suggestCorrectionForIssue(texte, issue);
      setIssueSuggestions((prev) => ({ ...prev, [issue.id]: suggestion }));
    } catch {
      setIssueSuggestions((prev) => ({
        ...prev,
        [issue.id]: {
          diagnosis: "Impossible de recuperer une correction IA pour ce bloc.",
          correction: issue.excerpt,
        },
      }));
    } finally {
      setIssueLoadingId(null);
    }
  };

  const handleSelectedTextAnalyze = async () => {
    if (!selectedText.trim()) return;
    setSelectionLoading(true);
    setSelectionError(null);
    try {
      const suggestion = await analyzeSelectedTextWithGemini(selectedText);
      setSelectedTextSuggestion(suggestion);
    } catch {
      setSelectionError("Analyse de la selection indisponible.");
    } finally {
      setSelectionLoading(false);
    }
  };

  const obtenirTexteDepuisCurseur = (): ReadingSlice => {
    if (!textareaRef.current) return { text: texte, startOffset: 0 };

    const cursorPos = textareaRef.current.selectionStart;
    const textAvantCurseur = texte.substring(0, cursorPos);

    let indexDernierePonctuation = -1;
    for (let i = textAvantCurseur.length - 1; i >= 0; i -= 1) {
      if (textAvantCurseur[i] === "." || textAvantCurseur[i] === "!" || textAvantCurseur[i] === "?") {
        indexDernierePonctuation = i;
        break;
      }
    }

    const startOffset = indexDernierePonctuation === -1 ? 0 : indexDernierePonctuation + 1;
    return { text: texte.substring(startOffset), startOffset };
  };

  const lancerLecture = (textToRead: string, startOffset = 0) => {
    const { normalized, indexMap } = normalizeWithMap(textToRead);
    if (!normalized) return;

    const frenchVoice = voices.find((v) => v.lang.startsWith("fr"));
    setActiveReadingText(normalized);
    setCurrentCharIndex(0);
    setActiveDocCharIndex(startOffset);

    speak({
      text: normalized,
      lang: frenchVoice?.lang ?? "fr-FR",
      voice: frenchVoice ?? voices[0] ?? null,
      rate: 0.9,
      pitch: 1,
      volume: 1,
      onBoundary: (charIndex) => {
        setCurrentCharIndex(charIndex);
        const mappedLocalIndex = indexMap[Math.min(charIndex, indexMap.length - 1)] ?? 0;
        setActiveDocCharIndex(startOffset + mappedLocalIndex);
      },
      onEnd: () => {
        setCurrentCharIndex(0);
        setActiveDocCharIndex(startOffset);
      },
    });
  };

  const jumpAndRead = (delta: number) => {
    if (!texte.trim()) return;

    const maxIndex = Math.max(0, texte.length - 1);
    const baseIndex = Math.max(0, Math.min(activeDocCharIndex, maxIndex));
    const targetIndex = Math.max(0, Math.min(baseIndex + delta, maxIndex));

    stop();
    const textFromTarget = texte.slice(targetIndex);
    lancerLecture(textFromTarget, targetIndex);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDocumentName(file.name);
    setLoading(true);
    setTexte("");
    setActiveReadingText("");
    setActiveDocCharIndex(0);
    stop();

    const reader = new FileReader();
    reader.onload = async (event: ProgressEvent<FileReader>) => {
      const arrayBuffer = event.target?.result as ArrayBuffer;

      try {
        const pdf: PDFDocumentProxy = await getDocument(arrayBuffer).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i += 1) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();

          const pageText = (content.items as unknown[])
            .filter((item): item is PDFTextItem => typeof item === "object" && item !== null && "str" in item)
            .map((item) => item.str)
            .join(" ");

          if (pageText.trim() === "") {
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext("2d");

            if (context) {
              await page.render({ canvas, canvasContext: context, viewport }).promise;
              const imageData = canvas.toDataURL("image/png");
              const { data } = await Tesseract.recognize(imageData, "fra");
              fullText += `${data.text}\n\n`;
            }
          } else {
            fullText += `${pageText}\n\n`;
          }
        }

        setTexte(fullText);
        lancerLecture(fullText);
      } catch (err) {
        console.error("Erreur lecture PDF :", err);
        alert("Impossible de lire ce PDF");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  React.useEffect(() => {
    if (!texte.trim()) return;
    const timeout = window.setTimeout(() => {
      saveHistoryEntry("pdf", documentName, texte, activeDocCharIndex);
      setHistoryEntries(loadHistoryByType("pdf"));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [documentName, texte, activeDocCharIndex]);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !texte) return;
    if (!isSpeaking && !isPaused) return;

    const safeIndex = Math.max(0, Math.min(activeDocCharIndex, texte.length - 1));
    let wordStart = safeIndex;
    let wordEnd = safeIndex;

    while (wordStart > 0 && !/\s/.test(texte[wordStart - 1])) wordStart -= 1;
    while (wordEnd < texte.length && !/\s/.test(texte[wordEnd])) wordEnd += 1;

    if (document.activeElement !== textarea) {
      textarea.focus({ preventScroll: true });
    }
    textarea.setSelectionRange(wordStart, wordEnd);

    const textBefore = texte.slice(0, wordStart);
    const lineNumber = textBefore.split("\n").length;
    const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 24;
    textarea.scrollTop = Math.max(0, (lineNumber - 4) * lineHeight);
  }, [activeDocCharIndex, isSpeaking, isPaused, texte]);

  return (
    <div className="rounded-2xl border border-sky-100 bg-gradient-to-b from-white to-sky-50/30 p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lecteur PDF + OCR</h2>
          <p className="mt-1 text-sm text-slate-600">Importe un PDF texte ou scanne. OCR automatique si necessaire.</p>
        </div>
        <span className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">Surlignage bleu</span>
      </div>

      {!isSupported && (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          La synthese vocale n'est pas supportee par ce navigateur.
        </p>
      )}

      <div className="mb-6 rounded-xl border border-sky-200 bg-white p-4">
        <label className="mb-2 block text-sm font-semibold text-slate-700">Choisis un fichier PDF</label>
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          disabled={loading}
          className="block w-full cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-700"
        />
        {loading && <p className="mt-3 text-sm font-medium text-sky-700">Analyse PDF + OCR en cours...</p>}
      </div>

      {texte && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            <section className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => lancerLecture(texte)}
                disabled={isSpeaking || loading || !isSupported}
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Lire tout
              </button>
              <button
                type="button"
                onClick={() => {
                  const slice = obtenirTexteDepuisCurseur();
                  lancerLecture(slice.text, slice.startOffset);
                }}
                disabled={isSpeaking || loading || !isSupported}
                className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Depuis curseur
              </button>
              <button
                type="button"
                onClick={() => jumpAndRead(-JUMP_CHAR_COUNT)}
                disabled={loading || !isSupported}
                className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Saut arriere
              </button>
              <button
                type="button"
                onClick={() => jumpAndRead(JUMP_CHAR_COUNT)}
                disabled={loading || !isSupported}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Saut avant
              </button>
              <button
                type="button"
                onClick={pause}
                disabled={!isSpeaking || loading}
                className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={resume}
                disabled={!isPaused}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Reprendre
              </button>
              <button
                type="button"
                onClick={stop}
                disabled={!isSpeaking && !isPaused}
                className="col-span-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:col-span-2"
              >
                Arreter
              </button>
            </section>

            <ReadingProgress
              title="Ou la lecture est rendue"
              text={activeReadingText}
              currentCharIndex={currentCharIndex}
              color="sky"
            />

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Analyse en direct
              </h3>
              <p className="mb-3 text-[11px] text-slate-500">
                IA: {aiEnabled ? (aiAnalyzing ? "analyse..." : "active") : "desactivee (ajoute VITE_GEMINI_API_KEY)"}
              </p>
              {aiError && <p className="mb-2 text-[11px] text-rose-600">{aiError}</p>}
              <button
                type="button"
                onClick={() => setIsAnalysisOpen(true)}
                className="mb-3 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Analyse ({analysisIssues.length})
              </button>
              {analysisIssues.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun signal detecte pour la partie deja lue.</p>
              ) : (
                <ul className="space-y-2">
                  {analysisIssues.slice(-6).map((issue) => (
                    <li key={issue.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="text-xs font-semibold text-slate-700">
                        {issue.type.toUpperCase()} - Ligne {issue.line}, Col {issue.column}
                      </p>
                      <p className="text-xs text-slate-600 break-words">{issue.message}</p>
                      <p className="mt-1 text-[11px] text-slate-500 break-words">"{issue.excerpt}"</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Historique
              </h3>
              {historyEntries.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun historique de lecture pour PDF.</p>
              ) : (
                <ul className="space-y-2">
                  {historyEntries.slice(0, 4).map((entry) => (
                    <li key={entry.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="truncate text-xs font-semibold text-slate-700">{entry.documentName}</p>
                      <p className="text-[11px] text-slate-500">
                        Position: {entry.currentIndex} - {new Date(entry.updatedAt).toLocaleString()}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDocumentName(entry.documentName);
                            setTexte(entry.text);
                            setActiveDocCharIndex(entry.currentIndex);
                            const slice = entry.text.slice(entry.currentIndex);
                            lancerLecture(slice, entry.currentIndex);
                          }}
                          className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white"
                        >
                          Reprendre
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            deleteHistoryEntry(entry.id);
                            setHistoryEntries(loadHistoryByType("pdf"));
                          }}
                          className="rounded bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700"
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Texte extrait du PDF</label>
            <textarea
              ref={textareaRef}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              onSelect={() => {
                const textarea = textareaRef.current;
                if (!textarea) return;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const picked = start < end ? texte.slice(start, end).trim() : "";
                if (!picked) return;
                setSelectedText(picked);
                setSelectedTextSuggestion(null);
                setSelectionError(null);
              }}
              readOnly={isSpeaking || isPaused}
              className="h-[360px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 font-serif text-[15px] leading-7 text-slate-800 selection:bg-sky-300 selection:text-slate-900 focus:border-sky-400 focus:outline-none sm:h-[520px]"
            />
            <p className="mt-2 text-xs text-slate-500">Place le curseur dans le texte puis utilise “Depuis curseur”.</p>
            {selectedText.trim() && (
              <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-slate-600">Bloc selectionne:</p>
                  <button type="button" onClick={() => { setSelectedText(""); setSelectedTextSuggestion(null); setSelectionError(null); }} className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">Effacer</button>
                </div>
                <p className="max-h-20 overflow-auto break-words whitespace-pre-wrap rounded bg-white p-2 text-xs text-slate-700">{selectedText}</p>
                <button
                  type="button"
                  onClick={handleSelectedTextAnalyze}
                  disabled={selectionLoading}
                  className="mt-2 rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300"
                >
                  {selectionLoading ? "Analyse..." : "Demander a l'analyseur"}
                </button>
                {selectionError && <p className="mt-2 text-xs text-rose-600">{selectionError}</p>}
                {selectedTextSuggestion && (
                  <div className="mt-2 rounded border border-slate-200 bg-white p-2">
                    <p className="text-xs font-semibold text-slate-700">Diagnostic</p>
                    <p className="text-xs text-slate-600 break-words whitespace-pre-wrap">{selectedTextSuggestion.diagnosis}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-700">Correction</p>
                    <p className="whitespace-pre-wrap break-words text-xs text-slate-700">{selectedTextSuggestion.correction}</p>
                    <button
                      type="button"
                      onClick={() => copyText(selectedTextSuggestion.correction)}
                      className="mt-2 rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                    >
                      Copier correction
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {isAnalysisOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="grid h-[85vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-xl md:grid-cols-[340px_1fr]">
            <div className="overflow-auto border-r border-slate-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Analyse complete</h3>
                <button
                  type="button"
                  onClick={() => setIsAnalysisOpen(false)}
                  className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700"
                >
                  Fermer
                </button>
              </div>
              {analysisIssues.length === 0 ? (
                <p className="text-xs text-slate-500">Aucun bloc analyse.</p>
              ) : (
                <ul className="space-y-2">
                  {analysisIssues.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => void loadIssueSuggestion(issue)}
                        className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-left text-xs hover:bg-slate-100"
                      >
                        <p className="font-semibold text-slate-700">
                          {issue.type.toUpperCase()} - L{issue.line}:C{issue.column}
                        </p>
                        <p className="mt-1 break-words text-slate-600">{issue.message}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="overflow-auto p-4">
              {!activeIssue ? (
                <p className="text-sm text-slate-500">Clique un bloc dans la liste pour voir une correction.</p>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Bloc cible</p>
                  <p className="mt-1 break-words rounded bg-slate-50 p-3 text-sm text-slate-700">{activeIssue.excerpt}</p>
                  {issueLoadingId === activeIssue.id ? (
                    <p className="mt-3 text-sm text-slate-500">Generation de correction...</p>
                  ) : issueSuggestions[activeIssue.id] ? (
                    <div className="mt-3 space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">Diagnostic</p>
                        <p className="whitespace-pre-wrap break-words rounded bg-amber-50 p-3 text-sm text-slate-700">
                          {issueSuggestions[activeIssue.id].diagnosis}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-500">Correction</p>
                        <p className="whitespace-pre-wrap break-words rounded bg-sky-50 p-3 text-sm text-slate-700">
                          {issueSuggestions[activeIssue.id].correction}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(issueSuggestions[activeIssue.id].correction)}
                        className="rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Copier correction
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void loadIssueSuggestion(activeIssue)}
                      className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Generer correction
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!texte && !loading && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
          Aucun document charge. Selectionne un PDF pour commencer.
        </p>
      )}
    </div>
  );
};

export default PdfReader;
