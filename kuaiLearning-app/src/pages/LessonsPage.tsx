import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { generateAndSaveLesson } from '../lib/lessonGen';
import { SyllabusRoadmap } from '../components/SyllabusRoadmap';
import type { Lesson, SyllabusItem } from '../types';
import { db } from '../db';
import { generateRemoteSyllabus, syllabusItemFromRemote } from '../api/learningContent';
import { synchronizeLearningContent } from '../api/learningContentSync';
import { listKnowledgeSources, type KnowledgeSource } from '../api/knowledge';
import { AppIcon, type AppIconName } from '../components/AppIcon';

export function LessonsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { workspaces } = useWorkspaceStore();
  const { settings } = useSettingsStore();
  const workspace = workspaces.find(w => w.id === workspaceId);
  const { t, lang } = useTranslation();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [syllabus, setSyllabus] = useState<SyllabusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>([]);


  const loadLessons = useCallback(async () => {
    setLoading(true);
    const result = await db.lessons.where('workspaceId').equals(workspaceId!).toArray();
    setLessons(result.sort((a, b) => b.number - a.number));
    setLoading(false);
  }, [workspaceId]);

  const loadSyllabus = useCallback(async () => {
    const result = await db.syllabusItems.where('workspaceId').equals(workspaceId!).toArray();
    setSyllabus(result.sort((a, b) => a.order - b.order));
  }, [workspaceId]);

  const loadKnowledgeSources = useCallback(async () => {
    if (!workspaceId) return;
    setKnowledgeSources(await listKnowledgeSources(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      void synchronizeLearningContent(workspaceId)
        .catch(reason => console.warn('Learning content sync failed.', reason))
        .finally(() => {
          void loadLessons();
          void loadSyllabus();
        });
      void loadKnowledgeSources().catch(reason => console.warn('Knowledge source loading failed.', reason));
    }
  }, [workspaceId, loadLessons, loadSyllabus, loadKnowledgeSources]);

  useEffect(() => {
    if (!knowledgeSources.some(source => source.status === 'pending' || source.status === 'processing')) return;
    const timer = window.setInterval(() => void loadKnowledgeSources(), 3000);
    return () => window.clearInterval(timer);
  }, [knowledgeSources, loadKnowledgeSources]);

  const handleGenerateSyllabus = async (mode: 'full' | 'replan', guidance?: string) => {
    if (!workspaceId || generating) return;
    if (knowledgeSources.some(source => source.status === 'pending' || source.status === 'processing')) {
      setGenStatus(lang === 'zh' ? '资料仍在解析，请等待完成后再生成学习路线。' : 'Materials are still processing. Please wait before generating the roadmap.');
      return;
    }
    setGenerating(true);
    setGenStatus(t('generatingSyllabus'));
    try {
      const remoteItems = await generateRemoteSyllabus(
        workspaceId,
        mode,
        settings.language,
        guidance,
      );
      await db.transaction('rw', db.syllabusItems, async () => {
        await db.syllabusItems.where('workspaceId').equals(workspaceId).delete();
        await db.syllabusItems.bulkPut(remoteItems.map(syllabusItemFromRemote));
      });
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
    if (!workspaceId || generating) return;
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
    <div className="fade-in max-w-4xl">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('lessonsTitle')}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('lessonsDesc')}</p>

      <CourseSourcesPanel
        sources={knowledgeSources}
        roadmapCount={syllabus.length}
        lessonCount={lessons.length}
        lang={lang}
        onManage={() => navigate(`/workspace/${workspaceId}/resources`)}
      />

      <SyllabusRoadmap
        items={syllabus}
        lessons={lessons}
        busy={generating}
        onGenerateSyllabus={() => handleGenerateSyllabus('full')}
        onReplan={(guidance) => handleGenerateSyllabus('replan', guidance)}
        onGenerateItem={(item) => handleGenerate(item)}
        onOpenLesson={(lessonId, tab) => navigate(`/workspace/${workspaceId}/lesson/${lessonId}?tab=${tab}`)}
      />

      {(genStatus) && (
        <div className="mb-8 -mt-2">
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
                      <span className="shrink-0 text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] px-1.5 py-0.5 rounded-full">
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

function CourseSourcesPanel({ sources, roadmapCount, lessonCount, lang, onManage }: { sources: KnowledgeSource[]; roadmapCount: number; lessonCount: number; lang: 'zh' | 'en'; onManage: () => void }) {
  const ready = sources.filter(source => source.status === 'ready');
  const processing = sources.filter(source => source.status === 'pending' || source.status === 'processing');
  const labels: Record<string, string> = lang === 'zh'
    ? { core: '核心教材', supplementary: '补充资料', exam: '题库/考试', notes: '个人笔记', document: '学习资料' }
    : { core: 'Core', supplementary: 'Supplementary', exam: 'Exam', notes: 'Notes', document: 'Material' };

  return (
    <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-heading)]">{lang === 'zh' ? '课程依据' : 'Course materials'}</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {ready.length > 0
              ? (lang === 'zh' ? `${ready.length} 份资料将用于规划路线、生成课时和答疑。` : `${ready.length} material(s) will ground the roadmap, lessons, and chat.`)
              : (lang === 'zh' ? '还没有可用资料，可以上传教材后再生成学习路线。' : 'No ready materials. Upload a source before generating the roadmap.')}
          </p>
        </div>
        <button onClick={onManage} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium hover:border-[var(--color-accent-border)] hover:bg-[var(--color-accent-light)]">
          <AppIcon name={sources.length ? 'settings' : 'upload'} className="h-3.5 w-3.5" />
          {lang === 'zh' ? (sources.length ? '管理资料' : '上传资料') : (sources.length ? 'Manage' : 'Upload')}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <LearningStep icon="file" label={lang === 'zh' ? '1. 学习资料' : '1. Materials'} value={ready.length ? `${ready.length} ${lang === 'zh' ? '份可用' : 'ready'}` : (lang === 'zh' ? '待上传' : 'Not ready')} active={ready.length > 0} />
        <LearningStep icon="route" label={lang === 'zh' ? '2. 学习路线' : '2. Roadmap'} value={roadmapCount ? `${roadmapCount} ${lang === 'zh' ? '个课时' : 'items'}` : (lang === 'zh' ? '待生成' : 'Not generated')} active={roadmapCount > 0} />
        <LearningStep icon="book" label={lang === 'zh' ? '3. 学习课程' : '3. Lessons'} value={lessonCount ? `${lessonCount} ${lang === 'zh' ? '节已生成' : 'generated'}` : (lang === 'zh' ? '待生成' : 'Not generated')} active={lessonCount > 0} />
      </div>
      {ready.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {ready.map(source => <span key={source.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/40 px-2.5 py-1 text-xs text-[var(--color-text)]"><span className="text-[10px] text-[var(--color-accent)]">{labels[source.source_type] || labels.document}</span><span className="max-w-52 truncate">{source.title}</span></span>)}
        </div>
      )}
      {processing.length > 0 && <p className="mt-2 text-xs text-[var(--color-warning)]">{lang === 'zh' ? `${processing.length} 份资料正在解析，完成前不会生成学习路线。` : `${processing.length} material(s) are processing. Roadmap generation will wait.`}</p>}
    </div>
  );
}

function LearningStep({ icon, label, value, active }: { icon: AppIconName; label: string; value: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${active ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/35' : 'border-[var(--color-border)] bg-[var(--color-bg-subtle)]'}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)]'}`}><AppIcon name={icon} className="h-4 w-4" /></div>
      <div className="min-w-0"><p className="truncate text-xs font-medium text-[var(--color-text-heading)]">{label}</p><p className="truncate text-[11px] text-[var(--color-text-muted)]">{value}</p></div>
    </div>
  );
}
