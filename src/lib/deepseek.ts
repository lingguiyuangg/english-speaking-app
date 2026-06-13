import OpenAI from 'openai';

let deepseek: OpenAI | null = null;

function getClient(): OpenAI {
  if (!deepseek) {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY environment variable is not set');
    }
    deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
      maxRetries: 0,
    });
  }
  return deepseek;
}

export async function callDeepseek(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { responseFormat?: 'json_object' | 'text'; maxTokens?: number }
) {
  const response = await getClient().chat.completions.create({
    model: 'deepseek-chat',
    messages,
    temperature: 0.7,
    max_tokens: options?.maxTokens ?? 2000,
    response_format:
      options?.responseFormat === 'text' ? undefined : { type: 'json_object' },
  });
  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error('Empty response from DeepSeek');
  }
  return content;
}
