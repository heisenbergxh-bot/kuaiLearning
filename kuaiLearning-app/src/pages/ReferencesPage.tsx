import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { LessonRenderer } from '../components/LessonRenderer';
import { useTranslation } from '../i18n/useTranslation';
import type { Reference } from '../types';
import { db } from '../db';

export function ReferencesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [references, setReferences] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRef, setSelectedRef] = useState<Reference | null>(null);
  const { t } = useTranslation();
  const rendererWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workspaceId) loadReferences();
  }, [workspaceId]);

  const loadReferences = async () => {
    setLoading(true);
    const result = await db.references.where('workspaceId').equals(workspaceId!).toArray();
    setReferences(
      result.sort((a, b) => (a.sourceLessonNumber ?? 0) - (b.sourceLessonNumber ?? 0)),
    );
    setLoading(false);
  };

  const handlePrint = () => {
    const iframe = rendererWrapperRef.current?.querySelector('iframe');
    iframe?.contentWindow?.print();
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (selectedRef) {
    return (
      <div className="fade-in max-w-3xl">
        <button
          onClick={() => setSelectedRef(null)}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors inline-flex items-center gap-1 mb-3"
        >
          {t('backToReferences')}
        </button>

        <div className="flex items-start gap-3 mb-6">
          {selectedRef.sourceLessonNumber != null && (
            <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded mt-1.5">
              #{String(selectedRef.sourceLessonNumber).padStart(4, '0')}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold text-[var(--color-text-heading)] break-words">
              {selectedRef.title}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {new Date(selectedRef.createdAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent-border)] transition-colors whitespace-nowrap"
          >
            {t('print')}
          </button>
        </div>

        <div ref={rendererWrapperRef} className="rounded-xl overflow-hidden border border-[var(--color-border)] shadow-sm">
          <LessonRenderer htmlContent={selectedRef.htmlContent} />
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('referencesTitle')}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('referencesDesc')}</p>

      {references.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">📄</p>
          <p className="text-[var(--color-text-muted)] mb-1">{t('noReferencesYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noReferencesHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {references.map(ref => (
            <div
              key={ref.id}
              onClick={() => setSelectedRef(ref)}
              className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-accent-border)] hover:shadow-sm cursor-pointer transition-all group"
            >
              <div className="flex items-start gap-3">
                {ref.sourceLessonNumber != null && (
                  <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded mt-0.5">
                    #{String(ref.sourceLessonNumber).padStart(4, '0')}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[var(--color-text-heading)] group-hover:text-[var(--color-accent)] transition-colors truncate">
                    {ref.title}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    {new Date(ref.createdAt).toLocaleDateString()}
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
