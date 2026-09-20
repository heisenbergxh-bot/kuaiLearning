import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { MissionPage } from './pages/MissionPage';
import { LessonsPage } from './pages/LessonsPage';
import { LessonDetailPage } from './pages/LessonDetailPage';
import { QuizBankPage } from './pages/QuizBankPage';
import { ReferencesPage } from './pages/ReferencesPage';
import { LearningRecordsPage } from './pages/LearningRecordsPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { SettingsPage } from './pages/SettingsPage';
import { useWorkspaceStore } from './stores/useWorkspaceStore';
import { AuthGate } from './auth/AuthGate';
import { useSettingsStore } from './stores/useSettingsStore';
import { applyTheme, darkModeQuery } from './lib/theme';

function AppContent() {
  const { loadWorkspaces } = useWorkspaceStore();
  const theme = useSettingsStore(state => state.settings.theme);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia(darkModeQuery);
    const syncTheme = () => applyTheme('system');
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, [theme]);

  return <Layout />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGate>
        <Routes>
          <Route element={<AppContent />}>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/workspace/:workspaceId/mission" element={<MissionPage />} />
            <Route path="/workspace/:workspaceId/lessons" element={<LessonsPage />} />
            <Route path="/workspace/:workspaceId/lesson/:lessonId" element={<LessonDetailPage />} />
            <Route path="/workspace/:workspaceId/quiz" element={<QuizBankPage />} />
            <Route path="/workspace/:workspaceId/references" element={<ReferencesPage />} />
            <Route path="/workspace/:workspaceId/records" element={<LearningRecordsPage />} />
            <Route path="/workspace/:workspaceId/glossary" element={<GlossaryPage />} />
            <Route path="/workspace/:workspaceId/resources" element={<ResourcesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}

function RootRedirect() {
  const { workspaces, activeId } = useWorkspaceStore();
  const target = activeId || workspaces[0]?.id;
  if (target) {
    return <Navigate to={`/workspace/${target}/mission`} replace />;
  }
  return <MissionPage />;
}
