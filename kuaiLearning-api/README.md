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
岗位/人才系统，浏览器同步接口不会覆盖该字段。

学习内容同步接口：

- `GET/PUT/DELETE /api/v1/workspaces/{workspace_id}/lessons[...]`：课程正文与学习进度。
- `GET/PUT/DELETE /api/v1/workspaces/{workspace_id}/syllabus[...]`：学习大纲及课程关联。

课程正文保存在 `lessons.content_payload`；大纲使用独立 `syllabus_items` 表。所有接口先
校验工作区所有权，前端已有 UUID 可直接幂等写入。当前题库明细、术语、参考文档和
学习记录仍只在 IndexedDB 中。

HTTP 环境必须保持 `COOKIE_SECURE=false`；迁移 HTTPS 后应改为 `true`。Cookie 写接口
要求浏览器 `Origin` 与 `PUBLIC_BASE_URL` 完全一致。

## 验证

### 服务端 AI 配置接口

- `GET /api/v1/settings/ai`：登录后读取统一模型配置。响应包含 `base_url`、`model`、
  `api_key_configured`、`source`（`database` 或 `environment`）和 `can_edit`，不返回密钥。
- `PUT /api/v1/settings/ai`：仅允许 `AI_CONFIG_ADMIN_SUBJECTS` 中的用户保存统一配置。
  账号标识使用 `/api/v1/me` 返回的 `subject`，不是用户名或邮箱。名单为空时禁止修改。

请求示例：

```json
{
  "base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "api_key": "实际密钥"
}
```

首次保存必须提交非空密钥；后续省略 `api_key` 或传 `null` 会保留已保存的密钥，
传空字符串会返回 422。地址仅接受 HTTP(S)，不能包含用户名、密码、查询参数或片段。
内网模型地址可用；只有管理员能修改这个服务端请求目标。

部署前安装依赖并执行 `alembic upgrade head`，然后在 `/opt/kuailearning/api.env` 中设置：

```dotenv
AI_CONFIG_ADMIN_SUBJECTS='["管理员的subject"]'
AI_CONFIG_ENCRYPTION_KEY=生成的Fernet密钥
```

使用后端 Python 环境运行以下命令生成加密密钥，并安全保存输出到上述配置文件：

```bash
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

新增环境配置后重启 API。加密密钥必须稳定保留，数据库恢复时也需要同一密钥；
不要在每次启动时重新生成。未配置或格式错误时，保存接口返回 503。
数据库中只存放加密后的 API Key，读取与保存响应均不回传密钥。
生产 Cookie 写请求仍须提供与 `PUBLIC_BASE_URL` 一致的 `Origin`。

生成大纲在每次请求时读取数据库配置，保存后无需重启；尚无数据库记录时使用原有
`MODEL_*` 环境配置。配置损坏或无法解密时返回 503，不会静默切换到其他密钥。
`api_key_configured` 表示已提供密钥，不代表已验证供应商连通性或余额。

前端设置页仅保留“AI 模型配置”，大纲、课程生成和聊天共用服务器配置。
依据 `can_edit` 控制编辑，空白密钥输入表示保留已保存密钥。
首次保存数据库配置仍需要提供密钥；浏览器只保存语言偏好，旧版本的本地密钥会被清除。

`POST /api/v1/workspaces/{workspace_id}/ai/completions` 为课程和聊天提供统一模型调用，
校验登录状态与工作区所有权。请求允许 `messages`、`stream`、`temperature`、`max_tokens`，
不允许指定模型、地址或密钥。支持普通响应及 SSE 流式正文；流中断或截断返回错误，
前端不会保存不完整课程。课程仍经 `generateAndSaveLesson` 保存并同步。

### 本地检查

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

### 可配置的 Embedding 服务

设置页新增“知识库 Embedding 模型”，与课程模型独立。管理员可读取、测试连接和保存
provider、base URL、模型、输出维度和密钥；普通登录用户仅可查看。
权限沿用 `AI_CONFIG_ADMIN_SUBJECTS`，密钥沿用 `AI_CONFIG_ENCRYPTION_KEY` 加密，
API 不返回密钥，浏览器不持久保存密钥。无鉴权内网接口可勾选“无需密钥鉴权”。

首次保存会保留同一接口已有的服务器密钥，不需要重新输入；留空保留已有密钥。
更换接口时必须提供该接口的新密钥或明确选择无需鉴权，避免将旧密钥发往新地址。
测试连接仅发送一条合成测试文本，不保存配置或索引。

数据库配置优先于环境配置，每次知识库请求都会读取，保存后无需重启。
部署前运行 `alembic upgrade head`（新增 `20261013_0007`）。
有资料时，设置接口会阻止直接更换 provider、base URL、模型或维度；应先安排
索引迁移或通过资料管理移除旧资料。处理中的资料会暂时阻止配置保存。
更新同一模型的密钥不会改变索引集合。手工迁移命令现在默认读取有效数据库配置，
因此不要仅修改环境变量来迁移已经通过设置页配置的模型。

Embedding 与课程生成的 `MODEL_*` 配置完全独立；无需修改前端。
`.env.example` 已预设硅基流动，目前官方将 `BAAI/bge-m3` 标注为免费模型。
服务器环境文件需要填写实名认证账号的密钥：

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_API_KEY=<在服务器环境文件中填写，不提交到 Git>
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSIONS=1024
EMBEDDING_TIMEOUT_SECONDS=30
EMBEDDING_BATCH_SIZE=16
EMBEDDING_MAX_CONCURRENCY=2
EMBEDDING_MAX_RETRIES=2
QDRANT_COLLECTION=kuailearning_knowledge
```

