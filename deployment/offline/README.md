# KuaiLearning 内网离线部署执行手册

本目录用于“外网构建、介质传输、内网离线安装”。内网服务器不执行 `npm ci`，不连接
PyPI/NPM，也不复制 Windows `node_modules` 或 Windows Python 虚拟环境。

## 一、整体交付物

每个版本只向内网传入以下内容：

1. `kuailearning-front-<release>.tar.gz`：Windows 外网电脑构建的静态前端。
2. `kuailearning-backend-<release>.tar.gz`：兼容目标 Linux 的源码和 wheelhouse。
3. 本 `deployment/offline` 目录。
4. 两个压缩包各自的 SHA256，通过独立消息或工单传递并在内网核验。

密钥、数据库密码、Casdoor Secret、真实业务数据绝不放进压缩包或 Git。

## 二、第一阶段：让内网 AI 只做环境盘点

先把本目录传到内网，要求 AI 以普通只读检查开始：

```bash
chmod +x deployment/offline/inspect-inner-server.sh
deployment/offline/inspect-inner-server.sh | tee /tmp/kuailearning-inner-platform.txt
```

将完整输出带回外网。外网 Linux 构建机至少应与内网满足：

- CPU 架构相同，通常为 `x86_64`；
- Python 主次版本相同，例如都为 `3.12`；
- 外网构建机 glibc 不高于内网；
- 最好使用相同发行版及大版本。

不满足时不要尝试安装 wheels。应改用与内网相同的 Linux 虚拟机/容器构建。

### 可原样交给内网 AI 的第一段提示词

```text
你正在公司内网 Linux 服务器部署 KuaiLearning。先阅读
deployment/offline/README.md，第一阶段只执行只读检查：运行
inspect-inner-server.sh，并完整返回输出。不要联网安装软件，不要修改现有 Nginx，
不要占用现有端口，不要读取或回显任何密钥。确认外网 wheel 包的平台信息与本机
架构、Python 主次版本及 glibc 兼容之前，不得执行 deploy-inner.sh。
```

## 三、外网需要执行的操作

### A. Windows：构建前端

在仓库根目录确认目标分支与测试：

```powershell
cd D:\Study\repo\kuaiLearning
git switch codex/backend-foundation
git pull

powershell -ExecutionPolicy Bypass -File .\deployment\offline\build-frontend.ps1
```

脚本会执行 `npm ci`、lint、21 项前端测试和生产构建，并输出：

```text
artifacts/kuailearning-front-<Git提交>.tar.gz
```

服务器运行前端不需要 Node/npm。

### B. 外网 Linux：构建后端离线包

推荐使用已部署测试环境的腾讯云 Linux，但必须先与内网平台信息对比。把最新仓库放到外网
Linux 后执行：

```bash
cd /path/to/kuaiLearning
git switch codex/backend-foundation
git pull
chmod +x deployment/offline/build-backend-bundle.sh
deployment/offline/build-backend-bundle.sh
```

脚本会：

- 下载并生成 Linux wheels；
- 创建全新虚拟环境，以 `--no-index` 做一次真实断网安装；
- 导入 AgentScope、FastAPI、SQLAlchemy、asyncmy；
- 执行 `pip check`；
- 记录 OS、架构、Python、glibc；
- 生成校验清单和最终 SHA256。

输出：

```text
artifacts/kuailearning-backend-<Git提交>.tar.gz
```

这一步需要外网；内网无需下载 Python 包。

### C. 传入内网前检查

```bash
tar -tzf artifacts/kuailearning-backend-<release>.tar.gz | head
sha256sum artifacts/kuailearning-backend-<release>.tar.gz
```

前端包也计算 SHA256。通过公司批准的文件摆渡方式传入，不使用临时公网网盘。

## 四、内网首次安装准备

以下操作由内网 AI 在获得 root 授权后执行。先确认路径和端口，不覆盖已有应用。

### 1. 创建运行用户和目录

```bash
id kuailearning >/dev/null 2>&1 || useradd --system --home /opt/kuailearning --shell /sbin/nologin kuailearning
mkdir -p /opt/kuailearning/api-releases /opt/kuailearning/releases /opt/kuailearning/backups
```

### 2. 准备 MySQL

使用 MySQL 8 创建 UTF-8 数据库与专用最小范围账号。不要使用 root 账号运行应用：

