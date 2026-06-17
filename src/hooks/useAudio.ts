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
   *
   * On failure, removes from preloadMap so a subsequent call retries.
   */
  const preload = useCallback(async (text: string, speed: number = 1.0) => {
    const key = `${text}|${speed}`;
    if (audioCache.current.has(text)) {
      return;
    }
    if (preloadMap.current.has(key)) {
      // If a previous preload is in-flight, wait for it
      return preloadMap.current.get(key);
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
        // Remove from preloadMap so a subsequent retry re-fetches
        preloadMap.current.delete(key);
      }
    })();

    preloadMap.current.set(key, promise);
    return promise;
  }, []);

  /**
   * Play TTS audio. Strategies in order:
   * 1. Already cached → play immediately (synchronous, user gesture preserved)
   * 2. Not cached → fetch now + play (preserves gesture on some mobile browsers)
   * 3. In-flight preload → wait for it, then try to play
   * 4. All failed → trigger preload, ask user to tap again
   */
  const play = useCallback(async (text: string, speed: number = 1.0) => {
    try {
      setError(null);

      // Stop previous playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Case 1: already cached → play immediately (gesture-safe)
      if (audioCache.current.has(text)) {
        const audioUrl = audioCache.current.get(text)!;
        playAudioUrl(audioUrl);
        return;
      }

      // Case 2: not cached — try fetching and playing in one gesture.
      // Some mobile browsers preserve the user gesture across async
      // boundaries when the promise chain is unbroken.
      const key = `${text}|${speed}`;
      const existingPreload = preloadMap.current.get(key);
      if (existingPreload) {
        // Case 3: preload already in-flight — wait for it
        setError('音频加载中...');
        await existingPreload;
        if (audioCache.current.has(text)) {
          playAudioUrl(audioCache.current.get(text)!);
          return;
        }
        // Preload failed, fall through to Case 4
      }

      // Case 2 (no preload yet): try inline fetch
      setIsPlaying(true);
      try {
        const response = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, speed }),
        });

        if (response.ok) {
          const blob = await response.blob();
          const audioUrl = URL.createObjectURL(blob);
          audioCache.current.set(text, audioUrl);

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
            await playPromise.catch((err) => {
              console.warn('Audio play rejected after inline fetch:', err.message);
              setIsPlaying(false);
              // Gesture lost — audio is now cached, user just needs to tap again
              setError('请再次点击播放按钮');
            });
          }
          return;
        }
      } catch (fetchErr: any) {
        console.warn('TTS inline fetch failed:', fetchErr.message);
      }
      setIsPlaying(false);

      // Case 4: everything failed — trigger background preload for next attempt
      setError('音频加载中，请再次点击播放按钮');
      preload(text, speed);
    } catch (err: any) {
      console.warn('TTS playback failed:', err.message);
      setError('语音播放失败，请检查网络连接');
    }
  }, [preload]);

  /** Internal helper: create and play an Audio element from a blob URL */
  function playAudioUrl(audioUrl: string) {
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
  }

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
