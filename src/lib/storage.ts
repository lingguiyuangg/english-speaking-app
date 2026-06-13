import { WordEntry, WordBankData } from '@/types';

const STORAGE_KEY = 'word-bank';

export function loadWordBank(): WordEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveWordBank(words: WordEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch (e) {
    console.error('Failed to save word bank:', e);
  }
}

export function exportWordBankData(words: WordEntry[]): WordBankData {
  return {
    version: 1,
    words,
    exportedAt: new Date().toISOString(),
  };
}

export function importWordBankData(data: WordBankData): WordEntry[] {
  if (!data || !data.words || !Array.isArray(data.words)) {
    throw new Error('Invalid word bank data format');
  }
  return data.words;
}

export function generateWordId(): string {
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
