'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voicesLoadedRef = useRef(false);

  // Ensure voices are loaded
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoadedRef.current = true;
      } else {
        window.speechSynthesis.onvoiceschanged = () => {
          voicesLoadedRef.current = true;
        };
      }
    }
  }, []);

  // Pick the best English voice available
  const getEnglishVoice = useCallback((): SpeechSynthesisVoice | undefined => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return undefined;
    const voices = window.speechSynthesis.getVoices();
    // Prefer a female-sounding English voice
    return voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
      || voices.find(v => v.lang.startsWith('en'))
      || undefined;
  }, []);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      audioCache.current.forEach((url) => URL.revokeObjectURL(url));
      audioCache.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Fallback to browser speech synthesis if TTS fails
  const playFallback = useCallback((text: string, speed: number = 1.0) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setError('当前设备不支持语音合成功能');
      return;
    }

    // On some mobile browsers (especially Chinese ROMs), no English voice is available
    const voice = getEnglishVoice();
    if (!voice) {
      setError('当前设备未安装英语语音包，请在系统设置中下载英语语音');
      return;
    }

    window.speechSynthesis.cancel();

    // Use a small timeout to ensure cancel completes
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.voice = voice;
      utterance.rate = speed;
      utterance.volume = 1.0;

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = (e) => {
        console.warn('Speech synthesis error:', e);
        setIsPlaying(false);
        setError('语音播放失败，请检查媒体音量设置');
      };
      window.speechSynthesis.speak(utterance);
    }, 50);
  }, [getEnglishVoice]);

  const play = useCallback(async (text: string, speed: number = 1.0) => {
    try {
      setError(null);
      // Try DashScope TTS API first
      let audioUrl = audioCache.current.get(text);

      if (!audioUrl) {
        const response = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speed }),
        });

        if (!response.ok) {
          throw new Error(`TTS request failed: ${response.status}`);
        }

        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        audioCache.current.set(text, audioUrl);
      }

      // Stop previous playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        setError('音频播放失败，已切换为浏览器语音');
        // Fallback to speech synthesis on audio element error (common on mobile)
        playFallback(text, speed);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Audio play was prevented, falling back to browser speech:', err.message);
          playFallback(text, speed);
        });
      }
    } catch (err: any) {
      console.warn('TTS API failed, falling back to browser speech:', err.message);
      // Auto-fallback to browser speech synthesis
      playFallback(text, speed);
    }
  }, [playFallback]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  }, []);

  return { isPlaying, error, play, playFallback, stop };
}
