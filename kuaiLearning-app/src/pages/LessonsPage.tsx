import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { generateSyllabus } from '../ai/client';
import { generateAndSaveLesson } from '../lib/lessonGen';
import { SyllabusRoadmap } from '../components/SyllabusRoadmap';
import type { Lesson, SyllabusItem } from '../types';
import { db, generateId } from '../db';

export function LessonsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { workspaces } = useWorkspaceStore();
  const { settings } = useSettingsStore();
  const workspace = workspaces.find(w => w.id === workspaceId);
  const { t } = useTranslation();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [syllabus, setSyllabus] = useState<SyllabusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');

  useEffect(() => {
    if (workspaceId) {
      loadLessons();
      loadSyllabus();
    }
  }, [workspaceId]);

  const loadLessons = async () => {
    setLoading(true);
    const result = await db.lessons.where('workspaceId').equals(workspaceId!).toArray();
    setLessons(result.sort((a, b) => b.number - a.number));
    setLoading(false);
  };

  const loadSyllabus = async () => {
    const result = await db.syllabusItems.where('workspaceId').equals(workspaceId!).toArray();
    setSyllabus(result.sort((a, b) => a.order - b.order));
  };

  const handleGenerateSyllabus = async (mode: 'full' | 'replan', guidance?: string) => {
    if (!workspaceId || !settings.apiKey || generating) return;
    setGenerating(true);
    setGenStatus(t('generatingSyllabus'));
    try {
      const items = await generateSyllabus(settings, workspaceId, mode, guidance);
      const now = Date.now();

      let kept: SyllabusItem[] = [];
      if (mode === 'replan') {
        // Keep every item that already has a lesson (never delete generated work);
        // drop only the not-yet-generated planned items.
        kept = syllabus.filter(s => s.lessonId).sort((a, b) => a.order - b.order);
        const drop = syllabus.filter(s => !s.lessonId).map(s => s.id);
        if (drop.length) await db.syllabusItems.bulkDelete(drop);
        // Compact kept orders to 1..k so deleted planned items leave no gaps.
        for (let i = 0; i < kept.length; i++) {
          if (kept[i].order !== i + 1) await db.syllabusItems.update(kept[i].id, { order: i + 1 });
        }
      } else {
        // Fresh plan — replace everything.
        await db.syllabusItems.where('workspaceId').equals(workspaceId).delete();
      }

      let order = mode === 'replan' ? kept.length : 0;
      for (const it of items) {
        order += 1;
        await db.syllabusItems.add({
          id: generateId(),
          workspaceId,
          order,
          module: it.module || t('syllabusTitle'),
          title: it.title,
          description: it.description,
          status: 'planned',
          createdAt: now,
        });
      }
      await loadSyllabus();
      setGenStatus(t('genDone'));
      setTimeout(() => setGenStatus(''), 2000);
    } catch (err: any) {
      setGenStatus(`${t('error')}: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async (targetItem?: SyllabusItem) => {
    if (!workspaceId || !settings.apiKey || generating) return;
    setGenerating(true);
    setGenStatus(t('genPreparing'));
    try {
      await generateAndSaveLesson(settings, workspaceId, {
        targetItem,
        onChunk: (chunk) => {
          setGenStatus(prev => prev.length > 80 ? t('genGenerating') : prev + chunk.slice(0, 30));
        },
      });
      await loadLessons();
      await loadSyllabus();
      setGenStatus(t('genDone'));
      setTimeout(() => setGenStatus(''), 2000);
    } catch (err: any) {
      setGenStatus(`${t('error')}: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!workspace) {
    return (
      <div className="fade-in text-center mt-16">
        <p className="text-[var(--color-text-muted)]">{t('selectWorkspaceHint')}</p>
      </div>
    );
  }

  // Lessons already shown in the roadmap shouldn't be duplicated below; the
  // bottom list only carries free-form / non-roadmap lessons. With no syllabus,
  // show all lessons so nothing becomes unreachable.
  const syllabusLessonIds = new Set(syllabus.map(s => s.lessonId).filter(Boolean));
  const otherLessons = syllabus.length ? lessons.filter(l => !syllabusLessonIds.has(l.id)) : lessons;

  return (
    <div className="fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('lessonsTitle')}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('lessonsDesc')}</p>

      <SyllabusRoadmap
        items={syllabus}
        lessons={lessons}
        busy={generating}
        hasApiKey={!!settings.apiKey}
        onGenerateSyllabus={() => handleGenerateSyllabus('full')}
        onReplan={(guidance) => handleGenerateSyllabus('replan', guidance)}
        onGenerateItem={(item) => handleGenerate(item)}
        onOpenLesson={(lessonId, tab) => navigate(`/workspace/${workspaceId}/lesson/${lessonId}?tab=${tab}`)}
      />

      {(genStatus || !settings.apiKey) && (
        <div className="mb-8 -mt-2">
          {!settings.apiKey && (
            <p className="text-xs text-[var(--color-warning)]">{t('genNoApiKey')}</p>
          )}
          {genStatus && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono truncate">{genStatus}</p>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-[var(--color-text-muted)]">{t('loading')}</p>
        </div>
      ) : lessons.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">📖</p>
          <p className="text-[var(--color-text-muted)] mb-1">{t('noLessonsYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noLessonsHint')}</p>
        </div>
      ) : otherLessons.length === 0 ? null : (
        <div className="space-y-3">
          {syllabus.length > 0 && (
            <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              {t('otherLessons')}
            </h3>
          )}
          {otherLessons.map(lesson => (
            <div
              key={lesson.id}
              onClick={() => navigate(`/workspace/${workspaceId}/lesson/${lesson.id}`)}
              className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-accent-border)] hover:shadow-sm cursor-pointer transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded mt-0.5">
                  #{String(lesson.number).padStart(4, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-[var(--color-text-heading)] group-hover:text-[var(--color-accent)] transition-colors truncate">
                      {lesson.title}
                    </h3>
                    {lesson.completedAt && (
                      <span className="shrink-0 text-[10px] font-medium text-green-600 bg-green-500/10 border border-green-500/30 px-1.5 py-0.5 rounded-full">
                        ✓ {t('completed')}
                      </span>
                    )}
                  </div>
                  {lesson.primarySource && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
                      {t('source')}: {lesson.primarySource.title}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {new Date(lesson.createdAt).toLocaleDateString()}
                    {lesson.quizTotal ? <span className="ml-2">· {t('quizProgress')} {lesson.quizCorrect ?? 0}/{lesson.quizTotal}</span> : null}
                  </p>
                </div>
                <span className="text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors text-lg">
                  →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
