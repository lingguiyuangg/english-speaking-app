'use client';
import { useCallback, useState } from 'react';
import {
  ConversationState,
  ConversationMessage,
  Script,
  PracticeRound,
  HardWord,
  UserHint,
} from '@/types';

const API_BASE = '/api/deepseek';

export function useConversation() {
  const [state, setState] = useState<ConversationState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initConversation = useCallback(async (script: Script, userRole: string) => {
    const aiRoles = script.roles.filter((r) => r !== userRole);
    const systemMsg: ConversationMessage = {
      role: 'system',
      content: `剧本标题：${script.title}\n剧本难度：${script.difficulty}\n角色：${script.roles.join(', ')}\n用户扮演：${userRole}\nAI扮演：${aiRoles.join(', ')}\n\n完整剧本：\n${script.lines.map((l) => `${l.role}：${l.content}`).join('\n')}`,
    };

    setState({
      script,
      userRole,
      aiRoles,
      rounds: [],
      currentRoundIndex: 0,
      phase: 'pre-generating',
      history: [systemMsg],
      retryCount: 0,
    });

    // Pre-generate all rounds
    try {
      await preGenerateRounds(script, userRole, aiRoles, [systemMsg]);
    } catch (err: any) {
      setError(err.message || '预生成失败');
    }
  }, []);

  const preGenerateRounds = useCallback(async (
    script: Script,
    userRole: string,
    aiRoles: string[],
    history: ConversationMessage[]
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const scriptStr = script.lines.map((l) => `${l.role}：${l.content}`).join('\n');

      // Find all user-role line indices
      const userLineIndices: number[] = [];
      for (let i = 0; i < script.lines.length; i++) {
        if (script.lines[i].role === userRole) {
          userLineIndices.push(i);
        }
      }

      const rounds: PracticeRound[] = [];

      for (let ui = 0; ui < userLineIndices.length; ui++) {
        const userIdx = userLineIndices[ui];

        // Update loading progress
        setState((prev) => {
          if (!prev) return prev;
          return { ...prev, generatingProgress: { current: ui + 1, total: userLineIndices.length } };
        });

        // Find preceding AI-role line for context
        let aiContextIdx = -1;
        for (let j = userIdx - 1; j >= 0; j--) {
          if (script.lines[j].role !== userRole) {
            aiContextIdx = j;
            break;
          }
        }

        // Call API for user line
        const userScriptLine = script.lines[userIdx];
        const userResPromise = fetch(`${API_BASE}/generate-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scriptContext: scriptStr,
            userRole,
            aiRoles,
            conversationHistory: history,
            turnIndex: userIdx,
            scriptLine: userScriptLine,
            nextUserLineHint: userScriptLine.content,
            isUserLine: true,
          }),
        });

        // Call API for AI context in parallel if needed
        let aiResPromise: Promise<Response> | null = null;
        if (aiContextIdx >= 0) {
          const aiScriptLine = script.lines[aiContextIdx];
          aiResPromise = fetch(`${API_BASE}/generate-line`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scriptContext: scriptStr,
              userRole,
              aiRoles,
              conversationHistory: history,
              turnIndex: aiContextIdx,
              scriptLine: aiScriptLine,
              nextUserLineHint: userScriptLine.content,
            }),
          });
        }

        // Wait for both responses in parallel
        const [userResponse, aiResponse] = await Promise.all([
          userResPromise,
          aiResPromise,
        ]);

        if (!userResponse.ok) throw new Error('生成台词失败');
        const userData = await userResponse.json();

        const userLine = { en: userData.en || '', zh: userData.zh || '' };
        const expectedUserEn = userData.expectedUserEn || userData.en || '';
        const hint: UserHint = {
          zhHint: userData.hint?.zhHint || '',
          hardWords: (userData.hint?.hardWords || []).map((hw: any) => ({ ...hw, fromWordBank: false })),
        };
        const aiHardWords: HardWord[] = (userData.aiHardWords || []).map((hw: any) => ({ ...hw, fromWordBank: false }));

        let aiContext: PracticeRound['aiContext'] = undefined;

        if (aiResponse) {
          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            aiContext = {
              role: script.lines[aiContextIdx!].role,
              en: aiData.en || '',
              zh: aiData.zh || '',
              aiHardWords: (aiData.aiHardWords || []).map((hw: any) => ({ ...hw, fromWordBank: false })),
            };
          }
        }

        rounds.push({
          userLine,
          hint,
          aiHardWords,
          expectedUserEn,
          aiContext,
        });
      }

      setState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          rounds,
          phase: rounds.length > 0 ? 'user-responding' : 'completed',
          currentRoundIndex: 0,
        };
      });
    } catch (err: any) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const submitAnswer = useCallback(
    async (answer: string) => {
      if (!state || state.rounds.length === 0) return;

      const round = state.rounds[state.currentRoundIndex];
      if (!round) return;

      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, phase: 'judging' };
      });

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/judge-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedHint: round.expectedUserEn || round.userLine.en,
            userAnswer: answer,
            conversationHistory: state.history,
            isUserLine: true,
          }),
        });

        if (!res.ok) throw new Error('判断失败');

        const data = await res.json();

        setState((prev) => {
          if (!prev) return prev;
          const newRounds = [...prev.rounds];
          newRounds[prev.currentRoundIndex] = {
            ...newRounds[prev.currentRoundIndex],
            userAnswer: answer,
            isCorrect: data.isCorrect,
            aiFeedback: data.feedback,
          };
          const newHistory: ConversationMessage[] = [
            ...prev.history,
            { role: 'user', content: answer },
          ];
          return {
            ...prev,
            phase: data.isCorrect ? 'correct' : 'incorrect',
            retryCount: data.isCorrect ? 0 : prev.retryCount + 1,
            history: newHistory,
            rounds: newRounds,
          };
        });
      } catch (err: any) {
        setError(err.message);
        setState((prev) => {
          if (!prev) return prev;
          return { ...prev, phase: 'user-responding' };
        });
      } finally {
        setIsLoading(false);
      }
    },
    [state]
  );

  const nextRound = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const next = prev.currentRoundIndex + 1;
      if (next >= prev.rounds.length) {
        return {
          ...prev,
          phase: 'completed' as const,
          retryCount: 0,
        };
      }
      return {
        ...prev,
        phase: 'user-responding' as const,
        currentRoundIndex: next,
        retryCount: 0,
      };
    });
  }, []);

  const retry = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      return { ...prev, phase: 'user-responding' };
    });
  }, []);

  const restartFromFirst = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const freshRounds = prev.rounds.map((r) => ({
        ...r,
        userAnswer: undefined,
        isCorrect: undefined,
        aiFeedback: undefined,
      }));
      return {
        ...prev,
        rounds: freshRounds,
        currentRoundIndex: 0,
        phase: 'user-responding' as const,
        history: prev.history.slice(0, 1),
        retryCount: 0,
      };
    });
  }, []);

  return {
    state,
    isLoading,
    error,
    initConversation,
    submitAnswer,
    nextRound,
    retry,
    restartFromFirst,
  };
}
