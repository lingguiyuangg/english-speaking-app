import { NextResponse } from 'next/server';
import { callDeepseek } from '@/lib/deepseek';
import { judgeAnswerPrompt } from '@/lib/prompts';

export async function POST(req: Request) {
  const { expectedHint, userAnswer, conversationHistory, isUserLine } = await req.json();

  if (!expectedHint || !userAnswer) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const history = (conversationHistory || [])
      .map((h: any) => `${h.role}: ${h.content}`)
      .join('\n');

    const prompt = judgeAnswerPrompt(expectedHint, userAnswer, history, !!isUserLine);

    const result = await callDeepseek(
      [
        { role: 'system', content: prompt },
        { role: 'user', content: '请判断用户的回答是否正确。' },
      ],
      { responseFormat: 'text', maxTokens: 50 }
    );

    const isCorrect = result?.trim().toUpperCase() === 'CORRECT';
    const feedback = isCorrect
      ? 'Great job!'
      : "Sorry, I didn't quite understand that. Could you say it again?";

    return NextResponse.json({ isCorrect, feedback });
  } catch (error) {
    console.error('Judge answer error:', error);
    return NextResponse.json({ isCorrect: false, feedback: 'Error judging answer. Please try again.' });
  }
}
