'use client';
import { useState, useRef, useCallback } from 'react';

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);
  const finalTranscriptRef = useRef('');

  const isSupported =
    typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

  const start = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!isSupported) {
        const msg = '当前浏览器不支持语音识别';
        setError(msg);
        reject(new Error(msg));
        return;
      }

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
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      resolveRef.current = resolve;

      recognition.lang = 'en-US';
      recognition.interimResults = true;
      recognition.continuous = true; // allow pauses without ending
      recognition.maxAlternatives = 1;

      finalTranscriptRef.current = '';

      recognition.onresult = (event: any) => {
        let interim = '';
        // Process results from end to get latest final
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
        if (resolveRef.current) {
          const final = finalTranscriptRef.current.trim();
          if (final) {
            resolveRef.current(final);
          }
        }
        reject(new Error(msg));
      };

      recognition.onend = () => {
        setIsListening(false);
        // Auto-resolve with whatever we have on end
        if (resolveRef.current && !finalTranscriptRef.current) {
          // do nothing — user will manually stop or restart
        }
      };

      setIsListening(true);
      setError(null);
      try {
        recognition.start();
      } catch (e: any) {
        setIsListening(false);
        const msg = '启动语音识别失败: ' + (e.message || '');
        setError(msg);
        reject(new Error(msg));
      }
    });
  }, [isSupported]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
    // Resolve the promise with whatever was captured
    const final = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = '';
    if (resolveRef.current) {
      resolveRef.current(final || '');
      resolveRef.current = null;
    }
    return final;
  }, []);

  return {
    isSupported,
    isListening,
    interimText,
    error,
    start,
    stop,
  };
}
