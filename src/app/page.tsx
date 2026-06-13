'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Difficulty, Script, ScriptLine, SavedScript } from '@/types';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { parseScriptText, scriptLinesToString } from '@/lib/script-parser';

const DIFFICULTIES: { key: Difficulty; label: string; desc: string }[] = [
  { key: 'A2', label: 'A2 简单', desc: '短句 + 一般现在时' },
  { key: 'B1', label: 'B1 中等', desc: '5-15词 + 简单时态' },
  { key: 'B2', label: 'B2 较难', desc: '长句 + 多种时态' },
];

const EXAMPLE_TEXT = `小明和小红在公园里相遇。天气很好，他们决定一起去散步。
小明问小红周末过得怎么样，小红说去了图书馆看书。
他们聊到了最喜欢的书籍和电影，还约定下周一起去图书馆。`;

export default function HomePage() {
  const router = useRouter();
  const [savedScripts, setSavedScripts] = useLocalStorage<SavedScript[]>('saved-scripts', []);

  const [step, setStep] = useState<'input' | 'generating' | 'edit' | 'role-select'>('input');
  const [text, setText] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('B1');
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptLines, setScriptLines] = useState<ScriptLine[]>([]);
  const [generatedRoles, setGeneratedRoles] = useState<string[]>([]);
  const [editText, setEditText] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;
    setStep('generating');
    try {
      const res = await fetch('/api/deepseek/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), level: difficulty }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '生成失败');
      }
      const data = await res.json();
      const lines: ScriptLine[] = (data.lines || []).map((l: any) => ({
        role: l.role,
        content: l.content,
      }));
      const roles: string[] = data.roles || [];
      setScriptTitle(data.title || '英语对话');
      setScriptLines(lines);
      setGeneratedRoles(roles);
      setEditText(scriptLinesToString(lines));
      setStep('edit');
    } catch (err: any) {
      setToast('生成失败：' + err.message);
      setStep('input');
    }
  }, [text, difficulty]);

  const handleEditConfirm = useCallback(() => {
    const parsed = parseScriptText(editText);
    if (parsed.lines.length < 2) {
      setToast('至少需要2句对话');
      return;
    }
    if (parsed.roles.length < 2) {
      setToast('至少需要2个角色');
      return;
    }
    setScriptLines(parsed.lines);
    setGeneratedRoles(parsed.roles);
    setStep('role-select');
  }, [editText]);

  const handleRegenerate = useCallback(() => {
    setStep('input');
    setScriptLines([]);
    setGeneratedRoles([]);
    setEditText('');
    setScriptTitle('');
  }, []);

  const handleStartPractice = useCallback(() => {
    if (!userRole) return;
    const script: Script = {
      id: `script_${Date.now()}`,
      title: scriptTitle,
      text: text.trim(),
      lines: scriptLines,
      roles: generatedRoles,
      difficulty,
    };
    // Save to localStorage
    const savedScript: SavedScript = {
      id: script.id,
      title: scriptTitle,
      text: text.trim(),
      lines: scriptLines,
      roles: generatedRoles,
      difficulty,
      savedAt: Date.now(),
      lastPracticedAt: Date.now(),
    };
    setSavedScripts((prev) => {
      const existing = prev.find((s) => s.id === savedScript.id);
      if (existing) {
        return prev.map((s) => s.id === savedScript.id ? { ...s, lastPracticedAt: Date.now() } : s);
      }
      return [...prev, savedScript];
    });
    sessionStorage.setItem('practice-script', JSON.stringify(script));
    sessionStorage.setItem('practice-user-role', userRole);
    router.push('/practice');
  }, [userRole, scriptTitle, text, scriptLines, generatedRoles, difficulty, setSavedScripts, router]);

  const handleStartSavedScript = useCallback((s: SavedScript) => {
    // Pick first role as default — user can change later, but this is convenient
    const userPrompt = prompt(`选择你要扮演的角色（${s.roles.join(', ')}）`, s.roles[0]);
    if (!userPrompt || !s.roles.includes(userPrompt)) {
      setToast(`请选择以下角色之一：${s.roles.join(', ')}`);
      return;
    }
    // Update lastPracticedAt
    setSavedScripts((prev) => prev.map((x) => x.id === s.id ? { ...x, lastPracticedAt: Date.now() } : x));
    const script: Script = { ...s, id: s.id };
    sessionStorage.setItem('practice-script', JSON.stringify(script));
    sessionStorage.setItem('practice-user-role', userPrompt);
    router.push('/practice');
  }, [setSavedScripts, router]);

  const handleDeleteScript = useCallback((id: string) => {
    setSavedScripts((prev) => prev.filter((s) => s.id !== id));
    setToast('剧本已删除');
  }, [setSavedScripts]);

  return (
    <div className="space-y-4">
      <div className="text-center py-3">
        <h1 className="text-xl font-bold">英语口语练习</h1>
        <p className="text-sm text-gray-500 mt-1">AI 剧本角色扮演 + 生词复习</p>
      </div>

      {/* Saved scripts */}
      {savedScripts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-gray-500">已保存的剧本</h2>
          <div className="space-y-2">
            {savedScripts.map((s) => (
              <div key={s.id} className="bg-white rounded-lg p-3 border border-gray-200 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.title}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      s.difficulty === 'A2' ? 'bg-green-100 text-green-700' :
                      s.difficulty === 'B1' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{s.difficulty}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.roles.join('、')} · {s.lines.length}句 · {new Date(s.savedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleStartSavedScript(s)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium shrink-0"
                >
                  开始练习
                </button>
                <button
                  onClick={() => handleDeleteScript(s.id)}
                  className="px-2 py-1.5 text-gray-400 hover:text-red-500 rounded-lg text-xs shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3" />
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 text-xs">
        {['输入文本', '生成剧本', '编辑确认', '选择角色'].map((s, i) => {
          const stepMap = ['input', 'generating', 'edit', 'role-select'];
          const currentIdx = stepMap.indexOf(step);
          const isActive = i === currentIdx || (step === 'generating' && i === 1);
          const isDone = i < currentIdx;
          return (
            <div key={s} className="flex items-center gap-1">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  isActive || isDone
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span className={isActive ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                {s}
              </span>
              {i < 3 && <span className="text-gray-300 mx-1">→</span>}
            </div>
          );
        })}
      </div>

      {/* Step 1 & 2 */}
      {(step === 'input' || step === 'generating') && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">粘贴一段中文文本</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE_TEXT}
              className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={step === 'generating'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">选择难度等级</label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDifficulty(d.key)}
                  disabled={step === 'generating'}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    difficulty === d.key
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600'
                  }`}
                >
                  <div className="font-medium text-sm">{d.label}</div>
                  <div className="text-xs mt-0.5 opacity-70">{d.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={!text.trim() || step === 'generating'}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {step === 'generating' ? (
              <><span className="animate-spin">⏳</span> 正在生成剧本...</>
            ) : '🤖 生成剧本'}
          </button>
        </div>
      )}

      {/* Step 3 */}
      {step === 'edit' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              编辑剧本（每行格式：<code>角色名：台词</code>）
            </label>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full h-64 p-3 border border-gray-300 rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleRegenerate} className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-lg font-medium">
              重新生成
            </button>
            <button onClick={handleEditConfirm} className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium">
              确认使用
            </button>
          </div>
        </div>
      )}

      {/* Step 4 */}
      {step === 'role-select' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium mb-2">{scriptTitle}</h2>
            <p className="text-xs text-gray-500 mb-3">选择你要扮演的角色：</p>
            <div className="space-y-2">
              {generatedRoles.map((role, idx) => {
                const icons = ['👤', '🤖', '👥', '🎭'];
                return (
                  <button
                    key={role}
                    onClick={() => setUserRole(role)}
                    className={`w-full p-4 rounded-lg border text-left transition-colors ${
                      userRole === role
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600'
                    }`}
                  >
                    <span className="text-lg mr-2">{icons[idx % icons.length]}</span>
                    <span className="font-medium">{role}</span>
                    <span className="text-xs ml-2 text-gray-400">
                      （{scriptLines.filter((l) => l.role === role).length}句台词）
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep('edit')} className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-lg font-medium">
              返回修改
            </button>
            <button
              onClick={handleStartPractice}
              disabled={!userRole}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              开始练习 →
            </button>
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
