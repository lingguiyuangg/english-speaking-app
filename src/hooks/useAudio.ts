'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadMap = useRef<Map<string, Promise<void>>>(new Map());

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      audioCache.current.forEach((url) => URL.revokeObjectURL(url));
      audioCache.current.clear();
      preloadMap.current.clear();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  /**
   * Pre-fetch TTS audio and cache the blob URL.
   * Call this early (when a new round loads) so that when the user taps
   * the play button, the audio is already cached and can play immediately
   * within the user gesture context.
   */
  const preload = useCallback(async (text: string, speed: number = 1.0) => {
    const key = `${text}|${speed}`;
    if (audioCache.current.has(text) || preloadMap.current.has(key)) {
      return preloadMap.current.get(key) || Promise.resolve();
    }

    const promise = (async () => {
      try {
        const response = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speed }),
        });

        if (!response.ok) {
          throw new Error(`TTS request failed: ${response.status}`);
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        audioCache.current.set(text, audioUrl);
      } catch (err: any) {
        console.warn('TTS preload failed:', err.message);
        // Non-critical — play() will fall back gracefully
      }
    })();

    preloadMap.current.set(key, promise);
    return promise;
  }, []);

  /**
   * Play TTS audio. To avoid autoplay rejection on mobile:
   * 1. If the audio is already cached → play immediately (synchronous, user gesture preserved)
   * 2. If not cached → start loading and show an error asking user to tap again
   */
  const play = useCallback(async (text: string, speed: number = 1.0) => {
    try {
      setError(null);

      // Case 1: already cached → play immediately (gesture-safe)
      if (audioCache.current.has(text)) {
        const audioUrl = audioCache.current.get(text)!;

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
          setError('音频播放失败，请重试');
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Audio play failed:', err.message);
            setIsPlaying(false);
            setError('浏览器阻止了自动播放，请再次点击播放按钮');
          });
        }
        return;
      }

      // Case 2: not cached yet — trigger preload now
      // and tell user to tap again after loading
      setError('音频加载中，请再次点击播放按钮');
      preload(text, speed);
    } catch (err: any) {
      console.warn('TTS playback failed:', err.message);
      setError('语音播放失败，请检查网络连接');
    }
  }, [preload]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  }, []);

  return { isPlaying, error, play, preload, stop };
}
