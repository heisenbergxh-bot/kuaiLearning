# AGENTS.md — KuaiLearning

## Project at a glance

Pure-client AI learning workspace: user sets a "mission," AI generates interactive HTML lessons, auto-curating glossary, references, quiz bank, and learning records. Everything lives in the browser (IndexedDB + localStorage). No backend, no SSR, no build-time data.

## Working directory

All dev commands run from **`kuaiLearning-app/`**, not the repo root.

```bash
cd kuaiLearning-app
npm install          # Node ≥ 20.19 required (Vite 8 constraint)
npm run dev          # → http://localhost:5173
npm run build        # tsc -b THEN vite build (typecheck runs first)
npm run lint         # oxlint only — no ESLint/Biome
```

## Stack & quirks

| Layer | Choice | Watch out for |
|---|---|---|
| Build | Vite 8 + `@vitejs/plugin-react` | Tailwind via `@tailwindcss/vite` plugin — NOT PostCSS |
| Style | Tailwind CSS 4 | Custom theme tokens are CSS custom properties (`var(--color-bg)`, `var(--color-accent)`, etc.), not `theme()` calls |
| TypeScript | ~6.0 | `verbatimModuleSyntax: true` — **`import type` is mandatory** for type-only imports. `noUnusedLocals` + `noUnusedParameters` enforced |
| Lint | Oxlint | `.oxlintrc.json` with react/typescript/oxc plugins |
| State | Zustand 5 | Two stores: `useSettingsStore` (localStorage-backed) and `useWorkspaceStore` |
| DB | Dexie 4 (IndexedDB) | DB name: `kuailearning`. Schema v5. All tables scoped by `workspaceId` |
| Routing | react-router-dom 7 | See routes below |
| IDs | `crypto.randomUUID()` | No external UUID lib |

## Architecture: data flow

```
User fills mission → OnboardingWizard → Mission stored in IndexedDB
     ↓
SyllabusRoadmap: AI generates staged lesson plan (SyllabusItem[])
     ↓
LessonsPage: user clicks "Generate" on an item
     ↓
generateAndSaveLesson() (src/lib/lessonGen.ts) — THE central flow:
  1. Calls AI → parses structured JSON response
  2. Persists Lesson record
  3. Extracts quizzes from HTML → QuizQuestion records
  4. Persists GlossaryTerm, LearningRecord, Reference, Resource
  5. Links SyllabusItem.status = 'generated'
     ↓
LessonDetailPage: renders self-contained HTML, inline quiz interaction, AI chat
```

**Key rule for agents**: To create a lesson, always use `generateAndSaveLesson()` from `src/lib/lessonGen.ts`. Never call `generateLesson()` / `generateLessonStream()` directly — those only return parsed data, they don't persist anything or extract side effects.

## Routes (all under Layout with Sidebar)

```
/                                            → redirect to active workspace mission
/settings                                    → AI provider + language config
/workspace/:workspaceId/mission              → MissionPage (edit mission)
/workspace/:workspaceId/lessons              → LessonsPage (syllabus roadmap + generate)
/workspace/:workspaceId/lesson/:lessonId     → LessonDetailPage (read + quiz + AI chat)
/workspace/:workspaceId/quiz                 → QuizBankPage
/workspace/:workspaceId/references           → ReferencesPage
/workspace/:workspaceId/records              → LearningRecordsPage
/workspace/:workspaceId/glossary             → GlossaryPage
/workspace/:workspaceId/resources            → ResourcesPage
```

## AI integration

- Direct browser → AI provider fetch (OpenAI-compatible `/chat/completions`)
- Default: DeepSeek (`deepseek-chat` model). Provider configurable in Settings.
- Settings stored in `localStorage` under key `kuailearning-settings` (plain text — API key is exposed)
- Prompt engineering lives in `src/ai/prompts.ts` — syllabus format uses `::` delimiters with `===KUAI:END===` terminator; lesson format returns JSON with markdown-fenced code blocks that `parseLessonResponse()` strips
- AI responses parsed with tolerance: strips code fences, repairs illegal escapes

## Database (Dexie / IndexedDB)

Schema defined in `src/db/index.ts`. Current version: 5. Tables:

| Table | Key indexes |
|---|---|
| workspaces | id, name, updatedAt |
| lessons | id, workspaceId, number, createdAt |
| learningRecords | id, workspaceId, number, createdAt |
| glossaryTerms | id, workspaceId, term, createdAt |
| resources | id, workspaceId, type, createdAt |
| references | id, workspaceId, sourceLessonId, createdAt |
| chatMessages | id, lessonId, createdAt |
| quizQuestions | id, workspaceId, lessonId, createdAt |
| syllabusItems | id, workspaceId, order, createdAt |

Adding a new table requires a new Dexie version. **Do not modify existing version blocks** — append a new `.version(N+1).stores({...})`.

Deleting a workspace must cascade: `useWorkspaceStore.deleteWorkspace()` handles this, including cleaning `chatMessages` by collected `lessonIds`. Use it rather than raw DB deletes.

## i18n

- Built-in bilingual support (`src/i18n/`): Chinese (`zh`, default) and English (`en`)
- UI strings via `useTranslation()` hook
- AI-generated content language controlled by `settings.language`

## teach/ directory

The `teach/` folder at repo root is the **pedagogical philosophy** origin (not runtime code). Format specs in `teach/*.md` describe output structures the AI prompts aim for, but the actual prompt templates are in `src/ai/prompts.ts`. The `teach/` files are reference docs, not imported by the app.

## Color theming

All colors are CSS custom properties defined in `src/index.css` via `@theme`:
- Light: warm paper tones (`--color-bg: #faf9f7`, indigo accent)
- Dark: triggered by `prefers-color-scheme: dark`
- Use `var(--color-*)` in components, not hardcoded hex values

## Tests

Vitest is the unit and integration test runner. Tests live beside source files as
`*.test.ts`. jsdom supplies DOM APIs and fake-indexeddb supplies IndexedDB in
Node-based integration tests.

Run `npm test` for a single pass or `npm run test:watch` while developing.
