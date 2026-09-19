from dataclasses import dataclass
from typing import Any, Literal

from app.models import LearningWorkspace, SyllabusItem


@dataclass(frozen=True, slots=True)
class GeneratedSyllabusItem:
    module_title: str
    title: str
    description: str


def build_syllabus_prompt(
    workspace: LearningWorkspace,
    kept_items: list[SyllabusItem],
    *,
    language: Literal["zh", "en"],
    mode: Literal["full", "replan"],
    guidance: str | None,
    knowledge_context: str = "",
) -> str:
    payload: dict[str, Any] = workspace.content_payload or {}
    mission = payload.get("mission") or {}
    output_language = "Chinese (Simplified Chinese / 简体中文)" if language == "zh" else "English"
    success = mission.get("success_looks_like") or []

    kept_block = ""
    if mode == "replan" and kept_items:
        rows = "\n".join(
            f"- {item.module_title} :: {item.title} :: {item.description}" for item in kept_items
        )
        kept_block = (
            "\n## Lessons already taught (KEEP; never repeat)\n"
            f"{rows}\nPlan only the continuation after these lessons."
        )
    guidance_block = (
        f"\n## Learner adjustment request (must follow)\n{guidance}" if guidance else ""
    )
    knowledge_block = (
        "\n## Uploaded learning materials\n"
        "Use these excerpts as the primary basis for the roadmap. Cover their important topics "
        "without inventing chapters or facts not present in the excerpts.\n"
        f"{knowledge_context}"
        if knowledge_context
        else ""
    )

    return f"""You are an expert curriculum designer. Design a learning roadmap for one learner.

## Language
All module names, titles, and descriptions must be in {output_language}.

## Mission
Topic: {mission.get('topic') or workspace.learning_goal}
Why: {mission.get('why') or 'Not specified'}
Success looks like: {'; '.join(str(item) for item in success) or 'Not specified'}
Constraints: {mission.get('constraints') or 'None specified'}
Out of scope: {mission.get('out_of_scope') or 'None specified'}
{kept_block}{guidance_block}{knowledge_block}

## Requirements
- Build 3-5 progressive modules and 8-14 tightly scoped lessons in total.
- Respect prerequisites and stay inside the mission and constraints.
- Each lesson must create one tangible learning outcome.
{('- Return only upcoming lessons, excluding the kept lessons.' if mode == 'replan' else '')}

## Output
Return only one lesson per line, with this exact separator:
模块名称 :: 课程标题 :: 一句话描述
Do not add numbering, bullets, Markdown, or commentary.
After the last lesson output exactly: ===KUAI:END==="""


def parse_syllabus_response(text: str) -> list[GeneratedSyllabusItem]:
    result: list[GeneratedSyllabusItem] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("===KUAI:") or "::" not in line:
            continue
        parts = [part.strip() for part in line.split("::")]
        if len(parts) < 3 or not parts[0] or not parts[1]:
            continue
        result.append(
            GeneratedSyllabusItem(
                module_title=parts[0][:200],
                title=parts[1][:200],
                description=" :: ".join(parts[2:])[:5000],
            )
        )
    if not 1 <= len(result) <= 30:
        raise ValueError("AI response did not contain a valid syllabus")
    return result
