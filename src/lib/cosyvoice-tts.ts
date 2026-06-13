export async function textToSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch('/api/tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: 'longxiaochun',
      speed: 1.0,
    }),
  });

  if (!response.ok) {
    throw new Error(`TTS failed: ${response.statusText}`);
  }

  return response.arrayBuffer();
}
