import type { AIGenerateLessonResponse, Language, Lesson, LearningRecord, GlossaryTerm, Workspace, SyllabusItem } from '../types';

// ===== Syllabus (course roadmap) =====

export interface ParsedSyllabusItem {
  module: string;
  title: string;
  description: string;
}

export function buildSyllabusPrompt(
  workspace: Workspace,
  learningRecords: LearningRecord[],
  keepItems: SyllabusItem[],
  language: Language,
  mode: 'full' | 'replan',
  userRequest?: string,
): string {
  const lang = language === 'zh' ? 'Chinese (Simplified Chinese / 简体中文)' : 'English';
  const m = workspace.mission;

  let keptBlock = '';
  if (mode === 'replan' && keepItems.length > 0) {
    const stages: string[] = [];
    for (const it of keepItems) if (!stages.includes(it.module)) stages.push(it.module);
    const byStage = stages
      .map(st => `Stage "${st}":\n${keepItems.filter(k => k.module === st).map(k => `  - ${k.title}: ${k.description}`).join('\n')}`)
      .join('\n');
    keptBlock =
      `\n## Lessons already taught (KEEP — do NOT repeat or re-plan these)\n${byStage}\n` +
      `\n## Existing stage names (do NOT reuse or restart these)\n${stages.map(s => `- ${s}`).join('\n')}\n` +
      `The student has completed the lessons above. Plan ONLY the CONTINUATION (the upcoming lessons) so that, together with the kept lessons, it reads as ONE coherent progression. Do NOT restart stage numbering or reuse the existing stage names — either extend the final stage or add new, later stages.`;
  }

  const learnedBlock = learningRecords.length > 0
    ? `\n## What the student has already learned\n${learningRecords.map(lr => `- ${lr.title}: ${lr.content}`).join('\n')}`
    : '';

  const requestBlock = userRequest
    ? `\n## The student's adjustment request (IMPORTANT — follow this when planning)\n${userRequest}`
    : '';

  return `You are an expert curriculum designer. Design a learning roadmap (syllabus) for one student, grounded entirely in their mission.

## Language Requirement (CRITICAL)
ALL values (module names, lesson titles, descriptions) MUST be written in **${lang}**.

## Student's Mission
**Topic**: ${m.topic}
**Why**: ${m.why}
**Success looks like**: ${m.successLooksLike.join('; ')}
**Constraints**: ${m.constraints || 'None specified'}
**Out of scope**: ${m.outOfScope || 'None specified'}
${learnedBlock}${keptBlock}${requestBlock}

## Your Task
Produce an ordered course roadmap that takes the student from their current point to their mission's "success looks like":
- Organize into **3–5 stages (modules)**, ordered from foundational to advanced.
- Across all modules, **8–14 lessons total**.
- Each lesson = ONE tightly-scoped, tangible win, in the student's zone of proximal development. Respect prerequisites (later lessons build on earlier ones).
- Stay within the mission. Do NOT include anything listed as out of scope.
${mode === 'replan' ? '- Only plan lessons that come AFTER the "already planned / learned" list above. Do not repeat them.' : ''}

## Output Format (CRITICAL)
Output ONLY one line per lesson, in study order, each line EXACTLY:
模块名称 :: 课程标题 :: 一句话描述
That is: the module/stage name, then " :: ", the lesson title, then " :: ", a one-line description — separated by the literal token " :: " (space colon colon space). Lessons of the same module share the same module name and must be consecutive.
No numbering, no bullets, no markdown, no extra commentary. After the last line, output a final line containing only:
===KUAI:END===`;
}

export function parseSyllabusResponse(text: string): ParsedSyllabusItem[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('===KUAI:') && l.includes('::'))
    .map(line => {
      const parts = line.split('::').map(p => p.trim());
      // Be lenient: [module, title, description]; if only 2 parts, treat as title+desc.
      if (parts.length >= 3) {
        return { module: parts[0], title: parts[1], description: parts.slice(2).join(' :: ') };
      }
      return { module: '', title: parts[0], description: parts[1] || '' };
    })
    .filter(it => it.title);
}