```sql
CREATE DATABASE kuailearning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kuailearning'@'127.0.0.1' IDENTIFIED BY '<强密码>';
GRANT ALL PRIVILEGES ON kuailearning.* TO 'kuailearning'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 3. 创建 `/opt/kuailearning/api.env`

至少包含：

```dotenv
APP_ENV=production
APP_HOST=127.0.0.1
APP_PORT=8001
APP_LOG_LEVEL=INFO
DATABASE_URL=mysql+asyncmy://kuailearning:<URL编码密码>@127.0.0.1:3306/kuailearning?charset=utf8mb4
AUTH_MODE=external
PUBLIC_BASE_URL=http://<内网IP或域名>:<端口>
CASDOOR_ISSUER=http://<内网Casdoor地址>
CASDOOR_CLIENT_ID=<应用ID>
CASDOOR_CLIENT_SECRET=<安全取得>
CASDOOR_REDIRECT_URI=http://<内网IP或域名>:<端口>/api/v1/auth/callback
SESSION_COOKIE_NAME=kuailearning_session
COOKIE_SECURE=false
MODEL_BASE_URL=http://<内网OpenAI兼容模型地址>/v1
MODEL_API_KEY=<安全取得>
MODEL_NAME=<模型名>
MODEL_TIMEOUT_SECONDS=180
```

如果正式使用 HTTPS，将 URL 全部切换为登记后的 HTTPS 地址，并设置 `COOKIE_SECURE=true`。
内网不能访问 DeepSeek 公网时，`MODEL_BASE_URL` 必须指向内网模型网关。

```bash
chown root:kuailearning /opt/kuailearning/api.env
chmod 640 /opt/kuailearning/api.env
```

升级备份使用 `/opt/kuailearning/mysql-backup.cnf`：

```ini
[client]
host=127.0.0.1
user=kuailearning
password=<数据库密码>
```

```bash
chown root:root /opt/kuailearning/mysql-backup.cnf
chmod 600 /opt/kuailearning/mysql-backup.cnf
```

### 4. 安装 systemd 服务

```bash
cp deployment/offline/kuailearning-api.service /etc/systemd/system/kuailearning-api.service
systemctl daemon-reload
systemctl enable kuailearning-api.service
```

## 五、内网发布版本

先核验两个包的 SHA256，再执行：

```bash
chmod +x deployment/offline/deploy-inner.sh deployment/offline/smoke-test-inner.sh

deployment/offline/deploy-inner.sh \
  /path/to/kuailearning-backend-<release>.tar.gz \
  /path/to/kuailearning-front-<release>.tar.gz \
  <release>
```

脚本不会覆盖旧 release。升级时会先备份 MySQL；新 API 健康检查失败会把 API 软链接切回
旧版本。若数据库迁移已经执行，仍需由人工根据迁移内容决定是否恢复数据库，不能盲目降级。

## 六、接入现有 Nginx

参考 `nginx-kuailearning.conf.example` 新增独立 `server`。执行前必须：

1. 用 `ss -lntp` 确认端口没有被其他服务占用；
2. 用 master process 命令行或 `nginx -V` 确认真正使用的 prefix/config；
3. 不修改已有的 80 端口 `server`；
4. `nginx -t` 成功后才 reload。

本项目此前的源码编译 Nginx 使用过：

```bash
/home/nginx/nginx-1.24.0/objs/nginx -t -p /usr/local/nginx/ -c conf/nginx.conf
/home/nginx/nginx-1.24.0/objs/nginx -s reload -p /usr/local/nginx/ -c conf/nginx.conf
```

这只是历史示例。内网 AI 必须以当前 master process 实际参数为准，不能照抄路径。

验证：

```bash
deployment/offline/smoke-test-inner.sh http://<内网访问地址>
```

最后人工完成一次：Casdoor 登录 → 新建工作区 → 生成大纲 → 退出 → 再次登录。

### 可原样交给内网 AI 的发布提示词

```text
继续按 deployment/offline/README.md 部署。先对比 backend 包中的 platform-info.txt
和 inspect-inner-server.sh 输出；不兼容就停止。核验 SHA256，不读取或回显 api.env、
mysql-backup.cnf 中的密钥。确认 8001 和计划中的 Nginx 端口未占用，再执行 deploy-inner.sh。
不要删除旧 release，不要修改已有 80 端口 server。使用当前正在运行的 Nginx master
对应的 -p/-c 参数执行 nginx -t；只有 test successful 才 reload。最后运行 smoke-test-inner.sh，
返回软链接、服务 active 状态、健康检查 HTTP 状态和前端 JS 文件名，不返回任何密钥。
```

## 七、故障边界

- wheel 不兼容：回外网使用匹配的 Linux/Python 重新构建，不在内网临时编译。
- `MODEL_API_KEY`/模型地址不可用：页面和普通 CRUD 可用，AI 生成返回 502/503/504。
- Casdoor 回调错误：核对 issuer、client ID、redirect URI，三处必须逐字一致。
- API 正常但浏览器打不开：检查 Nginx root、proxy、监听地址和防火墙。
- 数据库迁移失败：不要继续切换 release；保存日志，使用迁移前备份评估恢复。
- 删除或清理旧 release 属于单独维护任务，不在自动发布脚本中执行。
