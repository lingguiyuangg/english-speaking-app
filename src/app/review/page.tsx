'use client';
export const dynamic = 'force-dynamic';

import { useState, useCallback, useEffect } from 'react';
import { useWordBank } from '@/context/WordBankContext';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { ReviewResult } from '@/types';

export default function ReviewPage() {
  const wordBank = useWordBank();
  const speech = useSpeechRecognition();
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [sentence, setSentence] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const reviewWords = wordBank.words.filter((w) => w.mastery <= 3);

  const startReview = (idx: number) => {
    setCurrentIndex(idx);
    setSentence('');
    setResult(null);
    setVoiceError(null);
  };

  const handleVoiceInput = useCallback(async () => {
    try {
      if (speech.isCloud) {
        const transcript = await speech.startCloud();
        if (transcript) {
          setSentence(transcript);
        }
      } else {
        const transcript = await speech.start();
        if (transcript) {
          setSentence(transcript);
        }
      }
    } catch (err: any) {
      setVoiceError(err.message || '语音识别失败');
    }
  }, [speech]);

  const handleStopVoice = useCallback(() => {
    if (speech.isCloud) {
      speech.stopCloud();
    } else {
      const result = speech.stop();
      if (result) {
        setSentence(result);
      }
    }
  }, [speech]);

  const handleSubmit = async () => {
    if (!sentence.trim() || currentIndex === null) return;
    setLoading(true);

    try {
      const res = await fetch('/api/deepseek/review-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: reviewWords[currentIndex].word,
          userSentence: sentence.trim(),
        }),
      });

      if (!res.ok) throw new Error('评分失败');

      const data = await res.json();
      const overallScore = Math.round(
        ((data.grammarScore || 5) + (data.wordUsageScore || 5) + (data.naturalnessScore || 5)) / 3
      );

      const reviewResult: ReviewResult = {
        grammarScore: data.grammarScore || 5,
        wordUsageScore: data.wordUsageScore || 5,
        naturalnessScore: data.naturalnessScore || 5,
        overallScore,
        feedback: data.feedback || '',
        betterExample: data.betterExample || '',
      };

      setResult(reviewResult);

      const word = reviewWords[currentIndex];
      const newMastery = Math.min(5, Math.max(0, Math.round(overallScore / 2)));
      wordBank.updateMastery(word.id, newMastery);
    } catch (err: any) {
      setToast('评分失败：' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex !== null && currentIndex < reviewWords.length - 1) {
      startReview(currentIndex + 1);
    } else {
      setCurrentIndex(null);
      setResult(null);
    }
  };

  if (reviewWords.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-5xl">🎉</div>
        <h1 className="text-lg font-bold">暂无需要复习的单词</h1>
        <p className="text-sm text-gray-500">
          所有生词的掌握度都超过3级了！<br />
          继续对话练习添加更多生词吧。
        </p>
        <a
          href="/practice"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg text-sm"
        >
          去练习
        </a>
      </div>
    );
  }

  // Word selection screen
  if (currentIndex === null) {
    return (
      <div className="space-y-4">
        <div className="text-center py-2">
          <h1 className="text-lg font-bold">造句复习</h1>
          <p className="text-xs text-gray-500">
            选择需要复习的单词，用它们造句
          </p>
        </div>

        <div className="text-xs text-gray-500 bg-blue-50 rounded-lg p-3 text-center">
          你有 <strong>{reviewWords.length}</strong> 个生词需要复习
        </div>

        <div className="space-y-2">
          {reviewWords.map((w, idx) => (
            <button
              key={w.id}
              onClick={() => startReview(idx)}
              className="w-full bg-white rounded-lg p-3 border border-gray-200 text-left flex items-center gap-3 active:bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{w.word}</span>
                  <span className="text-xs text-gray-400">{w.pos}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{w.chinese}</p>
              </div>
              <span className="text-xs text-gray-400">
                掌握度 {w.mastery}/5
              </span>
              <span className="text-gray-300">→</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const word = reviewWords[currentIndex];

  return (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h1 className="text-lg font-bold">造句复习</h1>
        <p className="text-xs text-gray-500">
          {currentIndex + 1} / {reviewWords.length}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className="bg-blue-600 h-1.5 rounded-full transition-all"
          style={{ width: `${((currentIndex + 1) / reviewWords.length) * 100}%` }}
        />
      </div>

      {/* Current word */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
        <p className="text-xs text-gray-500 mb-1">用下面的单词造一个英语句子：</p>
        <p className="text-2xl font-bold text-blue-600">{word.word}</p>
        <p className="text-sm text-gray-500 mt-1">
          {word.chinese} · {word.pos}
        </p>
      </div>

      {/* Sentence input */}
      {!result && (
        <div className="space-y-3">
          <textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder={`用 "${word.word}" 造一个英语句子...`}
            className="w-full h-24 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            {speech.isSupported && (
              speech.isListening ? (
                <button
                  onClick={handleStopVoice}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-600 animate-pulse"
                >
                  ⏹ 停止录音
                </button>
              ) : (
                <button
                  onClick={handleVoiceInput}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600"
                >
                  🎤 {speech.isCloud ? '云端识别' : '语音输入'}
                </button>
              )
            )}
            <button
              onClick={handleSubmit}
              disabled={!sentence.trim() || loading}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? '评分中...' : '提交评分'}
            </button>
          </div>
          {speech.interimText && (
            <p className="text-xs text-gray-400">识别中：{speech.interimText}</p>
          )}
          {voiceError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600 flex items-center justify-between">
              <span>🎤 {voiceError}</span>
              <button onClick={() => setVoiceError(null)} className="ml-2 underline shrink-0">关闭</button>
            </div>
          )}
        </div>
      )}

      {/* Review result */}
      {result && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3">
            <div className="text-center">
              <span className="text-3xl font-bold text-blue-600">{result.overallScore}</span>
              <span className="text-gray-400 text-sm">/10</span>
              <p className="text-xs text-gray-500 mt-1">综合评分</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: '语法', score: result.grammarScore },
                { label: '用词', score: result.wordUsageScore },
                { label: '自然度', score: result.naturalnessScore },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-gray-700">{item.score}</div>
                  <div className="text-xs text-gray-400">{item.label}</div>
                </div>
              ))}
            </div>

            {result.feedback && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">💡 改进建议</p>
                <p className="text-sm text-gray-700">{result.feedback}</p>
              </div>
            )}

            {result.betterExample && (
              <div>
                <p className="text-xs text-gray-500 mb-1">📝 参考例句</p>
                <p className="text-sm text-gray-700 italic">{result.betterExample}</p>
              </div>
            )}
          </div>

          <button
            onClick={handleNext}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium"
          >
            {currentIndex < reviewWords.length - 1 ? '下一题 →' : '完成复习 ✓'}
          </button>
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
