import type { AIGenerateLessonResponse, Settings, ChatMessage } from '../types';
import {
  buildLessonPrompt,
  parseLessonResponse,
  buildChatPrompt,
  buildSyllabusPrompt,
  parseSyllabusResponse,
  type ParsedSyllabusItem,
} from './prompts';
import { db } from '../db';
import { readChatCompletionStream } from './streaming';
import { fetchCompletion } from './request';
import { knowledgeContext, searchKnowledge } from '../api/knowledge';

type AIStreamCallback = (chunk: string) => void;

export async function generateSyllabus(
  settings: Settings,
  workspaceId: string,
  mode: 'full' | 'replan' = 'full',
  userRequest?: string,
): Promise<ParsedSyllabusItem[]> {
  const workspace = await db.workspaces.get(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const learningRecords = await db.learningRecords.where('workspaceId').equals(workspaceId).toArray();
  const keepItems = mode === 'replan'
    ? (await db.syllabusItems.where('workspaceId').equals(workspaceId).toArray())
        .filter(it => it.status === 'generated')
        .sort((a, b) => a.order - b.order)
    : [];

  const hits = await searchKnowledge(
    workspaceId,
    `${workspace.mission.topic} ${workspace.mission.why}`.trim(),
    6,
  ).catch(() => []);
  const systemPrompt = buildSyllabusPrompt(
    workspace, learningRecords, keepItems, settings.language, mode, userRequest, knowledgeContext(hits),
  );

  const response = await fetchCompletion(workspaceId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Design the course roadmap now.' },
      ],
      stream: false,
      temperature: 0.5,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI response');

  const items = parseSyllabusResponse(content);
  if (items.length === 0) throw new Error('Failed to parse syllabus from AI response');
  return items;
}

export async function generateLesson(
  settings: Settings,
  workspaceId: string,
  userRequest?: string,
  onStream?: AIStreamCallback,
  targetItemId?: string,
): Promise<AIGenerateLessonResponse> {
  const workspace = await db.workspaces.get(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const lessons = await db.lessons.where('workspaceId').equals(workspaceId).toArray();
  const learningRecords = await db.learningRecords.where('workspaceId').equals(workspaceId).toArray();
  const glossaryTerms = await db.glossaryTerms.where('workspaceId').equals(workspaceId).toArray();
  const syllabus = (await db.syllabusItems.where('workspaceId').equals(workspaceId).toArray()).sort((a, b) => a.order - b.order);
  const targetItem = targetItemId ? syllabus.find(s => s.id === targetItemId) : undefined;

  const hits = await searchKnowledge(
    workspaceId,
    `${targetItem?.title || workspace.mission.topic} ${targetItem?.description || userRequest || ''}`.trim(),
    8,
  ).catch(() => []);
  const systemPrompt = buildLessonPrompt(
    workspace, lessons, learningRecords, glossaryTerms, settings.language, userRequest,
    syllabus, targetItem, knowledgeContext(hits),
  );

  const response = await fetchCompletion(workspaceId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userRequest || `Create Lesson ${lessons.length + 1} for me.` },
      ],
      stream: false,
      temperature: 0.7,
      max_tokens: 20000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI response');

  onStream?.(content);
  return parseLessonResponse(content);
}

export async function generateLessonStream(
  settings: Settings,
  workspaceId: string,
  userRequest?: string,
  onChunk?: (chunk: string) => void,
  targetItemId?: string,
): Promise<AIGenerateLessonResponse> {
  const workspace = await db.workspaces.get(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const lessons = await db.lessons.where('workspaceId').equals(workspaceId).toArray();
  const learningRecords = await db.learningRecords.where('workspaceId').equals(workspaceId).toArray();
  const glossaryTerms = await db.glossaryTerms.where('workspaceId').equals(workspaceId).toArray();
  const syllabus = (await db.syllabusItems.where('workspaceId').equals(workspaceId).toArray()).sort((a, b) => a.order - b.order);
  const targetItem = targetItemId ? syllabus.find(s => s.id === targetItemId) : undefined;

  const hits = await searchKnowledge(
    workspaceId,
    `${targetItem?.title || workspace.mission.topic} ${targetItem?.description || userRequest || ''}`.trim(),
    8,
  ).catch(() => []);
  const systemPrompt = buildLessonPrompt(
    workspace, lessons, learningRecords, glossaryTerms, settings.language, userRequest,
    syllabus, targetItem, knowledgeContext(hits),
  );

  const response = await fetchCompletion(workspaceId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userRequest || `Create Lesson ${lessons.length + 1} for me.` },
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 20000,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error: ${response.status} ${err}`);
  }

  if (!response.body) throw new Error('No response body');
  const fullContent = await readChatCompletionStream(response.body, onChunk, true);

  return parseLessonResponse(fullContent);
}

export async function chatWithAI(
  settings: Settings,
  lessonId: string,
  messages: ChatMessage[],
  userMessage: string,
): Promise<string> {
  const lesson = await db.lessons.get(lessonId);
  if (!lesson) throw new Error('Lesson not found');
  const workspaceId = lesson.workspaceId;

  const hits = await searchKnowledge(workspaceId, userMessage, 6).catch(() => []);
  const systemPrompt = buildChatPrompt(
    lesson.title, lesson.htmlContent, settings.language, knowledgeContext(hits),
  );

  // Build conversation history (last 10 messages to stay within context)
  const recentMessages = messages.slice(-10);
  const chatMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...recentMessages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await fetchCompletion(workspaceId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: chatMessages,
      stream: false,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI response');

  return content;
}
