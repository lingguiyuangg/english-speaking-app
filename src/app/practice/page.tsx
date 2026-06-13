'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Script, HardWord } from '@/types';
import { useConversation } from '@/hooks/useConversation';
import { useAudio } from '@/hooks/useAudio';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useWordBank } from '@/context/WordBankContext';

export default function PracticePage() {
  const router = useRouter();
  const wordBank = useWordBank();
  const { state, isLoading, error, initConversation, submitAnswer, nextRound, retry, restartFromFirst } = useConversation();
  const audio = useAudio();
  const speech = useSpeechRecognition();

  const [showAiContext, setShowAiContext] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [speechTranscript, setSpeechTranscript] = useState('');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<'0.8' | '1.0'>('1.0');
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Load script from sessionStorage
  useEffect(() => {
    const scriptJson = sessionStorage.getItem('practice-script');
    const userRole = sessionStorage.getItem('practice-user-role');

    if (!scriptJson || !userRole) {
      router.replace('/');
      return;
    }

    try {
      const script: Script = JSON.parse(scriptJson);
      initConversation(script, userRole);
    } catch {
      router.replace('/');
    }
  }, [initConversation, router]);

  const handleVoiceInput = useCallback(async () => {
    try {
      setVoiceError(null);
      const transcript = await speech.start();
      if (transcript) {
        setSpeechTranscript(transcript);
        setUserInput(transcript);
      }
    } catch (err: any) {
      console.error('Voice input error:', err);
      setVoiceError(err.message || '语音识别启动失败');
    }
  }, [speech]);

  const handleStopVoice = useCallback(() => {
    const result = speech.stop();
    if (result) {
      setSpeechTranscript(result);
      setUserInput(result);
    }
  }, [speech]);

  const handleSubmitAnswer = useCallback(() => {
    if (!userInput.trim()) return;
    submitAnswer(userInput.trim());
  }, [userInput, submitAnswer]);

  const handleRetry = useCallback(() => {
    setUserInput('');
    setSpeechTranscript('');
    retry();
  }, [retry]);

  const handleNextRound = useCallback(() => {
    setShowAiContext(false);
    setUserInput('');
    setSpeechTranscript('');
    setVoiceError(null);
    nextRound();
  }, [nextRound]);

  const handleRestart = useCallback(() => {
    setShowAiContext(false);
    setUserInput('');
    setSpeechTranscript('');
    setVoiceError(null);
    restartFromFirst();
  }, [restartFromFirst]);

  const handleAddToWordBank = useCallback((hw: HardWord) => {
    wordBank.addHardWord({ word: hw.word, chinese: hw.chinese, pos: hw.pos });
    setToast(`"${hw.word}" 已加入词库！`);
  }, [wordBank]);

  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

  const isKnownWord = (word: string) => wordBank.isWordKnown(word);
  const currentRound = state.rounds[state.currentRoundIndex];
  const totalRounds = state.rounds.length;

  // Completed screen
  if (state.phase === 'completed') {
    return (
      <div className="space-y-6 text-center py-12">
        <div className="text-5xl">🎉</div>
        <h1 className="text-xl font-bold">对话练习完成！</h1>
        <p className="text-sm text-gray-500">
          你完成了《{state.script.title}》的对话练习
        </p>
        <div className="text-sm text-gray-600">
          共完成 {state.rounds.filter(r => r.isCorrect !== undefined).length} 轮对话
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <button onClick={handleRestart} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium">
            重新练习
          </button>
          <button onClick={() => { sessionStorage.removeItem('practice-script'); sessionStorage.removeItem('practice-user-role'); router.push('/'); }} className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium">
            返回首页
          </button>
          <button onClick={() => router.push('/word-bank')} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium">
            查看词库
          </button>
        </div>
      </div>
    );
  }

  const renderWordChips = (words: HardWord[]) => (
    <div className="flex flex-wrap gap-1.5">
      {words.map((hw, i) => (
        <div key={i} className="group relative">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs cursor-pointer ${
              isKnownWord(hw.word) ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}
            onClick={() => {
              const entry = wordBank.getWord(hw.word);
              if (entry) {
                setToast(`${hw.word}: ${hw.chinese} (掌握度: ${entry.mastery}/5)`);
              } else {
                handleAddToWordBank(hw);
              }
            }}
          >
            {hw.word}
            {!isKnownWord(hw.word) && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAddToWordBank(hw); }}
                className="ml-1 text-xs opacity-60 hover:opacity-100"
              >
                +
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4 min-h-screen pb-8">
      {/* ===== Part 1: Header ===== */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-sm text-blue-600">
          ← 返回
        </button>
        {state.phase === 'pre-generating' ? (
          <div className="text-xs text-gray-400">准备中...</div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPlaybackSpeed(s => s === '1.0' ? '0.8' : '1.0')}
                className={`text-xs font-medium px-2 py-1 rounded ${
                  playbackSpeed === '0.8' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                语速 {playbackSpeed}x
              </button>
              <button onClick={handleRestart} className="text-xs text-gray-400 hover:text-gray-600">
                重新开始
              </button>
            </div>
            <div className="text-xs text-gray-400">
              第 {state.currentRoundIndex + 1} / {totalRounds} 轮
            </div>
          </>
        )}
      </div>

      {state.phase === 'pre-generating' ? (
        error ? (
          <div className="text-center py-12 space-y-4">
            <p className="text-sm text-red-600">生成失败：{error}</p>
            <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
              返回首页
            </button>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">
              {state.generatingProgress
                ? `AI 正在生成台词... 第 ${state.generatingProgress.current}/${state.generatingProgress.total} 轮`
                : 'AI 正在准备台词和提示...'}
            </p>
            <div className="w-48 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: state.generatingProgress ? `${(state.generatingProgress.current / state.generatingProgress.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        )
      ) : (
        <>
          {/* ===== Progress ===== */}
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all"
              style={{ width: `${((state.currentRoundIndex) / totalRounds) * 100}%` }}
            />
          </div>

          {/* ===== Part 2: Round indicator ===== */}
          <div className="text-center py-1">
            <span className="text-sm font-medium text-gray-600">
              🎭 第 {state.currentRoundIndex + 1} 轮 — 扮演 {state.userRole}
            </span>
          </div>

          {/* ===== Part 3: AI Context ===== */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3 min-h-[60px]">
            {currentRound?.aiContext ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-blue-600">{currentRound.aiContext.role}</span>
                  <button
                    onClick={() => { setVoiceError(null); audio.play(currentRound.aiContext!.en, parseFloat(playbackSpeed)); }}
                    disabled={audio.isPlaying}
                    className="ml-auto p-2 rounded-full hover:bg-gray-100"
                  >
                    {audio.isPlaying ? '🔊' : '🔈'}
                  </button>
                </div>
                {showAiContext ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <p className="text-base leading-relaxed flex-1">{currentRound.aiContext.en}</p>
                      <button onClick={() => setShowAiContext(false)} className="text-xs text-blue-500 shrink-0">
                        📖 隐藏原文
                      </button>
                    </div>
                    <p className="text-sm text-gray-500">{currentRound.aiContext.zh}</p>
                  </div>
                ) : (
                  <button onClick={() => setShowAiContext(true)} className="text-xs text-blue-500">
                    📖 显示原文
                  </button>
                )}
                {currentRound.aiContext.aiHardWords.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">生词：</p>
                    {renderWordChips(currentRound.aiContext.aiHardWords)}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">— 开场白，没有前文 —</p>
            )}
          </div>

          {/* ===== Part 4: Hint ===== */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 space-y-3 min-h-[60px]">
            {currentRound?.hint ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">💡 回答建议：</span>
                  {currentRound.hint.zhHint}
                </p>
                {currentRound.aiHardWords.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">建议词汇：</p>
                    {renderWordChips(currentRound.aiHardWords)}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">等待输入...</p>
            )}
          </div>

          {/* ===== Part 5: User Input ===== */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 space-y-3 min-h-[80px]">
            {state.phase === 'user-responding' || state.phase === 'judging' ? (
              <>
                <textarea
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="输入你的英语回答..."
                  className="w-full h-20 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                />
                <div className="flex gap-2">
                  {speech.isSupported && (
                    speech.isListening ? (
                      <button onClick={handleStopVoice} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-600 animate-pulse">
                        ⏹ 停止录音
                      </button>
                    ) : (
                      <button onClick={handleVoiceInput} disabled={isLoading} className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600">
                        🎤 语音输入
                      </button>
                    )
                  )}
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!userInput.trim() || isLoading}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {isLoading ? '判断中...' : '提交回答'}
                  </button>
                </div>
                {speech.interimText && <p className="text-xs text-gray-400">识别中：{speech.interimText}</p>}
                {speechTranscript && <p className="text-xs text-green-600">已识别：{speechTranscript}</p>}
                {voiceError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600 flex items-center justify-between">
                    <span>🎤 {voiceError}</span>
                    <button onClick={() => setVoiceError(null)} className="ml-2 underline shrink-0">关闭</button>
                  </div>
                )}
                {!speech.isSupported && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700">
                    💡 当前浏览器不支持语音识别，请使用文字输入
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">
                {state.phase === 'correct' ? '回答正确！请点击下方进入下一轮' : '等待输入...'}
              </p>
            )}
          </div>

          {/* Audio error */}
          {audio.error && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700">
              🔊 语音播放遇到问题，已切换到浏览器自带语音。您可能需要重新点击播放按钮。
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="text-center py-2">
              <p className="text-sm text-gray-500">AI 思考中...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
              <button onClick={() => location.reload()} className="ml-2 underline">重试</button>
            </div>
          )}

          {/* ===== Part 6: Comparison ===== */}
          {(state.phase === 'correct' || state.phase === 'incorrect') && currentRound && (
            <div className={`rounded-lg p-4 space-y-3 border min-h-[80px] ${
              state.phase === 'correct' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <p className={`font-medium text-center text-sm ${
                state.phase === 'correct' ? 'text-green-700' : 'text-red-700'
              }`}>
                {state.phase === 'correct' ? '✓ 回答正确！' : (currentRound.aiFeedback || "Sorry, I didn't quite understand that.")}
              </p>
              <div className="bg-white rounded-lg p-3 border space-y-2">
                <div>
                  <p className="text-xs text-gray-500">你的回答：</p>
                  <p className="text-sm text-gray-700">{currentRound.userAnswer}</p>
                </div>
                {state.phase === 'incorrect' && state.retryCount >= 2 && (
                  <div>
                    <p className="text-xs text-gray-500">中文参考：</p>
                    <p className="text-sm text-gray-500">{currentRound.userLine.zh}</p>
                  </div>
                )}
                {state.phase === 'incorrect' && state.retryCount >= 3 && (
                  <div>
                    <p className="text-xs text-gray-500">参考英文：</p>
                    <p className="text-sm text-green-700">{currentRound.expectedUserEn || currentRound.userLine.en}</p>
                  </div>
                )}
                {state.phase === 'correct' && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500">参考英文：</p>
                      <p className="text-sm text-green-700">{currentRound.expectedUserEn || currentRound.userLine.en}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">中文参考：</p>
                      <p className="text-sm text-gray-500">{currentRound.userLine.zh}</p>
                    </div>
                  </>
                )}
              </div>
              {state.phase === 'correct' ? (
                <button onClick={handleNextRound} className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium">
                  下一句 →
                </button>
              ) : (
                <div className="text-center space-y-2">
                  {state.retryCount >= 3 ? (
                    <button onClick={handleNextRound} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                      跳过 →
                    </button>
                  ) : (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">剩余尝试：{3 - state.retryCount} 次</p>
                      <button onClick={handleRetry} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                        再说一遍
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Speech not supported warning (bottom) */}
      {!speech.isSupported && (
        <p className="text-xs text-gray-400 text-center">
          💡 当前浏览器不支持语音识别，请使用文字输入
        </p>
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