export function buildLessonPrompt(
  workspace: Workspace,
  lessons: Lesson[],
  learningRecords: LearningRecord[],
  glossary: GlossaryTerm[],
  language: Language,
  userRequest?: string,
  syllabus: SyllabusItem[] = [],
  targetItem?: SyllabusItem,
): string {
  const lessonNumbers = lessons.map(l => l.number);
  const nextNumber = lessonNumbers.length > 0 ? Math.max(...lessonNumbers) + 1 : 1;

  // --- Token-bounded, volatile context (kept at the END so the long static
  // instructions above stay a stable prefix that providers can prompt-cache) ---

  // Learning records: full content for the most recent ~8, titles only for older.
  const RECENT = 8;
  const recent = learningRecords.slice(-RECENT);
  const older = learningRecords.slice(0, Math.max(0, learningRecords.length - RECENT));
  const learnedBlock = learningRecords.length > 0
    ? [
        ...recent.map(lr => `- ${lr.title}: ${lr.content}`),
        ...(older.length > 0 ? [`- (earlier: ${older.map(lr => lr.title).join('; ')})`] : []),
      ].join('\n')
    : '(No prior learning recorded — this is their first lesson)';

  // Glossary: full definition for up to 40 terms, names only beyond that.
  const GLOSS_CAP = 40;
  const glossBlock = glossary.length > 0
    ? [
        ...glossary.slice(0, GLOSS_CAP).map(g => `**${g.term}**: ${g.definition}`),
        ...(glossary.length > GLOSS_CAP
          ? [`(other terms, keep consistent: ${glossary.slice(GLOSS_CAP).map(g => g.term).join(', ')})`]
          : []),
      ].join('\n')
    : '(No glossary yet)';

  // Syllabus: compact — list module names; expand titles only for the target's module.
  let syllabusBlock = '';
  if (syllabus.length > 0) {
    const modules: string[] = [];
    for (const it of syllabus) if (!modules.includes(it.module)) modules.push(it.module);
    const focusModule = targetItem?.module;
    syllabusBlock = '\n## Course Roadmap (where this lesson sits)\n' + modules.map(mod => {
      if (mod === focusModule) {
        const titles = syllabus.filter(s => s.module === mod).map(s => `  - ${s.title}`).join('\n');
        return `- ${mod} (current stage):\n${titles}`;
      }
      return `- ${mod}`;
    }).join('\n');
  }

  const targetBlock = targetItem
    ? `\n## The lesson to create now\nTeach exactly this roadmap item: **${targetItem.title}** — ${targetItem.description}\nKeep it scoped to this; later items will cover the rest.`
    : '';

  return `You are an expert teacher creating a single, self-contained HTML lesson for a student.

## Language Requirement (CRITICAL)
The student's preferred language is: **${language === 'zh' ? 'Chinese (Simplified Chinese / 简体中文)' : 'English'}**
- ALL content you generate — lesson title, HTML content, quiz questions/answers/feedback, glossary terms, learning record — MUST be in ${language === 'zh' ? 'Chinese' : 'English'}.
- ${language === 'zh' ? 'Use natural, fluent Simplified Chinese throughout. Technical terms may include English in parentheses on first use.' : 'Use natural, fluent English throughout.'}
- Section markers and field labels stay in English — only the VALUES are translated.

## Teaching Philosophy
- Knowledge first, then skills via interactive practice
- Retrieval practice (quizzes) for storage strength
- Desirable difficulty — not too easy, not too hard
- Each lesson gives one tangible win tied to the student's mission
- **Depth over breadth**: teach ONE tightly-scoped thing, but teach it THOROUGHLY. The explanation is the heart of the lesson — quizzes are a small check at the end, not the main event.

## Student's Mission
**Topic**: ${workspace.mission.topic}
**Why**: ${workspace.mission.why}
**Success looks like**: ${workspace.mission.successLooksLike.join('; ')}
**Constraints**: ${workspace.mission.constraints || 'None specified'}
**Out of scope**: ${workspace.mission.outOfScope || 'None specified'}

## Your Task
Create a single, beautiful, self-contained HTML lesson, following the exact rules and output format below.

## Output Format (CRITICAL — read carefully)
Output your answer as plain text divided into the sections below. Each section begins with its marker on its own line. Put the raw content directly after each marker — **do NOT wrap anything in JSON, quotes, or code fences**. This means the HTML is written as-is (no escaping of quotes, newlines, or backslashes needed). Output the markers in exactly this order:

===KUAI:TITLE===
Lesson title (concise, specific, single line)
===KUAI:SLUG===
dash-case-slug
===KUAI:SOURCE_TITLE===
Best resource title (single line; leave blank if none)
===KUAI:SOURCE_URL===
https://... (single line; leave blank if none)
===KUAI:LESSON_HTML===
<!DOCTYPE html> ... the COMPLETE standalone lesson HTML document, written directly as raw HTML ...
===KUAI:GLOSSARY===
One term per line in the form: term | one-sentence definition | avoid1; avoid2
(leave this section empty if there are no new terms)
===KUAI:RECORD_TITLE===
Short title of what they learned (single line; leave blank to skip)
===KUAI:RECORD_CONTENT===
1-3 sentences describing the key insight and why it matters (leave blank to skip)
===KUAI:REFERENCE_TITLE===
Cheat sheet title (single line; leave blank to skip the reference)
===KUAI:REFERENCE_HTML===
<!DOCTYPE html> ... the COMPLETE standalone cheat-sheet HTML document, raw ...
===KUAI:END===

Rules for the format:
- Every marker (===KUAI:NAME===) must appear on its very own line, exactly as written.
- Never emit the literal string "===KUAI:" anywhere inside your content (titles, HTML, etc.).
- Do not add any text before ===KUAI:TITLE=== or after ===KUAI:END===.

## HTML Content Requirements (for the LESSON_HTML section)
- The lesson HTML MUST be a COMPLETE, STANDALONE HTML document (<!DOCTYPE html>...<html>...</html>)
- Use inline <style> for all CSS — NO external references
- Use a **LIGHT theme** and DEFINE these CSS custom properties yourself in :root with concrete light-mode values (do NOT leave them undefined, and do NOT rely on dark mode):
  \`:root{ --bg:#ffffff; --bg-card:#faf9f7; --text:#374151; --text-heading:#111827; --text-muted:#6b7280; --border:#e5e7eb; --accent:#6366f1; --accent-light:#eef2ff; --accent-border:#c7d2fe; }\`
- The <body> MUST set \`background: var(--bg)\` and \`color: var(--text)\` so the page is always readable on a light background with dark text.
- Design: clean, Tufte-inspired, readable typography. max-width ~42rem centered.
- Structure:
  1. Title + a short intro paragraph that motivates WHY this matters for the student's mission
  2. **Core teaching section — this is the bulk of the lesson. Cover 2-3 key concepts, and for EACH concept go deep using this layered structure:**
     - **Intuition / motivation**: why this concept exists, what problem it solves, in plain language
     - **Precise explanation**: the actual mechanics, in clear prose paragraphs (NOT just bullet points)
     - **A concrete worked example**: walk through a real, specific example step by step (code, numbers, a scenario — whatever fits the topic)
     - **An analogy or mental model** that makes it stick
     - **Common mistakes / pitfalls**: what learners get wrong and how to avoid it
     - Cite real, high-trust sources for claims — never fabricate
  3. ONE short quiz block at the end as a quick retrieval check (use the quiz-block class structure below)
  4. Summary / key takeaways
  5. Link to primary source for further reading
  6. Reminder to ask the AI teacher follow-up questions
- **Length & richness**: aim for a substantial, satisfying read. Explanations should be expanded into real paragraphs, not skimmed. Do NOT pad with fluff, but do NOT under-explain — the student should finish feeling they genuinely understand, not just skimmed bullets.

## Content Block Variety (use several of these to keep lessons rich, not monotonous)
- **Callout / note boxes** for key insights, tips, or warnings (e.g. a styled <div class="callout">)
- **Comparison tables** when contrasting options, approaches, or terms
- **Step-by-step / numbered procedures** for processes
- **"Common mistakes" boxes** highlighting pitfalls
- **Worked-example blocks** (e.g. <div class="example">) visually distinct from prose
- For programming topics: syntax-highlighted-looking <pre><code> blocks with real, runnable snippets
Style these blocks with the shared CSS custom properties below so they look consistent.

## Quiz Block Template (use exactly this structure)
\`\`\`html
<div class="quiz-block" data-quiz-id="q1">
  <div class="question">Question text here?</div>
  <div class="option" data-correct="true">Correct answer</div>
  <div class="option" data-correct="false">Wrong distractor 1</div>
  <div class="option" data-correct="false">Wrong distractor 2</div>
  <div class="option" data-correct="false">Wrong distractor 3</div>
  <div class="feedback correct">Correct! Explanation...</div>
  <div class="feedback wrong">Not quite. Explanation...</div>
</div>
\`\`\`

- All quiz options MUST be roughly the same length (same number of words ±1).
- Include only 1-2 quizzes per lesson — they are a brief retrieval check after the teaching, NOT the main content. Keep the depth in the explanation instead.
- Each quiz must have exactly one correct option marked data-correct="true".
- Write a clear, specific question that tests understanding (not just recall of a definition), and give a genuinely instructive explanation in both feedback blocks.

## Reference Document
The reference is a COMPRESSED cheat sheet — the essence of the lesson in quick-reference format.

- It MUST be a complete standalone HTML document (same as the lesson HTML — <!DOCTYPE html>... with inline <style>).
- Design for QUICK LOOKUP and PRINTING: use tables, bullet lists, syntax blocks, decision flowcharts. NOT narrative prose.
- Content depends on the topic: programming → syntax tables + decision rules; processes → flowcharts; physical skills → pose/routine sequences; any field → key formulas/patterns.
- Keep it SHORT — ideally one page when printed.
- Same language as the lesson (per the Language Requirement section at the top).
- Same CSS custom properties theming: --bg, --bg-card, --text, --text-heading, --text-muted, --border, --accent, --accent-light, --accent-border.

## Critical Rules
- NEVER fabricate facts. Only cite things you are confident are true.
- Stay within the student's zone of proximal development — challenge "just enough."
- Ground everything in the student's stated mission.
- Output ONLY the section format described above — the markers and their raw content. No surrounding prose, no code fences.

---
# Context for THIS lesson

## What they've already learned
${learnedBlock}

## Previous lesson titles
${lessons.length > 0 ? lessons.map(l => `Lesson ${l.number}: "${l.title}"`).join('\n') : '(No previous lessons)'}

## Glossary (canonical terms — use these exactly)
${glossBlock}
${syllabusBlock}${targetBlock}
${userRequest ? `\n## Student's specific request\n${userRequest}` : ''}

# Now produce Lesson ${nextNumber}
Following all rules and the exact section format above, create Lesson ${nextNumber}${targetItem ? ` on "${targetItem.title}"` : ''}. Output ONLY the ===KUAI:...=== sections.`;
}

export function parseLessonResponse(text: string): AIGenerateLessonResponse {
  // Preferred format: section markers (===KUAI:NAME===). The big HTML blobs are
  // raw text between markers, so no JSON escaping is needed — far more robust.
  if (text.includes('===KUAI:')) {
    return parseSectionResponse(text);
  }
  // Fallback: legacy JSON format (kept for resilience if a model still emits it).
  return parseJsonResponse(text);
}

function parseSectionResponse(text: string): AIGenerateLessonResponse {
  const sections: Record<string, string> = {};
  const re = /===KUAI:([A-Z_]+)===[ \t]*\r?\n?/g;
  const matches = [...text.matchAll(re)];

  for (let i = 0; i < matches.length; i++) {
    const name = matches[i][1];
    if (name === 'END') continue;
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    sections[name] = text.slice(start, end).trim();
  }

  const htmlContent = sections.LESSON_HTML;
  if (!htmlContent) {
    throw new Error(
      `Failed to parse AI response: no lesson HTML found. First 200 chars: "${text.slice(0, 200)}"`
    );
  }

  const glossaryTerms = (sections.GLOSSARY || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [term, definition, avoid] = line.split('|').map(p => (p ?? '').trim());
      return {
        term: term || '',
        definition: definition || '',
        avoid: avoid ? avoid.split(/[;；]/).map(a => a.trim()).filter(Boolean) : [],
      };
    })
    .filter(g => g.term && g.definition);

  const result: AIGenerateLessonResponse = {
    title: sections.TITLE || 'Untitled Lesson',
    slug: sections.SLUG || 'lesson',
    htmlContent,
    glossaryTerms,
  };

  if (sections.SOURCE_URL) {
    result.primarySource = { title: sections.SOURCE_TITLE || sections.SOURCE_URL, url: sections.SOURCE_URL };
  }
  if (sections.RECORD_TITLE && sections.RECORD_CONTENT) {
    result.learningRecord = { title: sections.RECORD_TITLE, content: sections.RECORD_CONTENT };
  }
  if (sections.REFERENCE_HTML) {
    result.reference = { title: sections.REFERENCE_TITLE || result.title, htmlContent: sections.REFERENCE_HTML };
  }

  return result;
}

function parseJsonResponse(text: string): AIGenerateLessonResponse {
  let json = text.trim();

  // 1. Strip markdown code fences — handle ```json ... ``` or ``` ... ```
  const fenceMatch = json.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    json = fenceMatch[1].trim();
  } else {
    // Remove leading/trailing fence lines if only one side matched
    json = json.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }

  // 2. Try to find the outermost JSON object
  const firstBrace = json.indexOf('{');
  const lastBrace = json.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    json = json.slice(firstBrace, lastBrace + 1);
  }

  // 3. Attempt parse
  try {
    return JSON.parse(json) as AIGenerateLessonResponse;
  } catch (e1: any) {
    // 4. Fix common JSON issues caused by AI: unescaped backslashes in string values
    const fixed = fixJsonEscapes(json);
    try {
      return JSON.parse(fixed) as AIGenerateLessonResponse;
    } catch {
      throw new Error(
        `Failed to parse AI response as JSON. Original error: ${e1.message}. ` +
        `First 200 chars of response: "${text.slice(0, 200)}"`
      );
    }
  }
}

// Fix backslashes that are not valid JSON escape sequences
function fixJsonEscapes(json: string): string {
  // We walk through the string and only fix backslashes inside JSON strings
  // A simple heuristic: find patterns like \X where X is not one of " \ / b f n r t u
  // and replace \ with \\
  const invalidEscape = /\\(?!["\\/bfnrtu])/g;
  return json.replace(invalidEscape, '\\\\');
}

export function buildChatPrompt(
  lessonTitle: string,
  lessonContent: string,
  language: Language,
): string {
  return `You are a patient, encouraging teacher helping a student understand a lesson they just completed.

## Language
The student's language is: **${language === 'zh' ? 'Chinese (Simplified Chinese)' : 'English'}**. Reply in this language.

## The Lesson
**Title**: ${lessonTitle}
**Content**: ${lessonContent.slice(0, 8000)}

## Your Role
- Answer the student's questions clearly and concisely.
- If they ask for clarification, explain in a different way — use analogies, examples, or simpler terms.
- If they want to go deeper, expand on the topic with additional relevant knowledge.
- If they are confused, diagnose their misunderstanding and address it directly.
- Keep responses friendly and encouraging. Use emoji sparingly.
- If asked about something outside the lesson scope, gently guide them back or briefly answer if related.
- NEVER fabricate facts. If you're unsure, say so.`;
}
