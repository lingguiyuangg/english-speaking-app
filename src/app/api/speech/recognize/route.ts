import { NextResponse } from 'next/server';

/**
 * POST /api/speech/recognize
 * Proxy audio to DashScope Qwen-ASR Flash API for cloud speech recognition.
 * Accepts audio blob (WebM/MP3) as binary body, returns transcribed text.
 *
 * Tries multiple endpoint formats/regions in case the API key only works
 * with a specific one. Supports DASHSCOPE_ASR_BASE_URL env var override.
 */

// Endpoints to try in order (configurable via env var)
function getEndpoints(): string[] {
  const override = process.env.DASHSCOPE_ASR_BASE_URL;
  if (override) {
    return [override.replace(/\/$/, '')];
  }
  return [
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
  ];
}

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

    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'DASHSCOPE_API_KEY not configured' }, { status: 500 });
    }

    // Build request body — try without asr_options first (simpler),
    // then with asr_options if needed
    const requestBodies = [
      // Format 1: minimal, no asr_options
      JSON.stringify({
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: dataUrl },
              },
            ],
          },
        ],
      }),
      // Format 2: with asr_options at top level (not inside extra_body)
      JSON.stringify({
        model: 'qwen3-asr-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: dataUrl },
              },
            ],
          },
        ],
        asr_options: {
          language_hints: ['en'],
        },
      }),
    ];

    let lastError: string | null = null;

    for (const endpoint of getEndpoints()) {
      for (const body of requestBodies) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body,
          });

          if (response.ok) {
            const result = await response.json();
            const text = result?.choices?.[0]?.message?.content || '';

            if (!text) {
              return NextResponse.json({ error: 'Empty recognition result' }, { status: 500 });
            }

            console.log(`ASR latency: ${Date.now() - startTime}ms, text length: ${text.length}`);
            return NextResponse.json({ text });
          }

          // Non-auth error → don't retry with other endpoints
          if (response.status !== 401 && response.status !== 403) {
            const errText = await response.text();
            console.error('DashScope ASR non-auth error:', response.status, errText);
            return NextResponse.json({ error: 'Speech recognition failed' }, { status: response.status });
          }

          // Auth error — log and try next endpoint/format
          const errText = await response.text();
          console.warn(`DashScope ASR auth error (endpoint=${endpoint}): ${response.status} ${errText.slice(0, 200)}`);
          lastError = `Auth error (${response.status}) for endpoint ${endpoint}`;
        } catch (fetchErr: any) {
          console.warn(`DashScope ASR fetch error (endpoint=${endpoint}):`, fetchErr.message);
          lastError = fetchErr.message;
        }
      }
    }

    return NextResponse.json({ error: `Speech recognition failed: ${lastError}` }, { status: 500 });
  } catch (error) {
    console.error('Speech recognition error:', error);
    return NextResponse.json({ error: 'Speech recognition service error' }, { status: 500 });
  }
}
