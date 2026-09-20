import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTranslation } from '../i18n/useTranslation';
import { uploadKnowledgeSource } from '../api/knowledge';
import type { Mission } from '../types';
import {
  SUGGESTED_TOPICS,
  SUGGESTED_MOTIVATIONS,
  SUGGESTED_SUCCESS,
  SUGGESTED_CONSTRAINTS,
} from '../lib/missionSuggestions';

interface MissionChatProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'topic' | 'why' | 'success' | 'constraints' | 'outOfScope' | 'materials' | 'summary';
type ChatMsg = { role: 'teacher' | 'user'; content: string };
type SourceType = 'core' | 'supplementary' | 'exam' | 'notes';
type SelectedFile = { file: File; sourceType: SourceType };

const ORDER: Step[] = ['topic', 'why', 'success', 'constraints', 'outOfScope', 'materials', 'summary'];
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.markdown'];

export function MissionChat({ open, onClose }: MissionChatProps) {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { createWorkspace, updateMission } = useWorkspaceStore();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [step, setStep] = useState<Step>('topic');
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [fileError, setFileError] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');

  // Collected mission fields
  const [topic, setTopic] = useState('');
  const [why, setWhy] = useState('');
  const [successItems, setSuccessItems] = useState<string[]>([]);
  const [constraintItems, setConstraintItems] = useState<string[]>([]);
  const [outOfScope, setOutOfScope] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  const questionFor = (s: Step): string => {
    switch (s) {
      case 'topic': return t('mcAskTopic');
      case 'why': return t('mcAskWhy');
      case 'success': return t('mcAskSuccess');
      case 'constraints': return t('mcAskConstraints');
      case 'outOfScope': return t('mcAskOutOfScope');
      case 'materials': return t('mcAskMaterials');
      case 'summary': return t('mcAskSummary');
    }
  };

  // Reset and seed greeting + first question whenever opened.
  useEffect(() => {
    if (open) {
      setStep('topic');
      setDraft('');
      setCreating(false);
      setTopic('');
      setWhy('');
      setSuccessItems([]);
      setConstraintItems([]);
      setOutOfScope('');
      setSelectedFiles([]);
      setFileError('');
      setUploadStatus('');
      setMessages([
        { role: 'teacher', content: t('mcGreeting') },
        { role: 'teacher', content: questionFor('topic') },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!open) return null;

  const advance = (from: Step, userBubble: string, teacherOverride?: string) => {
    const next = ORDER[ORDER.indexOf(from) + 1];
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userBubble },
      { role: 'teacher', content: teacherOverride ?? questionFor(next) },
    ]);
    setStep(next);
    setDraft('');
  };

  const buildRecap = (finalOutOfScope: string): string => {
    const dash = '—';
    const lines = [
      questionFor('summary'),
      '',
      `${t('onboardingReviewTopic')}: ${topic || dash}`,
      `${t('onboardingReviewWhy')}: ${why || dash}`,
      `${t('onboardingReviewSuccess')}: ${successItems.length ? successItems.join('、') : dash}`,
      `${t('onboardingReviewConstraints')}: ${constraintItems.length ? constraintItems.join('、') : dash}`,
      `${t('outOfScopeLabel')}: ${finalOutOfScope || dash}`,
      `${t('onboardingReviewMaterials')}: ${selectedFiles.length ? selectedFiles.map(item => item.file.name).join('、') : t('mcSkipped')}`,
    ];
    return lines.join('\n');
  };

  // --- Step handlers ---
  const submitTopic = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setTopic(v);
    advance('topic', v);
  };

  const submitWhy = (value: string) => {
    const v = value.trim();
    setWhy(v);
    advance('why', v || t('mcSkipped'));
  };

  const submitSuccess = () => {
    const bubble = successItems.length ? successItems.map(s => `• ${s}`).join('\n') : t('mcSkipped');
    advance('success', bubble);
  };

  const submitConstraints = () => {
    const bubble = constraintItems.length ? constraintItems.map(s => `• ${s}`).join('\n') : t('mcSkipped');
    advance('constraints', bubble);
  };

  const submitOutOfScope = (value: string) => {
    const v = value.trim();
    setOutOfScope(v);
    advance('outOfScope', v || t('mcSkipped'));
  };

  const submitMaterials = () => {
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: selectedFiles.length
          ? selectedFiles.map(item => `• ${item.file.name}`).join('\n')
          : t('mcSkipped'),
      },
      { role: 'teacher', content: buildRecap(outOfScope) },
    ]);
    setStep('summary');
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    setFileError('');
    const next = [...selectedFiles];
    for (const file of Array.from(files)) {
      const extension = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        setFileError(t('mcMaterialTypeError'));
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError(t('mcMaterialSizeError'));
        continue;
      }
      if (!next.some(item => item.file.name === file.name && item.file.size === file.size)) {
        next.push({ file, sourceType: 'core' });
      }
    }
    setSelectedFiles(next);
  };

  const toggle = (list: string[], setList: (v: string[]) => void, item: string) => {
    setList(list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  };

  const addCustom = (list: string[], setList: (v: string[]) => void) => {
    const v = draft.trim();
    if (v && !list.includes(v)) setList([...list, v]);
    setDraft('');
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const ws = await createWorkspace(topic.trim());
      const mission: Mission = {
        topic: topic.trim(),
        why: why.trim(),
        successLooksLike: successItems,
        constraints: constraintItems.join('；'),
        outOfScope: outOfScope.trim(),
      };
      await updateMission(ws.id, mission);
      if (selectedFiles.length) {
        const results: PromiseSettledResult<unknown>[] = [];
        for (const [index, item] of selectedFiles.entries()) {
          setUploadStatus(t('mcUploadingMaterial', {
            current: String(index + 1),
            total: String(selectedFiles.length),
          }));
          results.push(await Promise.allSettled([
            uploadKnowledgeSource(ws.id, item.file, undefined, item.sourceType),
          ]).then(([result]) => result));
        }
        const failed = results.filter(result => result.status === 'rejected').length;
        onClose();
        navigate(`/workspace/${ws.id}/resources?onboarding=1${failed ? `&uploadErrors=${failed}` : ''}`);
        return;
      }
      onClose();
      navigate(`/workspace/${ws.id}/lessons`);
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    if (creating) return;
    const hasData = topic || why || successItems.length || constraintItems.length || outOfScope;
    const msg = lang === 'zh' ? '确定放弃并关闭？' : 'Discard and close?';
    if (!hasData || confirm(msg)) onClose();
  };

  const chipBase = 'inline-flex px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors';
  const chipSelected = 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]';
  const chipIdle = 'border-[var(--color-border)] hover:bg-[var(--color-accent-light)] text-[var(--color-text)]';
  const inputClass =
    'flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all';
  const primaryBtn =
    'px-4 py-2 text-sm rounded-lg bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50';
  const ghostBtn =
    'px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-accent-light)] transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg bg-[var(--color-bg-card)] rounded-2xl shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-heading)]">
            🎯 {t('mcTitle')}
          </h2>
          <button
            onClick={handleClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-lg leading-none px-1"
            aria-label={t('close')}
          >
            ×
          </button>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px]">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-[var(--color-accent)] text-white rounded-br-md'
                    : 'bg-[var(--color-accent-light)]/50 text-[var(--color-text)] rounded-bl-md border border-[var(--color-border)]'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Dynamic input area */}
        <div className="border-t border-[var(--color-border)] px-5 py-4 space-y-3">
          {step === 'topic' && (
            <>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.map(tp => (
                  <button key={tp} onClick={() => submitTopic(tp)} className={`${chipBase} ${chipIdle}`}>{tp}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitTopic(draft); }}
                  placeholder={t('mcTopicPlaceholder')}
                  className={inputClass}
                />
                <button onClick={() => submitTopic(draft)} disabled={!draft.trim()} className={primaryBtn}>{t('send')}</button>
              </div>
            </>
          )}

          {step === 'why' && (
            <>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_MOTIVATIONS.map(m => (
                  <button key={m.label} onClick={() => submitWhy(m.value)} className={`${chipBase} ${chipIdle}`}>{m.label}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) submitWhy(draft); }}
                  placeholder={t('mcWhyPlaceholder')}
                  className={inputClass}
                />
                <button onClick={() => submitWhy(draft)} disabled={!draft.trim()} className={primaryBtn}>{t('send')}</button>
                <button onClick={() => submitWhy('')} className={ghostBtn}>{t('skip')}</button>
              </div>
            </>
          )}

          {step === 'success' && (
            <>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_SUCCESS.map(s => (
                  <button
                    key={s}
                    onClick={() => toggle(successItems, setSuccessItems, s)}
                    className={`${chipBase} ${successItems.includes(s) ? chipSelected : chipIdle}`}
                  >{s}</button>
                ))}
                {successItems.filter(s => !SUGGESTED_SUCCESS.includes(s)).map(s => (
                  <button key={s} onClick={() => toggle(successItems, setSuccessItems, s)} className={`${chipBase} ${chipSelected}`}>{s} ×</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(successItems, setSuccessItems); } }}
                  placeholder={t('addCustomItem')}
                  className={inputClass}
                />
                <button onClick={() => addCustom(successItems, setSuccessItems)} className={ghostBtn}>{t('add')}</button>
                <button onClick={submitSuccess} className={primaryBtn}>{t('mcContinue')}</button>
              </div>
            </>
          )}

          {step === 'constraints' && (
            <>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_CONSTRAINTS.map(c => (
                  <button
                    key={c}
                    onClick={() => toggle(constraintItems, setConstraintItems, c)}
                    className={`${chipBase} ${constraintItems.includes(c) ? chipSelected : chipIdle}`}
                  >{c}</button>
                ))}
                {constraintItems.filter(c => !SUGGESTED_CONSTRAINTS.includes(c)).map(c => (
                  <button key={c} onClick={() => toggle(constraintItems, setConstraintItems, c)} className={`${chipBase} ${chipSelected}`}>{c} ×</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(constraintItems, setConstraintItems); } }}
                  placeholder={t('addCustomItem')}
                  className={inputClass}
                />
                <button onClick={() => addCustom(constraintItems, setConstraintItems)} className={ghostBtn}>{t('add')}</button>
                <button onClick={submitConstraints} className={primaryBtn}>{t('mcContinue')}</button>
              </div>
            </>
          )}

          {step === 'outOfScope' && (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitOutOfScope(draft); }}
                placeholder={t('mcOutOfScopePlaceholder')}
                className={inputClass}
              />
              <button onClick={() => submitOutOfScope(draft)} disabled={!draft.trim()} className={primaryBtn}>{t('send')}</button>
              <button onClick={() => submitOutOfScope('')} className={ghostBtn}>{t('skip')}</button>
            </div>
          )}

          {step === 'materials' && (
            <div className="space-y-3">
              <label className="block rounded-xl border-2 border-dashed border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/20 px-4 py-5 text-center cursor-pointer hover:bg-[var(--color-accent-light)]/40 transition-colors">
                <span className="block text-2xl mb-1">📚</span>
                <span className="block text-sm font-medium text-[var(--color-text-heading)]">{t('mcChooseMaterials')}</span>
                <span className="block text-xs text-[var(--color-text-muted)] mt-1">{t('mcMaterialHint')}</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
                  className="hidden"
                  onChange={event => { addFiles(event.target.files); event.currentTarget.value = ''; }}
                />
              </label>
              {selectedFiles.length > 0 && (
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {selectedFiles.map((item, index) => (
                    <div key={`${item.file.name}-${item.file.size}`} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5">
                      <span className="text-lg">{item.file.name.toLowerCase().endsWith('.pdf') ? '📕' : '📄'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--color-text-heading)] truncate">{item.file.name}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>
                      <select
                        value={item.sourceType}
                        onChange={event => setSelectedFiles(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, sourceType: event.target.value as SourceType } : entry))}
                        className="max-w-28 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs"
                      >
                        <option value="core">{t('sourceTypeCore')}</option>
                        <option value="supplementary">{t('sourceTypeSupplementary')}</option>
                        <option value="exam">{t('sourceTypeExam')}</option>
                        <option value="notes">{t('sourceTypeNotes')}</option>
                      </select>
                      <button onClick={() => setSelectedFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} className="px-1 text-sm text-[var(--color-danger)]">×</button>
                    </div>
                  ))}
                </div>
              )}
              {fileError && <p className="text-xs text-[var(--color-danger)]">{fileError}</p>}
              <div className="flex gap-2">
                <button onClick={submitMaterials} className={`${primaryBtn} flex-1`}>{selectedFiles.length ? t('mcContinueWithMaterials') : t('skip')}</button>
              </div>
            </div>
          )}

          {step === 'summary' && (
            <div className="space-y-2">
              {uploadStatus && <p className="text-center text-xs text-[var(--color-text-muted)]">{uploadStatus}</p>}
              <button onClick={handleCreate} disabled={creating} className={`${primaryBtn} w-full`}>
                {creating ? (uploadStatus || t('onboardingCreating')) : t('mcCreate')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
