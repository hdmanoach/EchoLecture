import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type SuperDocReadyEvent,
  SuperDocEditor,
  type Editor,
  type SuperDocEditorUpdateEvent,
  type SuperDocRef,
} from "@superdoc-dev/react";
import "@superdoc-dev/react/style.css";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { analyzeSelectedTextWithGemini, isAiConfigured, type CorrectionSuggestion } from "./lib/readingAnalysis";

interface SelectionRange {
  from: number;
  to: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const wordRangeAt = (text: string, index: number): SelectionRange => {
  const safe = clamp(index, 0, Math.max(0, text.length - 1));
  let from = safe;
  let to = safe;

  while (from > 0 && !/\s/.test(text[from - 1])) from -= 1;
  while (to < text.length && !/\s/.test(text[to])) to += 1;

  return { from, to };
};

const remapIndexAfterEdit = (oldText: string, newText: string, oldIndex: number): number => {
  if (!oldText || !newText) return 0;
  if (oldText === newText) return clamp(oldIndex, 0, Math.max(0, newText.length - 1));

  const anchorStart = clamp(oldIndex - 22, 0, oldText.length);
  const anchorEnd = clamp(oldIndex + 22, 0, oldText.length);
  const anchor = oldText.slice(anchorStart, anchorEnd).trim();

  if (anchor.length >= 8) {
    const anchorPos = newText.indexOf(anchor);
    if (anchorPos >= 0) {
      const relative = oldIndex - anchorStart;
      return clamp(anchorPos + relative, 0, Math.max(0, newText.length - 1));
    }
  }

  const delta = newText.length - oldText.length;
  return clamp(oldIndex + delta, 0, Math.max(0, newText.length - 1));
};

const basenameNoExt = (filename: string) => filename.replace(/\.[^/.]+$/, "") || "document";

const SuperDocReader: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [editorText, setEditorText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [documentName, setDocumentName] = useState("superdoc-document");
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [pausedByEdit, setPausedByEdit] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageHeight, setPageHeight] = useState<number | null>(null);
  const [cursorSuggestion, setCursorSuggestion] = useState<CorrectionSuggestion | null>(null);
  const [selectionSuggestion, setSelectionSuggestion] = useState<CorrectionSuggestion | null>(null);
  const [isAnalyzingCursor, setIsAnalyzingCursor] = useState(false);
  const [isAnalyzingSelection, setIsAnalyzingSelection] = useState(false);
  const [languageSelected, setLanguageSelected] = useState("fr-FR");
  const [voiceSelected, setVoiceSelected] = useState<SpeechSynthesisVoice | null>(null);

  const superDocRef = useRef<SuperDocRef>(null);
  const editorRef = useRef<Editor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const editorTextRef = useRef("");
  const programmaticSelectionRef = useRef(false);
  const pausedIndexRef = useRef(0);
  const pageSyncTimeoutRef = useRef<number | null>(null);

  const { voices, isSpeaking, isPaused, isSupported, speak, pause, resume, stop } = useSpeechSynthesis();

  const languages = useMemo(
    () => Array.from(new Set(voices.map((voice) => voice.lang))).sort((a, b) => a.localeCompare(b)),
    [voices],
  );

  const voicesForLanguage = useMemo(() => {
    const targetPrefix = languageSelected.split("-")[0]?.toLowerCase() ?? "";
    return voices.filter((voice) => voice.lang.toLowerCase().startsWith(targetPrefix));
  }, [voices, languageSelected]);

  useEffect(() => {
    if (languages.length === 0) return;
    if (!languages.includes(languageSelected)) {
      setLanguageSelected(languages[0]);
    }
  }, [languageSelected, languages]);

  useEffect(() => {
    if (voicesForLanguage.length === 0) {
      setVoiceSelected(null);
      return;
    }
    if (!voiceSelected || !voicesForLanguage.some((voice) => voice.name === voiceSelected.name)) {
      setVoiceSelected(voicesForLanguage[0]);
    }
  }, [voiceSelected, voicesForLanguage]);

  const aiEnabled = isAiConfigured();