内网兼容 OpenAI 的服务只需替换地址、密钥（无鉴权时可留空）、模型和维度。
地址是包含 `/v1` 等接口前缀的 base URL，不包含 `/embeddings`；HTTP 请求自动追加
`/embeddings`，并发送 `model`、字符串数组 `input`、`encoding_format=float`。
响应需要包含 `data[].index` 和 `data[].embedding`。更换配置后重启 API。
当前不发送 `dimensions` 参数，应使用模型的默认输出维度。

离线本地部署先安装 `pip install '.[local-embedding]'`，再配置：

```dotenv
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIMENSIONS=384
EMBEDDING_CACHE_DIR=/opt/kuailearning/fastembed-cache
```

未设置 provider 时保留原本的本地行为，但本地模型依赖现在是可选安装项。
HTTP 模式不导入 FastEmbed 或加载本地模型。每进程限制并发，按配置分批请求，
网络异常、429 和 5xx 采用有限指数退避；401 等错误直接失败。
返回的数量、索引顺序、向量维度和数值均会检查。语义检索失败时仍尝试关键词检索。
外部服务会接收文档分块及查询文本；内网资料应配置允许使用的内网服务。

#### 已有向量迁移

原有本地模型继续使用原集合；其他模型根据 provider、base URL、模型、维度生成
集合名后缀，避免不同向量空间混用。切换模型或地址后需要重建向量。

1. 保留旧 release、旧环境配置和旧 Qdrant 集合，暂停资料上传/删除。
2. 准备新 release，使用新 embedding 配置和原数据库连接，在独立运维进程中运行
   下列命令。先检查预览，再执行写入；硅基流动密钥必须有效。
3. 完成后将 API 切换到相同新配置并重启，验证已有资料检索和新资料入库。
4. 验证失败时切回旧 release 和旧配置。不要在本次迁移中删除旧集合。

```bash
# 先通过现有部署方式加载受限服务器环境文件；不要打印其中的密钥。
python -m app.cli.reindex_knowledge
python -m app.cli.reindex_knowledge --apply
```

命令从 MySQL 的 ready 资料读取已有分块，保留 chunk ID、原文和资料状态，
写入新向量集合及现有关键词索引，不修改 MySQL 或删除旧集合。
中断后可重跑（按相同 ID 覆盖），完成前不要将线上检索切换到新配置。
回退期间产生的新资料需要用旧模型重建对应索引；恢复旧集合不等于新资料自动可检索。
未配置有效密钥时，不应切换线上服务。实际节省的内存需要重启后重新观测。

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
