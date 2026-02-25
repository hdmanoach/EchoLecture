import React, { useCallback, useEffect, useState } from "react";
import PdfReader from "./PdfReader";
import SuperDocReader from "./SuperDocReader";
import WordReader from "./WordReader";
import { loadHistoryByType, type ReadingHistoryEntry } from "./lib/readingHistory";

type ReaderChoice = "pdf" | "word" | "superdoc";

const App: React.FC = () => {
  const [selectedReader, setSelectedReader] = useState<ReaderChoice | null>(null);
  const [recentActivities, setRecentActivities] = useState<ReadingHistoryEntry[]>([]);

  const refreshActivities = useCallback(() => {
    const pdf = loadHistoryByType("pdf");
    const word = loadHistoryByType("word");
    const merged = [...pdf, ...word]
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .slice(0, 6);
    setRecentActivities(merged);
  }, []);

  useEffect(() => {
    refreshActivities();
  }, [refreshActivities]);

  useEffect(() => {
    if (selectedReader === null) refreshActivities();
  }, [refreshActivities, selectedReader]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-8">
      <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-xl shadow-slate-200/70 backdrop-blur md:p-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Lecteur Intelligent</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Choisis ton type de document, puis écoute avec un suivi visuel en temps reel.
          </p>
        </header>

        {!selectedReader && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={() => setSelectedReader("pdf")}
                className="group rounded-2xl border border-sky-200 bg-sky-50 p-6 text-left transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-100"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Choix 1</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Lecture PDF</h2>
                <p className="mt-2 text-sm text-slate-600">Extraction classique + OCR si document scanne.</p>
                <span className="mt-4 inline-flex rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white">Demarrer PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedReader("word")}
                className="group rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-100"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Choix 2</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Lecture Word</h2>
                <p className="mt-2 text-sm text-slate-600">Import `.docx`, selection voix/langue, lecture guidee.</p>
                <span className="mt-4 inline-flex rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Demarrer Word</span>
              </button>

              <button
                type="button"
                disabled
                className="group cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 p-6 text-left opacity-80"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Choix 3</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-900">Studio SuperDoc</h2>
                <p className="mt-2 text-sm text-slate-600">Edition Word professionnelle + TTS + corrections IA.</p>
                <p className="mt-2 text-xs font-medium text-amber-700">
                  L'audio ne fonctionne pas encore. Disponible bientot.
                </p>
                <span className="mt-4 inline-flex rounded-full bg-slate-500 px-3 py-1 text-xs font-semibold text-white">
                  Disponible bientot
                </span>
              </button>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Activites recentes</h3>
                <button
                  type="button"
                  onClick={refreshActivities}
                  className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                >
                  Rafraichir
                </button>
              </div>
              {recentActivities.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune activite pour le moment.</p>
              ) : (
                <ul className="space-y-2">
                  {recentActivities.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <p className="truncate text-sm font-semibold text-slate-700">{entry.documentName}</p>
                      <p className="text-xs text-slate-500">
                        Mode: {entry.readerType.toUpperCase()} - Position: {entry.currentIndex}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(entry.updatedAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {selectedReader && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedReader(null)}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Changer de choix
              </button>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                Mode: {selectedReader === "pdf" ? "PDF" : selectedReader === "word" ? "WORD" : "SUPERDOC"}
              </span>
            </div>

            {selectedReader === "pdf" && <PdfReader />}
            {selectedReader === "word" && <WordReader />}
            {selectedReader === "superdoc" && <SuperDocReader />}
          </div>
        )}
      </section>
    </main>
  );
};

export default App;
