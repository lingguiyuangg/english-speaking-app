'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useWordBank } from '@/context/WordBankContext';
import { WordEntry, WordBankData } from '@/types';

export default function WordBankPage() {
  const wordBank = useWordBank();
  const [filter, setFilter] = useState<'all' | 'new' | 'learning' | 'mastered'>('all');
  const [selectedWord, setSelectedWord] = useState<WordEntry | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const filteredWords = wordBank.words.filter((w) => {
    if (filter === 'new') return w.mastery === 0;
    if (filter === 'learning') return w.mastery >= 1 && w.mastery <= 3;
    if (filter === 'mastered') return w.mastery >= 4;
    return true;
  });

  const masteryLabel = (level: number) => {
    if (level === 0) return { text: '新词', color: 'bg-red-100 text-red-700' };
    if (level <= 2) return { text: '学习中', color: 'bg-orange-100 text-orange-700' };
    if (level <= 3) return { text: '认识', color: 'bg-yellow-100 text-yellow-700' };
    if (level <= 4) return { text: '熟悉', color: 'bg-green-100 text-green-700' };
    return { text: '掌握', color: 'bg-blue-100 text-blue-700' };
  };

  const handleExport = () => {
    const data = wordBank.exportData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordbank_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data: WordBankData = JSON.parse(text);
      wordBank.importData(data);
      setToast('导入成功！');
    } catch {
      setToast('导入失败：文件格式不正确');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h1 className="text-lg font-bold">词库</h1>
        <p className="text-xs text-gray-500">共 {wordBank.wordCount} 个单词</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { key: 'all' as const, label: '全部', count: wordBank.wordCount },
          { key: 'new' as const, label: '新词', count: wordBank.words.filter((w) => w.mastery === 0).length },
          { key: 'learning' as const, label: '学习中', count: wordBank.words.filter((w) => w.mastery >= 1 && w.mastery <= 3).length },
          { key: 'mastered' as const, label: '已掌握', count: wordBank.words.filter((w) => w.mastery >= 4).length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
              filter === tab.key ? 'bg-white shadow text-blue-600' : 'text-gray-500'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Import/Export */}
      <div className="flex gap-2">
        <button onClick={handleImport} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
          📥 导入
        </button>
        <button onClick={handleExport} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600">
          📤 导出
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
      </div>

      {/* Word list */}
      {filteredWords.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">📭</p>
          <p className="text-sm">还没有单词</p>
          <p className="text-xs mt-1">在对话练习中点击难词即可添加</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredWords.map((w) => {
            const ml = masteryLabel(w.mastery);
            return (
              <div
                key={w.id}
                onClick={() => setSelectedWord(w)}
                className="bg-white rounded-lg p-3 border border-gray-200 flex items-center gap-3 cursor-pointer active:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{w.word}</span>
                    <span className="text-xs text-gray-400">{w.pos}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{w.chinese}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${ml.color}`}>
                  {ml.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Word detail modal */}
      {selectedWord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setSelectedWord(null)}>
          <div
            className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">{selectedWord.word}</h2>
                <p className="text-sm text-gray-500">
                  {selectedWord.chinese} · {selectedWord.pos}
                </p>
              </div>
              <button onClick={() => setSelectedWord(null)} className="text-gray-400 text-xl">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">掌握程度</p>
                <div className="flex gap-1 mt-1">
                  {[0, 1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      onClick={() => wordBank.updateMastery(selectedWord.id, level)}
                      className={`w-8 h-8 rounded-full text-xs font-medium ${
                        selectedWord.mastery >= level
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
                <div>
                  <span className="text-gray-400">复习次数：</span>
                  {selectedWord.reviewCount}
                </div>
                <div>
                  <span className="text-gray-400">添加时间：</span>
                  {new Date(selectedWord.addedAt).toLocaleDateString()}
                </div>
              </div>

              {selectedWord.source && (
                <div className="text-xs text-gray-400">
                  来源：{selectedWord.source}
                </div>
              )}

              <button
                onClick={() => {
                  wordBank.removeWord(selectedWord.id);
                  setSelectedWord(null);
                }}
                className="w-full py-2 border border-red-200 text-red-500 rounded-lg text-sm"
              >
                删除单词
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-4 right-4 max-w-lg mx-auto bg-gray-800 text-white text-sm text-center py-2.5 px-4 rounded-lg z-50 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
