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

## Casdoor 统一登录

KuaiLearning 直接使用 Casdoor OIDC 授权码流程，并启用 S256 PKCE 和 nonce。
Casdoor Token 只在后端用于身份验证；浏览器仅保存 KuaiLearning 自己的 HttpOnly
会话 Cookie。生产配置示例见 `.env.example`。

外网测试环境使用：

```dotenv
PUBLIC_BASE_URL=http://81.71.157.238:8081
CASDOOR_ISSUER=http://81.71.157.238:8080
CASDOOR_CLIENT_ID=auth-center
CASDOOR_CLIENT_SECRET=<通过安全渠道取得>
CASDOOR_REDIRECT_URI=http://81.71.157.238:8081/api/v1/auth/callback
AUTH_MODE=external
APP_ENV=production
```

Casdoor 管理员必须把 `CASDOOR_REDIRECT_URI` 原样登记到 Application。内网部署使用
同一套代码，只替换 issuer、client、secret、public base URL 和 redirect URI。

认证接口：

- `GET /api/v1/auth/login`：生成 state、nonce、PKCE 并跳转 Casdoor。
- `GET /api/v1/auth/callback`：验证身份并创建本地会话。
- `POST /api/v1/auth/logout`：撤销本地会话。
- `GET /api/v1/me`：获取当前身份。

工作区同步接口：

- `GET /api/v1/workspaces`：分页读取当前用户的工作区及删除墓碑。
- `PUT /api/v1/workspaces/{id}`：使用浏览器现有 UUID 幂等创建或更新工作区。
- `GET /api/v1/workspaces/{id}`：读取当前用户拥有的活动工作区。
- `DELETE /api/v1/workspaces/{id}`：写入删除墓碑，防止其他浏览器重新上传旧副本。

`content_payload` 保存 KuaiLearning 前端拥有的使命与笔记；`context_snapshot` 保留给外部
岗位/人才系统，浏览器同步接口不会覆盖该字段。当前只同步工作区元数据，课程、题库、
术语和参考资料仍在 IndexedDB，后续按领域逐步迁移。

HTTP 环境必须保持 `COOKIE_SECURE=false`；迁移 HTTPS 后应改为 `true`。Cookie 写接口
要求浏览器 `Origin` 与 `PUBLIC_BASE_URL` 完全一致。

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

同源部署的 Nginx 核心代理规则为：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
