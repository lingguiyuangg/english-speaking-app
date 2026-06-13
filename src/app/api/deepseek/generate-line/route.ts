import { NextResponse } from 'next/server';
import { callDeepseek } from '@/lib/deepseek';
import { generateLinePrompt } from '@/lib/prompts';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { scriptContext, userRole, aiRoles, conversationHistory, turnIndex, scriptLine, nextUserLineHint, isUserLine } = await req.json();

  if (!scriptContext || !aiRoles) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const history = conversationHistory
      .map((h: any) => `${h.role}: ${h.content}`)
      .join('\n');

    const currentLineStr = scriptLine ? `${scriptLine.role}：${scriptLine.content}` : '';

    const lineRoleName = scriptLine?.role || '';
    const prompt = generateLinePrompt(
      aiRoles.join(', '),
      userRole || '',
      scriptContext,
      history,
      turnIndex || 0,
      currentLineStr,
      nextUserLineHint || '',
      !!isUserLine,
      lineRoleName
    );

    const result = await callDeepseek([
      { role: 'system', content: prompt },
      { role: 'user', content: '请根据剧本和对话历史生成下一句台词。' },
    ], { maxTokens: 1000 });

    if (!result) {
      return NextResponse.json({ error: 'Empty response' }, { status: 500 });
    }

    // Handle possible markdown code blocks
    let jsonStr = result.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```(?:json)?\n?/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr);
    return NextResponse.json({
      en: parsed.en || '',
      zh: parsed.zh || '',
      aiHardWords: parsed.aiHardWords || [],
      expectedUserEn: parsed.expectedUserEn || '',
      hint: parsed.hint || { zhHint: '', hardWords: [] },
    });
  } catch (error: any) {
    console.error('Generate line error:', error?.message || error);
    return NextResponse.json({ error: '生成下一句台词失败' }, { status: 500 });
  }
}
