export type ReaderType = "pdf" | "word";

export interface ReadingHistoryEntry {
  id: string;
  readerType: ReaderType;
  documentName: string;
  text: string;
  currentIndex: number;
  updatedAt: string;
}

const STORAGE_KEY = "lecteurs-reading-history-v1";
const MAX_ENTRIES = 12;
const MAX_TEXT_LENGTH = 180000;

const safeParse = (value: string | null): ReadingHistoryEntry[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ReadingHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const hashText = (text: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
};

const getAll = (): ReadingHistoryEntry[] => {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
};

const setAll = (entries: ReadingHistoryEntry[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

export const loadHistoryByType = (readerType: ReaderType): ReadingHistoryEntry[] => {
  return getAll()
    .filter((entry) => entry.readerType === readerType)
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
};

export const saveHistoryEntry = (
  readerType: ReaderType,
  documentName: string,
  text: string,
  currentIndex: number,
) => {
  if (!text.trim()) return;

  const clipped = text.slice(0, MAX_TEXT_LENGTH);
  const id = `${readerType}-${documentName}-${hashText(clipped.slice(0, 2000))}`;

  const now = new Date().toISOString();
  const nextEntry: ReadingHistoryEntry = {
    id,
    readerType,
    documentName,
    text: clipped,
    currentIndex: Math.max(0, Math.min(currentIndex, clipped.length - 1)),
    updatedAt: now,
  };

  const existing = getAll().filter((entry) => entry.id !== id);
  const merged = [nextEntry, ...existing].slice(0, MAX_ENTRIES);
  setAll(merged);
};

export const deleteHistoryEntry = (id: string) => {
  const next = getAll().filter((entry) => entry.id !== id);
  setAll(next);
};
