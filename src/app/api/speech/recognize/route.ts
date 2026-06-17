import { NextResponse } from 'next/server';

/**
 * POST /api/speech/recognize
 * Proxy audio to DashScope Qwen-ASR Flash API for cloud speech recognition.
 * Accepts audio blob (WebM/MP3) as binary body, returns transcribed text.
 */
export async function POST(req: Request) {
  try {
    const startTime = Date.now();
    const arrayBuffer = await req.arrayBuffer();
    const contentType = req.headers.get('content-type') || 'audio/webm';
    const audioBytes = new Uint8Array(arrayBuffer);

    if (audioBytes.length === 0) {
      return NextResponse.json({ error: 'Empty audio data' }, { status: 400 });
    }

    if (audioBytes.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio too large (max 10MB)' }, { status: 413 });
    }

    // Convert audio bytes to base64 data URL
    const binaryStr = Array.from(audioBytes, (b) => String.fromCharCode(b)).join('');
    const base64 = btoa(binaryStr);
    const mimeType = contentType.includes('mp3') || contentType.includes('mpeg')
      ? 'audio/mpeg'
      : 'audio/webm';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Call DashScope Qwen-ASR Flash API via compatible-mode
    const response = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3-asr-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: dataUrl,
                  },
                },
              ],
            },
          ],
          // Optional: language_hints for better English recognition
          extra_body: {
            asr_options: {
              language_hints: ['en'],
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('DashScope ASR error:', response.status, errText);
      return NextResponse.json({ error: 'Speech recognition failed' }, { status: response.status });
    }

    const result = await response.json();
    const text = result?.choices?.[0]?.message?.content || '';

    if (!text) {
      return NextResponse.json({ error: 'Empty recognition result' }, { status: 500 });
    }

    console.log(`ASR latency: ${Date.now() - startTime}ms, text length: ${text.length}`);
    return NextResponse.json({ text });
  } catch (error) {
    console.error('Speech recognition error:', error);
    return NextResponse.json({ error: 'Speech recognition service error' }, { status: 500 });
  }
}