  const pushEditorSelection = useCallback((from: number, to: number) => {
    const editor = editorRef.current;
    if (!editor) return;

    const pmFrom = clamp(from + 1, 1, Math.max(1, editor.state?.doc?.content?.size ?? 1));
    const pmTo = clamp(to + 1, pmFrom, Math.max(pmFrom, editor.state?.doc?.content?.size ?? pmFrom));

    programmaticSelectionRef.current = true;

    try {
      const commands = editor.commands as Record<string, ((payload: { from: number; to: number }) => boolean) | undefined>;
      if (commands.setTextSelection) commands.setTextSelection({ from: pmFrom, to: pmTo });
      if (typeof editor.commands?.focus === "function") {
        editor.commands.focus();
      }
      const el = editor.getElementAtPos?.(pmFrom, { fallbackToCoords: true });
      const pageElement = el?.closest?.("[data-page], [data-page-number], [data-page-index], .page, .sd-page");
      if (pageElement) {
        scrollContainerToElement(pageElement as HTMLElement, "smooth");
        const raw =
          pageElement.getAttribute("data-page") ??
          pageElement.getAttribute("data-page-number") ??
          pageElement.getAttribute("data-page-index");
        const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
        if (!Number.isNaN(parsed) && parsed >= 0) {
          const normalized = parsed === 0 ? 1 : parsed;
          setCurrentPage(normalized);
        }
      }
    } catch {
      // ignore invalid ranges during transient doc updates
    } finally {
      window.setTimeout(() => {
        programmaticSelectionRef.current = false;
      }, 0);
    }
  }, []);

  const readFromIndex = useCallback(
    (startIndex: number) => {
      if (!editorTextRef.current.trim()) return;

      const safeStart = clamp(startIndex, 0, Math.max(0, editorTextRef.current.length - 1));
      const textToSpeak = editorTextRef.current.slice(safeStart);
      if (!textToSpeak.trim()) return;

      setCurrentCharIndex(safeStart);
      setPausedByEdit(false);

      speak({
        text: textToSpeak,
        lang: languageSelected,
        voice: voiceSelected,
        rate: 0.95,
        pitch: 1,
        volume: 1,
        onBoundary: (absoluteIndex) => {
          setCurrentCharIndex(absoluteIndex);
          const { from, to } = wordRangeAt(editorTextRef.current, absoluteIndex);
          pushEditorSelection(from, to);
        },
        onEnd: () => {
          setCurrentCharIndex(safeStart);
        },
      });
    },
    [languageSelected, pushEditorSelection, speak, voiceSelected],
  );

  const handlePlay = useCallback(() => {
    readFromIndex(currentCharIndex);
  }, [currentCharIndex, readFromIndex]);

