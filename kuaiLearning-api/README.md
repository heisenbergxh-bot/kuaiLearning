# KuaiLearning API

KuaiLearning 的学习域后端。当前阶段提供 FastAPI 骨架、MySQL 数据模型、Alembic
迁移和可替换的身份适配入口；统一登录与完整岗位人才系统不在本服务内实现。

## 边界

- 本服务拥有：学习工作区、课程、诊断对话、真实输出任务、提交与学习证据。
- 外部系统提供：员工身份、岗位/职级要求、能力差距等上下文快照。
- 本服务输出：可供人才系统订阅或拉取的学习证据事件。
- AgentScope 只负责需要模型推理的环节，数据库事务和业务状态由普通 Python 服务负责。

## 本地启动

要求 Python 3.11 或 3.12、MySQL 8.0+。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\uvicorn.exe app.main:app --reload
```

访问 `http://127.0.0.1:8000/docs`。生产环境不会暴露接口文档。

开发模式下，受保护接口可使用请求头 `X-Debug-User` 和
`X-Debug-Employee-Id` 模拟统一登录身份；该机制不能用于生产。

## 验证

```powershell
.\.venv\Scripts\ruff.exe check .
.\.venv\Scripts\mypy.exe app
.\.venv\Scripts\pytest.exe
```

## 数据库迁移

修改 ORM 模型后先生成迁移，再人工检查迁移脚本：

```powershell
.\.venv\Scripts\alembic.exe revision --autogenerate -m "describe change"
.\.venv\Scripts\alembic.exe upgrade head
```

生产部署时由发布流程执行 `alembic upgrade head`，不要让每个 Web 进程启动时
自行建表，以免多实例并发迁移。

## 内网部署建议

后端与前端 `dist` 分开发布：Nginx 继续托管前端，并把 `/api/` 反向代理到
Uvicorn/Gunicorn 服务。外网准备与目标 Linux、Python 版本一致的 wheel 包目录，
传入内网后使用 `pip install --no-index --find-links` 安装；不要把 Windows 虚拟环境
复制到 Linux。
