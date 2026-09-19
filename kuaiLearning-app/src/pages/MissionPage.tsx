import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTranslation } from '../i18n/useTranslation';
import { MissionChat } from '../components/MissionChat';
import type { Mission as MissionType } from '../types';
import { ApiError } from '../api/http';

export function MissionPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { workspaces, activeId, loadWorkspaces, createWorkspace, updateMission } = useWorkspaceStore();
  const workspace = workspaces.find(w => w.id === activeId);
  const { t } = useTranslation();
  const [chatOpen, setChatOpen] = useState(false);

  const [topic, setTopic] = useState('');
  const [why, setWhy] = useState('');
  const [successItems, setSuccessItems] = useState<string[]>([]);
  const [constraints, setConstraints] = useState('');
  const [outOfScope, setOutOfScope] = useState('');
  const [newSuccessItem, setNewSuccessItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [deletedConflict, setDeletedConflict] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (workspace) {
      setTopic(workspace.mission.topic);
      setWhy(workspace.mission.why);
      setSuccessItems(workspace.mission.successLooksLike || []);
      setConstraints(workspace.mission.constraints);
      setOutOfScope(workspace.mission.outOfScope);
    }
  }, [workspace]);

  if (workspaces.length === 0 && !workspaceId) {
    return (
      <div className="fade-in max-w-lg mx-auto mt-16 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-text-heading)] mb-4">
          {t('welcomeTitle')}
        </h1>
        <p className="text-[var(--color-text-muted)] mb-6">
          {t('welcomeDesc')}
        </p>
        <button
          onClick={() => setChatOpen(true)}
          className="px-6 py-3 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          {t('createWorkspace')}
        </button>
        <MissionChat open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="fade-in text-center mt-16">
        <p className="text-[var(--color-text-muted)]">{t('selectWorkspaceHint')}</p>
      </div>
    );
  }

  const currentMission = (): MissionType => ({
      topic,
      why,
      successLooksLike: successItems.filter(Boolean),
      constraints,
      outOfScope,
  });

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    setDeletedConflict(false);
    try {
      await updateMission(workspace.id, currentMission());
      setSaveMessage(t('missionSaved'));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setDeletedConflict(true);
        setSaveMessage(t('workspaceDeletedConflict'));
      } else {
        setSaveMessage(reason instanceof Error ? reason.message : t('missionSaveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsCopy = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const copy = await createWorkspace(`${workspace.name}${t('workspaceCopySuffix')}`);
      await updateMission(copy.id, currentMission());
      await loadWorkspaces();
      navigate(`/workspace/${copy.id}/mission`, { replace: true });
    } catch (reason) {
      setSaveMessage(reason instanceof Error ? reason.message : t('missionSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveDeletedWorkspace = async () => {
    await loadWorkspaces();
    navigate('/', { replace: true });
  };

  const addSuccessItem = () => {
    if (newSuccessItem.trim()) {
      setSuccessItems([...successItems, newSuccessItem.trim()]);
      setNewSuccessItem('');
    }
  };

  const removeSuccessItem = (idx: number) => {
    setSuccessItems(successItems.filter((_, i) => i !== idx));
  };

  return (
    <div className="fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">
        {t('missionTitle')}: {workspace.name}
      </h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">
        {t('missionDesc')}
      </p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('topicLabel')}
          </label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder={t('topicPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('whyLabel')}
          </label>
          <p className="text-xs text-[var(--color-text-muted)] mb-1.5">{t('whyHint')}</p>
          <textarea
            value={why}
            onChange={e => setWhy(e.target.value)}
            placeholder={t('whyPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('successLabel')}
          </label>
          <p className="text-xs text-[var(--color-text-muted)] mb-1.5">{t('successHint')}</p>
          <div className="space-y-1.5 mb-2">
            {successItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-muted)] w-4">•</span>
                <span className="flex-1 text-sm text-[var(--color-text)]">{item}</span>
                <button
                  onClick={() => removeSuccessItem(idx)}
                  className="text-xs text-red-400 hover:text-red-600 px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSuccessItem}
              onChange={e => setNewSuccessItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSuccessItem(); } }}
              placeholder={t('successPlaceholder')}
              className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all"
            />
            <button
              onClick={addSuccessItem}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] transition-colors"
            >
              {t('add')}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('constraintsLabel')}
          </label>
          <textarea
            value={constraints}
            onChange={e => setConstraints(e.target.value)}
            placeholder={t('constraintsPlaceholder')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('outOfScopeLabel')}
          </label>
          <textarea
            value={outOfScope}
            onChange={e => setOutOfScope(e.target.value)}
            placeholder={t('outOfScopePlaceholder')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all resize-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2.5 bg-[var(--color-accent)] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? t('saving') : t('saveMission')}
        </button>
        {saveMessage && (
          <div className={`rounded-lg border p-3 text-sm ${deletedConflict ? 'border-amber-400/50 bg-amber-50 text-amber-800' : 'border-green-500/30 bg-green-500/10 text-green-700'}`} role="status">
            <p>{saveMessage}</p>
            {deletedConflict && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void handleSaveAsCopy()} disabled={saving} className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{t('saveAsNewWorkspace')}</button>
                <button onClick={() => void handleLeaveDeletedWorkspace()} disabled={saving} className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium disabled:opacity-50">{t('backToActiveWorkspace')}</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