  const readFromCursor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor?.state?.doc) return;

    const pmFrom = Math.max(1, editor.state.selection?.from ?? 1);
    const prefix = editor.state.doc.textBetween(0, pmFrom, " ", " ");
    const startIndex = clamp(prefix.length, 0, Math.max(0, editorTextRef.current.length - 1));
    readFromIndex(startIndex);
  }, [readFromIndex]);

  const handleResume = useCallback(() => {
    if (pausedByEdit) {
      readFromIndex(pausedIndexRef.current);
      return;
    }
    resume();
  }, [pausedByEdit, readFromIndex, resume]);

  const handleStop = useCallback(() => {
    stop();
    setPausedByEdit(false);
    pausedIndexRef.current = 0;
    setCurrentCharIndex(0);
  }, [stop]);

  const collectPages = useCallback(() => {
    const root = editorContainerRef.current;
    if (!root) return [] as HTMLElement[];
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>("[data-page], [data-page-number], [data-page-index], .page, .sd-page"),
    );
    return nodes;
  }, []);

  const syncPageCount = useCallback(() => {
    const pages = collectPages();
    if (pages.length > 0) {
      setTotalPages(pages.length);
      setCurrentPage((prev) => clamp(prev, 1, pages.length));
      const firstHeight = pages[0].getBoundingClientRect().height;
      if (Number.isFinite(firstHeight) && firstHeight > 0) {
        setPageHeight((prev) => (prev !== firstHeight ? firstHeight : prev));
      }
      pages.forEach((page) => {
        page.style.scrollSnapAlign = "start";
        page.style.scrollSnapStop = "always";
      });
    } else {
      setTotalPages(1);
      setCurrentPage(1);
      setPageHeight(null);
    }
  }, [collectPages]);

  const schedulePageSync = useCallback(() => {
    if (pageSyncTimeoutRef.current !== null) {
      window.clearTimeout(pageSyncTimeoutRef.current);
    }
    pageSyncTimeoutRef.current = window.setTimeout(() => {
      syncPageCount();
    }, 120);
  }, [syncPageCount]);

  const scrollContainerToElement = useCallback((element: HTMLElement, behavior: ScrollBehavior) => {
    const container = editorContainerRef.current;
    if (!container) {
      element.scrollIntoView({ behavior, block: "start" });
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const nextTop = container.scrollTop + (elementRect.top - containerRect.top);
    container.scrollTo({ top: nextTop, behavior });
  }, []);

  const handleEditorUpdate = useCallback(
    ({ editor }: SuperDocEditorUpdateEvent) => {
      editorRef.current = editor;
      const nextText = editor.getText?.() ?? "";
      const oldText = editorTextRef.current;
      const textChanged = nextText !== oldText;

      if (programmaticSelectionRef.current) {
        setEditorText(nextText);
        editorTextRef.current = nextText;
        return;
      }

      const from = editor.state?.selection?.from ?? 1;
      const to = editor.state?.selection?.to ?? from;
      const isSelection = to > from;

      if (isSelection) {
        const selected = nextText.slice(Math.max(0, from - 1), Math.max(0, to - 1)).trim();
        if (selected) {
          setSelectedText(selected);
          setSelectionSuggestion(null);
        }
      }

      if (textChanged && isSpeaking && !isPaused) {
        pausedIndexRef.current = remapIndexAfterEdit(oldText, nextText, currentCharIndex);
        setPausedByEdit(true);
        pause();
      } else if (textChanged && pausedByEdit) {
        pausedIndexRef.current = remapIndexAfterEdit(oldText, nextText, pausedIndexRef.current);
      }

      setEditorText(nextText);
      editorTextRef.current = nextText;
      schedulePageSync();
    },
    [currentCharIndex, isPaused, isSpeaking, pause, pausedByEdit, schedulePageSync],
  );

  const scrollToPage = useCallback(
    (page: number) => {
      const pages = collectPages();
      if (!pages.length) return;
      const target = pages[clamp(page - 1, 0, pages.length - 1)];
      scrollContainerToElement(target, "smooth");
      setCurrentPage(clamp(page, 1, pages.length));
    },
    [collectPages, scrollContainerToElement],
  );

  const cursorContext = useMemo(() => {
    if (!editorText) return "";
    const around = wordRangeAt(editorText, currentCharIndex);
    const contextStart = clamp(around.from - 120, 0, editorText.length);
    const contextEnd = clamp(around.to + 120, 0, editorText.length);
    return editorText.slice(contextStart, contextEnd).trim();
  }, [currentCharIndex, editorText]);

  const analyzeUnderCursor = useCallback(async () => {
    if (!cursorContext) return;
    setIsAnalyzingCursor(true);
    try {
      const suggestion = await analyzeSelectedTextWithGemini(cursorContext);
      setCursorSuggestion(suggestion);
    } finally {
      setIsAnalyzingCursor(false);
    }
  }, [cursorContext]);

  const analyzeSelection = useCallback(async () => {
    if (!selectedText.trim()) return;
    setIsAnalyzingSelection(true);
    try {
      const suggestion = await analyzeSelectedTextWithGemini(selectedText);
      setSelectionSuggestion(suggestion);
    } finally {
      setIsAnalyzingSelection(false);
    }
  }, [selectedText]);

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // noop
    }
  }, []);

  const exportDocx = useCallback(async () => {
    const instance = superDocRef.current?.getInstance();
    if (!instance) return;

    await instance.export({
      exportType: ["docx"],
      triggerDownload: true,
      exportedName: `${basenameNoExt(documentName)}-corrige`,
    });
  }, [documentName]);

  const handleReady = useCallback(({ superdoc }: SuperDocReadyEvent) => {
    superdoc.setDocumentMode("editing");
    const active = (superdoc.activeEditor as Editor | null) ?? null;
    if (active) {
      editorRef.current = active;
      const text = active.getText?.() ?? "";
      setEditorText(text);
      editorTextRef.current = text;
    }
    setCurrentPage(1);
    setTotalPages(1);
    schedulePageSync();
  }, [schedulePageSync]);

  return (
    <div className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <label className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
          Charger Word (.docx)
          <input
            type="file"
            accept=".docx"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
              setDocumentName(picked?.name ?? "superdoc-document");
              setEditorText("");
              editorTextRef.current = "";
              setSelectedText("");
              setSelectionSuggestion(null);
              setCursorSuggestion(null);
              setCurrentCharIndex(0);
              pausedIndexRef.current = 0;
              setPausedByEdit(false);
              handleStop();
              setCurrentPage(1);
              setTotalPages(1);
              schedulePageSync();
            }}
          />
        </label>

        <button
          type="button"
          onClick={handlePlay}
          disabled={!file || !isSupported}
          className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Lire
        </button>
        <button
          type="button"
          onClick={readFromCursor}
          disabled={!file || !isSupported}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Lire depuis curseur
        </button>
        <button
          type="button"
          onClick={pause}
          disabled={!isSpeaking || pausedByEdit}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={handleResume}
          disabled={!isPaused && !pausedByEdit}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Reprendre
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={!isSpeaking && !isPaused && !pausedByEdit}
          className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Arreter
        </button>
        <button
          type="button"
          onClick={exportDocx}
          disabled={!file}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
        >
          Sauvegarder DOCX
        </button>
      </div>

      {!aiEnabled && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Gemini desactive. Ajoute VITE_GEMINI_API_KEY dans .env pour les corrections IA.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div
          ref={editorContainerRef}
          className="overflow-y-auto rounded-xl border border-slate-200"
          style={{
            height: pageHeight ? `${pageHeight}px` : "620px",
            scrollSnapType: "y mandatory",
          }}
        >
          {file ? (
            <SuperDocEditor
              ref={superDocRef}
              document={file}
              documentMode="editing"
              role="editor"
              viewOptions={{ layout: "print" }}
              onReady={handleReady}
              onEditorCreate={({ editor }) => {
                editorRef.current = editor;
                const text = editor.getText?.() ?? "";
                setEditorText(text);
                editorTextRef.current = text;
                schedulePageSync();
              }}
              onEditorUpdate={handleEditorUpdate}
            />
          ) : (
            <div className="flex h-[620px] items-center justify-center text-sm text-slate-500">
              Charge un fichier .docx pour ouvrir l'editeur SuperDoc.
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Configuration lecture</p>
            <label className="mt-2 block text-xs font-medium text-slate-600" htmlFor="reader-language">
              Langue
            </label>
            <select
              id="reader-language"
              value={languageSelected}
              onChange={(event) => setLanguageSelected(event.target.value)}
              disabled={languages.length === 0}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 disabled:bg-slate-100"
            >
              {languages.length === 0 ? (
                <option value="fr-FR">fr-FR</option>
              ) : (
                languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))
              )}
            </select>
            <p className="mt-2 text-xs text-slate-500">
              Voix active: {voiceSelected ? `${voiceSelected.name} (${voiceSelected.lang})` : "Defaut navigateur"}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Etat lecture</p>
            <p className="mt-1 text-sm text-slate-700">Index courant: {currentCharIndex}</p>
            <p className="mt-1 text-sm text-slate-700">
              Page en cours: {currentPage} / {totalPages}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => scrollToPage(currentPage - 1)}
                disabled={!file || currentPage <= 1}
                className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 disabled:bg-slate-200"
              >
                Precedent
              </button>
              <button
                type="button"
                onClick={() => scrollToPage(currentPage + 1)}
                disabled={!file || currentPage >= totalPages}
                className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 disabled:bg-slate-200"
              >
                Suivant
              </button>
            </div>
            {pausedByEdit && (
              <p className="mt-1 text-xs text-amber-700">
                Lecture mise en pause automatiquement apres modification. Reprendre relance au bon endroit.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Analyse sous curseur</p>
              <button
                type="button"
                onClick={analyzeUnderCursor}
                disabled={!cursorContext || isAnalyzingCursor}
                className="rounded bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white disabled:bg-slate-300"
              >
                {isAnalyzingCursor ? "Analyse..." : "Analyser"}
              </button>
            </div>
            <p className="mt-2 max-h-20 overflow-auto rounded bg-white p-2 text-xs text-slate-700">{cursorContext || "Aucun contexte."}</p>
            {cursorSuggestion && (
              <div className="mt-2 space-y-2 rounded bg-white p-2">
                <p className="text-xs font-semibold text-slate-700">Diagnostic</p>
                <p className="text-xs text-slate-600">{cursorSuggestion.diagnosis}</p>
                <p className="text-xs font-semibold text-slate-700">Correction</p>
                <p className="whitespace-pre-wrap text-xs text-slate-700">{cursorSuggestion.correction}</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(cursorSuggestion.correction)}
                  className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                >
                  Copier correction
                </button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bloc selectionne</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedText("");
                  setSelectionSuggestion(null);
                }}
                className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
              >
                Effacer
              </button>
            </div>
            <p className="max-h-24 overflow-auto rounded bg-white p-2 text-xs text-slate-700">
              {selectedText || "Selectionne du texte dans l'editeur."}
            </p>
            <button
              type="button"
              onClick={analyzeSelection}
              disabled={!selectedText || isAnalyzingSelection}
              className="mt-2 rounded bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white disabled:bg-slate-300"
            >
              {isAnalyzingSelection ? "Analyse..." : "Demander a l'analyseur"}
            </button>
            {selectionSuggestion && (
              <div className="mt-2 space-y-2 rounded bg-white p-2">
                <p className="text-xs font-semibold text-slate-700">Diagnostic</p>
                <p className="text-xs text-slate-600">{selectionSuggestion.diagnosis}</p>
                <p className="text-xs font-semibold text-slate-700">Correction</p>
                <p className="whitespace-pre-wrap text-xs text-slate-700">{selectionSuggestion.correction}</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(selectionSuggestion.correction)}
                  className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                >
                  Copier correction
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default SuperDocReader;
