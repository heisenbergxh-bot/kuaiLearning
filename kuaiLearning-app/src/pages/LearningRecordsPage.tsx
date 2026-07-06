import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import type { LearningRecord } from '../types';
import { db, generateId } from '../db';

export function LearningRecordsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [evidence, setEvidence] = useState('');
  const [implications, setImplications] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    if (workspaceId) loadRecords();
  }, [workspaceId]);

  const loadRecords = async () => {
    setLoading(true);
    const result = await db.learningRecords.where('workspaceId').equals(workspaceId!).toArray();
    setRecords(result.sort((a, b) => b.number - a.number));
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!workspaceId || !title.trim() || !content.trim()) return;

    const nums = records.map(r => r.number);
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;

    await db.learningRecords.add({
      id: generateId(),
      workspaceId,
      number: nextNum,
      title: title.trim(),
      content: content.trim(),
      status: 'active',
      evidence: evidence.trim() || undefined,
      implications: implications.trim() || undefined,
      createdAt: Date.now(),
    });

    setTitle('');
    setContent('');
    setEvidence('');
    setImplications('');
    setShowForm(false);
    await loadRecords();
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteRecordConfirm'))) {
      await db.learningRecords.delete(id);
      await loadRecords();
    }
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="fade-in max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('recordsTitle')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{t('recordsDesc')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] transition-colors"
        >
          {showForm ? t('cancel') : t('addRecord')}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-[var(--color-accent-border)] bg-[var(--color-bg-card)] space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('recordTitlePlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t('recordContentPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 resize-none"
          />
          <input
            type="text"
            value={evidence}
            onChange={e => setEvidence(e.target.value)}
            placeholder={t('evidencePlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <input
            type="text"
            value={implications}
            onChange={e => setImplications(e.target.value)}
            placeholder={t('implicationsPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            {t('saveRecord')}
          </button>
        </div>
      )}

      {records.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">📝</p>
          <p className="text-[var(--color-text-muted)]">{t('noRecordsYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noRecordsHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(record => (
            <div
              key={record.id}
              className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded">
                      LR-{String(record.number).padStart(4, '0')}
                    </span>
                    {record.status && record.status !== 'active' && (
                      <span className="text-xs bg-[var(--color-warning-bg)] text-[var(--color-warning)] px-2 py-0.5 rounded">
                        {record.status}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-[var(--color-text-heading)]">{record.title}</h3>
                  <p className="text-sm text-[var(--color-text)] mt-1">{record.content}</p>
                  {record.evidence && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      <span className="font-medium">{t('evidence')}:</span> {record.evidence}
                    </p>
                  )}
                  {record.implications && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      <span className="font-medium">{t('implications')}:</span> {record.implications}
                    </p>
                  )}
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    {new Date(record.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(record.id)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-2 py-1 transition-opacity"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
