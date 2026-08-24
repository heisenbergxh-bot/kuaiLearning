from typing import Any

import pytest

from app.api.routes.learning_content import generate_syllabus
from app.core.config import Settings
from app.core.current_user import CurrentUser
from app.models import LearningWorkspace, SyllabusItem
from app.schemas.learning_content import SyllabusGenerateRequest
from app.services.model_gateway import ModelGatewayError, OpenAICompatibleModelGateway
from app.services.syllabus_generation import build_syllabus_prompt, parse_syllabus_response


class FakeGateway:
    def __init__(self, response: str) -> None:
        self.response = response
        self.system_prompt = ""

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        self.system_prompt = system_prompt
        assert user_prompt
        assert temperature == 0.5
        assert max_tokens == 3000
        return self.response


class FakeGenerationSession:
    def __init__(
        self,
        workspace: LearningWorkspace,
        existing: list[SyllabusItem] | None = None,
    ) -> None:
        self.workspace = workspace
        self.items = list(existing or [])
        self.executed = 0
        self.flush_count = 0
        self.commit_count = 0
        self.scalars_count = 0

    async def scalar(self, _statement: Any) -> LearningWorkspace:
        return self.workspace

    async def scalars(self, _statement: Any) -> list[SyllabusItem]:
        self.scalars_count += 1
        return list(self.items)

    async def execute(self, _statement: Any) -> None:
        self.executed += 1
        self.items = []

    async def flush(self) -> None:
        self.flush_count += 1

    def add(self, item: SyllabusItem) -> None:
        self.items.append(item)

    async def commit(self) -> None:
        self.commit_count += 1


def workspace() -> LearningWorkspace:
    return LearningWorkspace(
        id="workspace-1",
        owner_subject="identity-1",
        title="学习事务",
        learning_goal="掌握数据库事务",
        content_payload={
            "mission": {
                "topic": "数据库事务",
                "why": "减少生产故障",
                "success_looks_like": ["解释隔离级别", "排查死锁"],
                "constraints": "每周三小时",
                "out_of_scope": "数据库内核开发",
            }
        },
    )


def test_prompt_uses_server_workspace_mission_and_guidance() -> None:
    prompt = build_syllabus_prompt(
        workspace(),
        [],
        language="zh",
        mode="replan",
        guidance="增加真实排障练习",
    )

    assert "数据库事务" in prompt
    assert "数据库内核开发" in prompt
    assert "增加真实排障练习" in prompt


def test_parser_accepts_delimited_lines_and_rejects_empty_output() -> None:
    parsed = parse_syllabus_response(
        "基础 :: 事务边界 :: 能识别事务边界\n===KUAI:END==="
    )
    assert parsed[0].module_title == "基础"
    assert parsed[0].title == "事务边界"

    with pytest.raises(ValueError, match="valid syllabus"):
        parse_syllabus_response("这里没有结构化课程")


@pytest.mark.asyncio
async def test_model_gateway_requires_server_api_key() -> None:
    gateway = OpenAICompatibleModelGateway(Settings(app_env="test", model_api_key=""))

    with pytest.raises(ModelGatewayError) as error:
        await gateway.complete(
            system_prompt="system",
            user_prompt="user",
            temperature=0.5,
            max_tokens=100,
        )

    assert error.value.kind == "configuration"


@pytest.mark.asyncio
async def test_generate_syllabus_persists_model_result() -> None:
    session = FakeGenerationSession(workspace())
    gateway = FakeGateway(
        "基础 :: 事务边界 :: 能识别事务边界\n"
        "实践 :: 死锁排查 :: 能完成一次排障\n"
        "===KUAI:END==="
    )

    result = await generate_syllabus(
        "workspace-1",
        SyllabusGenerateRequest(mode="full", language="zh"),
        CurrentUser(subject="identity-1"),
        session,  # type: ignore[arg-type]
        gateway,
    )

    assert [item.order_index for item in result] == [1, 2]
    assert [item.title for item in result] == ["事务边界", "死锁排查"]
    assert session.executed == 1
    assert session.flush_count == 1
    assert session.commit_count == 1
