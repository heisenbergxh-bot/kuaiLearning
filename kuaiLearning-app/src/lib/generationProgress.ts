export type LessonGenerationPhase =
  | 'preparing' | 'waiting' | 'generating' | 'validating'
  | 'saving' | 'syncing' | 'done' | 'local-only' | 'error';

export interface GenerationProgress {
  phase: LessonGenerationPhase;
  title: string;
  startedAt: number;
  endedAt?: number;
  characters: number;
  error?: string;
  lessonId?: string;
}

export function isGenerationActive(phase: LessonGenerationPhase): boolean {
  return phase !== 'done' && phase !== 'local-only' && phase !== 'error';
}
