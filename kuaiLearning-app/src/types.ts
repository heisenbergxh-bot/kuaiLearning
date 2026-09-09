// === Core Data Types for KuaiLearning ===

export interface Workspace {
  id: string;
  name: string;
  mission: Mission;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface Mission {
  topic: string;
  why: string;
  successLooksLike: string[];
  constraints: string;
  outOfScope: string;
}

export interface Lesson {
  id: string;
  workspaceId: string;
  number: number;
  title: string;
  slug: string;
  htmlContent: string;
  primarySource?: { title: string; url: string };
  createdAt: number;
  updatedAt: number;
  serverSyncedAt?: number;
  // Progress
  completedAt?: number;
  quizCorrect?: number;
  quizTotal?: number;
  lastViewedAt?: number;
}

export interface LearningRecord {
  id: string;
  workspaceId: string;
  number: number;
  title: string;
  content: string;
  status?: 'active' | string; // 'active' or 'superseded by LR-NNNN'
  evidence?: string;
  implications?: string;
  sourceLessonId?: string;
  createdAt: number;
}

export interface GlossaryTerm {
  id: string;
  workspaceId: string;
  term: string;
  definition: string;
  avoid: string[];
  category?: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number;
  createdAt: number;
}

export interface Resource {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  type: 'knowledge' | 'wisdom';
  description: string;
  sourceLessonNumber?: number;
  createdAt: number;
}

export interface Reference {
  id: string;
  workspaceId: string;
  title: string;
  htmlContent: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number;
  createdAt: number;
}

export interface SyllabusItem {
  id: string;
  workspaceId: string;
  order: number;        // global 1-based sequence
  module: string;       // stage / module name, used for grouping
  title: string;        // what this lesson teaches (concise)
  description: string;  // one-line: what it covers / the tangible win
  status: 'planned' | 'generated'; // 'completed' is derived from the linked lesson's completedAt
  lessonId?: string;    // set once a lesson has been generated for this item
  createdAt: number;
  updatedAt?: number;
  serverSyncedAt?: number;
}

export interface QuizQuestion {
  id: string;
  workspaceId: string;
  lessonId: string;
  lessonNumber: number;
  question: string;
  options: { text: string; correct: boolean }[];
  feedbackCorrect?: string;
  feedbackWrong?: string;
  createdAt: number;
  // Practice progress
  timesAnswered: number;
  timesCorrect: number;
  lastAnsweredAt?: number;
  lastCorrect?: boolean;
}

export type Language = 'zh' | 'en';

export interface ChatMessage {
  id: string;
  lessonId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface Settings {
  language: Language;
}

export interface AIGenerateRequest {
  type: 'lesson' | 'glossary-term' | 'learning-record' | 'reference';
  workspace: Workspace;
  lessons: Lesson[];
  learningRecords: LearningRecord[];
  glossary: GlossaryTerm[];
  resources: Resource[];
  userRequest?: string;
}

export interface AIGenerateLessonResponse {
  title: string;
  slug: string;
  htmlContent: string;
  primarySource?: { title: string; url: string };
  glossaryTerms: { term: string; definition: string; avoid: string[] }[];
  learningRecord?: { title: string; content: string };
  reference?: { title: string; htmlContent: string };
}

export type AIProvider = 'openai' | 'deepseek' | 'custom';

export const AI_PROVIDERS: Record<AIProvider, { name: string; baseUrl: string; models: string[] }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'] },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  custom: { name: 'Custom', baseUrl: '', models: [] },
};
