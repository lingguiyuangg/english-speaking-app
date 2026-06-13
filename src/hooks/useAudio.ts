'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

export function useAudio() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCache = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      setError('Speech synthesis not available on this device');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = speed;
    utterance.onstart = () => setIsPlaying(true);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      setIsPlaying(false);
      setError('Speech synthesis failed');
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const play = useCallback(async (text: string, speed: number = 1.0) => {
    try {
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
        setError('Audio playback failed, switching to browser speech');
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
