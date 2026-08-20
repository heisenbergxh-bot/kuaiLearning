import json
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from app.core.config import Settings


class DiagnosticDecision(BaseModel):
    status: Literal["question", "complete"]
    assistant_message: str
    competency: str | None = None
    hypothesis: str | None = None
    evidence_summary: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    recommended_focus: list[str] = Field(default_factory=list)


class DiagnosticInput(BaseModel):
    learning_goal: str
    competency_context: list[dict[str, Any]] = Field(default_factory=list)
    prior_turns: list[dict[str, str]] = Field(default_factory=list)
    learner_answer: str | None = None


class DiagnosticReasoner(Protocol):
    async def next_turn(self, request: DiagnosticInput) -> DiagnosticDecision: ...


class AgentScopeDiagnosticReasoner:
    """Stateless AgentScope adapter; conversation state remains in our database."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def next_turn(self, request: DiagnosticInput) -> DiagnosticDecision:
        # Import lazily: AgentScope has a comparatively expensive import path and should
        # not slow down health checks or non-AI API workers.
        from agentscope.agent import ReActAgent
        from agentscope.formatter import OpenAIChatFormatter
        from agentscope.message import Msg
        from agentscope.model import OpenAIChatModel

        api_key = self._settings.model_api_key.get_secret_value()
        if not api_key:
            raise RuntimeError("MODEL_API_KEY is not configured")

        model = OpenAIChatModel(
            model_name=self._settings.model_name,
            api_key=api_key,
            stream=False,
            client_kwargs={
                "base_url": self._settings.model_base_url,
                "timeout": self._settings.model_timeout_seconds,
            },
        )
        agent = ReActAgent(
            name="learning_diagnostician",
            sys_prompt=(
                "你是严谨的学习诊断教练。采用苏格拉底式追问，一次只问一个关键问题；"
                "优先索取可验证的经历、产物和决策依据，不把表达流畅误判为掌握。"
                "通常在3到7轮内形成结论。证据不足时继续提问，证据充分时才完成诊断。"
                "不得虚构岗位要求，也不得修改任何业务数据。"
            ),
            model=model,
            formatter=OpenAIChatFormatter(),
            max_iters=4,
        )
        prompt = (
            "请根据以下学习目标、外部能力上下文和完整对话记录，决定下一步追问或结束诊断。"
            "若 status=question，assistant_message 必须是一条清晰问题；若 status=complete，"
            "assistant_message 应总结判断并说明下一步真实输出任务。\n"
            + request.model_dump_json(indent=2)
        )
        response = await agent(
            Msg(name="learner", content=prompt, role="user"),
            structured_model=DiagnosticDecision,
        )
        if response.metadata is None:
            raise RuntimeError("AgentScope returned no structured diagnostic result")
        if isinstance(response.metadata, str):
            return DiagnosticDecision.model_validate_json(response.metadata)
        return DiagnosticDecision.model_validate(json.loads(json.dumps(response.metadata)))
