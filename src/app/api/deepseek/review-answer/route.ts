import { NextResponse } from 'next/server';
import { callDeepseek } from '@/lib/deepseek';
import { reviewSentencePrompt } from '@/lib/prompts';

export async function POST(req: Request) {
  const { word, userSentence } = await req.json();

  if (!word || !userSentence) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const prompt = reviewSentencePrompt(word, userSentence);
    const result = await callDeepseek([
      { role: 'system', content: prompt },
      { role: 'user', content: '请评估用户的造句。' },
    ]);

    if (!result) {
      return NextResponse.json({ error: 'Empty response' }, { status: 500 });
    }

    const parsed = JSON.parse(result);
    return NextResponse.json({
      grammarScore: parsed.grammarScore ?? 5,
      wordUsageScore: parsed.wordUsageScore ?? 5,
      naturalnessScore: parsed.naturalnessScore ?? 5,
      feedback: parsed.feedback || '',
      betterExample: parsed.betterExample || '',
    });
  } catch (error) {
    console.error('Review answer error:', error);
    return NextResponse.json({ error: 'Failed to review sentence' }, { status: 500 });
  }
}
