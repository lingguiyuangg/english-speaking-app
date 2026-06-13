import { NextResponse } from 'next/server';
import { callDeepseek } from '@/lib/deepseek';
import { generateScriptPrompt } from '@/lib/prompts';

export const maxDuration = 30; // Extend timeout for script generation

export async function POST(req: Request) {
  const { text, level } = await req.json();

  if (!text || !level) {
    return NextResponse.json({ error: 'Text and level are required' }, { status: 400 });
  }

  try {
    const prompt = generateScriptPrompt(text, level);
    const result = await callDeepseek([
      { role: 'system', content: prompt },
      { role: 'user', content: '请根据上面的要求生成对话剧本。' },
    ], { maxTokens: 3000 });

    if (!result) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 });
    }

    // Try to parse JSON — handle cases where AI wraps in markdown code blocks
    let jsonStr = result.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json({
      title: parsed.title || '英语对话',
      roles: parsed.roles || [],
      lines: parsed.lines || [],
    });
  } catch (error: any) {
    console.error('Generate script error:', error?.message || error);
    return NextResponse.json({ error: '生成剧本失败：' + (error?.message || '未知错误') }, { status: 500 });
  }
}
