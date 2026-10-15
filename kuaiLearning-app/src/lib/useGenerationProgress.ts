import { useCallback, useState } from 'react';
import { isGenerationActive } from './generationProgress';
import type { GenerationProgress, LessonGenerationPhase } from './generationProgress';

export function useGenerationProgress() {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const begin = useCallback((title: string) => {
    setProgress({ title, phase: 'preparing', startedAt: Date.now(), characters: 0 });
  }, []);
  const onPhase = useCallback((phase: LessonGenerationPhase) => {
    setProgress(previous => previous && {
      ...previous, phase, endedAt: isGenerationActive(phase) ? undefined : Date.now(),
    });
  }, []);
  const onChunk = useCallback((chunk: string) => {
    setProgress(previous => previous && {
      ...previous, characters: previous.characters + Array.from(chunk).length,
    });
  }, []);
  const finish = useCallback((lessonId: string) => {
    setProgress(previous => previous && { ...previous, lessonId });
  }, []);
  const fail = useCallback((error: unknown) => {
    setProgress(previous => previous && {
      ...previous, phase: 'error', endedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
  }, []);
  const clear = useCallback(() => setProgress(null), []);
  return { progress, begin, onPhase, onChunk, finish, fail, clear };
}
