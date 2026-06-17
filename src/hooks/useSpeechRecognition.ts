'use client';
import { useState, useRef, useCallback } from 'react';

type SpeechMode = 'native' | 'cloud' | null;

const STREAM_REFUSED = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问后重试';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SpeechMode>(() => {
    const hasNative =
      typeof window !== 'undefined' &&
      (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
    const hasMic =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia;
    return hasNative ? 'native' : (hasMic ? 'cloud' : null);
  });
  const recognitionRef = useRef<any>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);
  const finalTranscriptRef = useRef('');

  // Cloud ASR state
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cloudChunksRef = useRef<Blob[]>([]);
  const cloudResolveRef = useRef<((value: string) => void) | null>(null);

  const isCloud = mode === 'cloud';
  const isSupported = mode !== null;

  /**
   * Request microphone permission explicitly via getUserMedia.
   * Does NOT stop the stream tracks — if cloud mode is needed later,
   * the stream is reused directly.
   * Returns the stream on success, null on failure.
   */
  const requestMicrophonePermission = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return stream;
    } catch (err: any) {
      console.warn('Microphone permission denied:', err.message);
      return null;
    }
  }, []);

  // ========== Native Web Speech API ==========

  /**
   * Starts native speech recognition.
   * On permission-related failure, auto-falls back to cloud mode
   * if getUserMedia succeeded (important for browsers like ArkWeb
   * that have a permission-constrained SpeechRecognition API).
   */
  const start = useCallback((): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      (async () => {
        // Always request mic permission first via getUserMedia.
        // This serves two purposes:
        //   1. Shows the user a clear permission prompt
        //   2. Preserves the stream for cloud fallback
        const stream = await requestMicrophonePermission();
        if (!stream) {
          const msg = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问后重试';
          setError(msg);
          reject(new Error(msg));
          return;
        }

        // Try native SpeechRecognition
        if (typeof window !== 'undefined' &&
            window.location.protocol !== 'https:' &&
            window.location.hostname !== 'localhost') {
          console.warn('Page loaded over HTTP — speech recognition may not work on some browsers');
        }

        // Stop any existing recognition
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch {}
        }

        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        // Safari on iOS sometimes defines SpeechRecognition but it's system-disabled.
        // If the constructor is missing entirely, fall back to cloud immediately.
        if (!SpeechRecognition) {
          setMode('cloud');
          startCloudStream(resolve, reject, stream);
          return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        resolveRef.current = resolve;

        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 1;

        finalTranscriptRef.current = '';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscriptRef.current += transcript;
            } else {
              interim += transcript;
            }
          }
          setInterimText(interim);
        };

        recognition.onerror = (event: any) => {
          setIsListening(false);
          setInterimText('');

          // If native speech fails with not-allowed or service-not-allowed,
          // AND we already have a mic stream, fall back to cloud mode.
          if ((event.error === 'not-allowed' || event.error === 'service-not-allowed') && stream) {
            console.warn('Native speech not allowed, falling back to cloud ASR');
            setMode('cloud');
            startCloudStream(resolve, reject, stream);
            return;
          }

          let msg = `语音识别错误: ${event.error}`;
          if (event.error === 'not-allowed') {
            msg = '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问';
          } else if (event.error === 'no-speech') {
            msg = '未检测到语音，请重试';
          } else if (event.error === 'aborted') {
            msg = '语音识别被中断';
          } else if (event.error === 'service-not-allowed') {
            msg = '当前浏览器不支持语音识别服务（非 HTTPS 页面下不可用）';
          }
          setError(msg);
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          reject(new Error(msg));
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        setIsListening(true);
        setError(null);
        try {
          recognition.start();
        } catch (e: any) {
          setIsListening(false);
          // Constructor exists but start() throws — also a sign native is broken.
          // Fall back to cloud. (stream is guaranteed non-null from line 70.)
          setMode('cloud');
          startCloudStream(resolve, reject, stream!);
          return;
        }
      })();
    });
  }, [requestMicrophonePermission]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
    const final = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = '';
    if (resolveRef.current) {
      resolveRef.current(final || '');
      resolveRef.current = null;
    }
    return final;
  }, []);

  // ========== Cloud ASR (MediaRecorder + DashScope) ==========

  const sendToCloudRecognize = useCallback(async (blob: Blob): Promise<string> => {
    try {
      const response = await fetch('/api/speech/recognize', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      return data.text || '';
    } catch (err: any) {
      console.error('Cloud ASR request failed:', err);
      throw err;
    }
  }, []);

  /**
   * Shared helper: start MediaRecorder on an already-obtained stream.
   * Called by startCloud() (when mode='cloud' from the start) and
   * by start() (when native speech recognition is broken on the device).
   */
  const startCloudStream = useCallback((
    resolve: (value: string) => void,
    reject: (reason: any) => void,
    stream: MediaStream,
  ) => {
    streamRef.current = stream;

    // Detect supported mime type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;
    cloudChunksRef.current = [];
    cloudResolveRef.current = resolve;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        cloudChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      setIsListening(false);
      setInterimText('识别中...');

      const blob = new Blob(cloudChunksRef.current, { type: mimeType });
      stream.getTracks().forEach(track => track.stop());
      streamRef.current = null;

      try {
        const text = await sendToCloudRecognize(blob);
        setInterimText('');
        if (cloudResolveRef.current) {
          cloudResolveRef.current(text || '');
          cloudResolveRef.current = null;
        }
      } catch (err: any) {
        setInterimText('');
        const msg = '云端语音识别失败: ' + (err.message || '');
        setError(msg);
        if (cloudResolveRef.current) {
          cloudResolveRef.current('');
          cloudResolveRef.current = null;
        }
        reject(new Error(msg));
      }
    };

    recorder.onerror = () => {
      setIsListening(false);
      stream.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      const msg = '录音失败';
      setError(msg);
      if (cloudResolveRef.current) {
        cloudResolveRef.current('');
        cloudResolveRef.current = null;
      }
      reject(new Error(msg));
    };

    recorder.start(250); // collect data every 250ms
    setIsListening(true);
    setError(null);
  }, [sendToCloudRecognize]);

  const startCloud = useCallback((): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      (async () => {
        try {
          // Request mic permission + get stream
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          startCloudStream(resolve, reject, stream);
        } catch (err: any) {
          const msg = err.name === 'NotAllowedError'
            ? '麦克风权限被拒绝，请在浏览器设置中允许麦克风访问后重试'
            : '启动录音失败: ' + (err.message || '');
          setError(msg);
          reject(new Error(msg));
        }
      })();
    });
  }, [startCloudStream]);

  const stopCloud = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      setIsListening(false);
      // If MediaRecorder didn't start, resolve with empty
      if (cloudResolveRef.current) {
        cloudResolveRef.current('');
        cloudResolveRef.current = null;
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  return {
    isSupported,
    isCloud,
    mode,
    isListening,
    interimText,
    error,
    start,
    stop,
    startCloud,
    stopCloud,
  };
}
