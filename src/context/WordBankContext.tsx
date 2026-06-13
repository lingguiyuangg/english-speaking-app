'use client';
import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { WordEntry, WordBankData, HardWord } from '@/types';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { generateWordId, exportWordBankData, importWordBankData } from '@/lib/storage';

interface WordBankContextType {
  words: WordEntry[];
  addWord: (word: Omit<WordEntry, 'id' | 'addedAt' | 'reviewCount' | 'lastReviewedAt'>) => void;
  addHardWord: (hw: { word: string; chinese: string; pos: string }) => void;
  updateMastery: (id: string, level: number) => void;
  removeWord: (id: string) => void;
  getWord: (word: string) => WordEntry | undefined;
  getLowMasteryWords: (threshold?: number) => WordEntry[];
  exportData: () => WordBankData;
  importData: (data: WordBankData) => void;
  isWordKnown: (word: string) => boolean;
  wordCount: number;
}

const WordBankContext = createContext<WordBankContextType | null>(null);

export function WordBankProvider({ children }: { children: React.ReactNode }) {
  const [words, setWords] = useLocalStorage<WordEntry[]>('word-bank', []);

  const addWord = useCallback(
    (word: Omit<WordEntry, 'id' | 'addedAt' | 'reviewCount' | 'lastReviewedAt'>) => {
      setWords((prev) => {
        // Don't add if already exists
        if (prev.some((w) => w.word.toLowerCase() === word.word.toLowerCase())) {
          return prev;
        }
        const entry: WordEntry = {
          ...word,
          id: generateWordId(),
          addedAt: Date.now(),
          reviewCount: 0,
          lastReviewedAt: null,
        };
        return [...prev, entry];
      });
    },
    [setWords]
  );

  const addHardWord = useCallback(
    (hw: { word: string; chinese: string; pos: string }) => {
      addWord({
        word: hw.word,
        chinese: hw.chinese,
        pos: hw.pos,
        mastery: 0,
        source: '对话练习',
      });
    },
    [addWord]
  );

  const updateMastery = useCallback(
    (id: string, level: number) => {
      setWords((prev) =>
        prev.map((w) =>
          w.id === id
            ? { ...w, mastery: Math.max(0, Math.min(5, level)), lastReviewedAt: Date.now() }
            : w
        )
      );
    },
    [setWords]
  );

  const removeWord = useCallback(
    (id: string) => {
      setWords((prev) => prev.filter((w) => w.id !== id));
    },
    [setWords]
  );

  const getWord = useCallback(
    (word: string) => words.find((w) => w.word.toLowerCase() === word.toLowerCase()),
    [words]
  );

  const getLowMasteryWords = useCallback(
    (threshold = 3) => words.filter((w) => w.mastery <= threshold),
    [words]
  );

  const isWordKnown = useCallback(
    (word: string) => {
      const entry = words.find((w) => w.word.toLowerCase() === word.toLowerCase());
      return entry ? entry.mastery >= 3 : false;
    },
    [words]
  );

  const exportData = useCallback(() => exportWordBankData(words), [words]);

  const importData = useCallback(
    (data: WordBankData) => {
      const imported = importWordBankData(data);
      setWords((prev) => {
        const existingWords = new Map(prev.map((w) => [w.word.toLowerCase(), w]));
        for (const w of imported) {
          const key = w.word.toLowerCase();
          if (!existingWords.has(key)) {
            existingWords.set(key, w);
          }
        }
        return Array.from(existingWords.values());
      });
    },
    [setWords]
  );

  return (
    <WordBankContext.Provider
      value={{
        words,
        addWord,
        addHardWord,
        updateMastery,
        removeWord,
        getWord,
        getLowMasteryWords,
        exportData,
        importData,
        isWordKnown,
        wordCount: words.length,
      }}
    >
      {children}
    </WordBankContext.Provider>
  );
}

export function useWordBank() {
  const ctx = useContext(WordBankContext);
  if (!ctx) {
    // Return safe defaults when used outside provider (e.g., during SSR)
    return {
      words: [] as WordEntry[],
      addWord: () => {},
      addHardWord: () => {},
      updateMastery: () => {},
      removeWord: () => {},
      getWord: () => undefined,
      getLowMasteryWords: () => [] as WordEntry[],
      exportData: (): WordBankData => ({ version: 1, words: [], exportedAt: '' }),
      importData: () => {},
      isWordKnown: () => false,
      wordCount: 0,
    };
  }
  return ctx;
}
