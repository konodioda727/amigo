# Amigo 生产部署（Caddy）

这套方案按一台 Linux 服务器部署，默认假设：

- 系统：Ubuntu 22.04 / 24.04 或兼容 Debian 的发行版
- 反向代理：Caddy
- 进程托管：systemd
- sandbox：Docker + `runsc`（gVisor）
- 部署触发：GitHub Actions push 到 `main`

## 目录约定

你的这台机器建议直接固定成：

```text
/var/www/amigo/
  frontend/   # 前端静态产物
  backend/    # 后端 bundle 与 sandbox assets
  shared/     # 不随发布覆盖的 env
  cache/      # 运行时持久化
```

其中：

- 前端目录：`/var/www/amigo/frontend`
- 后端目录：`/var/www/amigo/backend`
- 环境变量文件：`/var/www/amigo/shared/amigo.env`
- 持久化缓存目录：`/var/www/amigo/cache`

## 服务器前置准备

### 1. 基础软件

至少准备：

- `git`
- `rsync`
- `curl`
- `bun`
- `docker`
- `caddy`

如果你要启用 sandbox，Linux 生产建议再装：

- `runsc`
- Docker 已注册 `runsc` runtime

验证方式：

```bash
runsc --version
docker info | grep -A5 Runtimes
docker run --rm --runtime=runsc hello-world
```

### 2. deploy 用户权限

你现在的服务器登录用户是 `ubuntu@101.36.117.121`，所以先按 `ubuntu` 用户落地最省事。它至少要具备：

- 对 `/var/www/amigo` 的读写权限
- 执行 `systemctl restart amigo` 的权限
- Docker 使用权限

最常见做法：

- 把 `ubuntu` 用户加入 `docker` 组
- 给 `ubuntu` 用户配置 `sudo systemctl restart amigo` 免密

### 3. 环境变量文件

服务器上创建：

```bash
sudo mkdir -p /var/www/amigo/frontend /var/www/amigo/backend /var/www/amigo/shared /var/www/amigo/cache
sudo cp /path/to/repo/ops/deploy/amigo.env.example /var/www/amigo/shared/amigo.env
sudo chown -R ubuntu:ubuntu /var/www/amigo
```

然后编辑 `/var/www/amigo/shared/amigo.env`。

至少需要：

```env
MODEL_API_KEY=your_api_key
MODEL_NAME=qwen3-coder
MODEL_BASE_URL=https://openrouter.ai/api/v1
AMIGO_PORT=10013
AMIGO_CACHE_PATH=/var/www/amigo/cache
AMIGO_SANDBOX_IMAGE=ai_sandbox
AMIGO_SANDBOX_RUNTIME=runsc
```

如果不启用 Penpot，就不要填 `PENPOT_*`。

## Caddy 配置

基础站点可以直接参考：

- [ops/caddy/Caddyfile.example](/Users/lawkaiqing/code/amigo/ops/caddy/Caddyfile.example)

核心思路是：

- `/api/*` 和 `/ws` 反代到 Bun 服务 `127.0.0.1:10013`
- 其余请求由 Caddy 直接从 `/var/www/amigo/frontend` 提供静态文件

当前样板已经按你的域名写成：

- 主站：`amig.kbkbk.xyz`
- preview 通配：`*.preview.amig.kbkbk.xyz`

如果你要启用 hosted preview，再额外准备：

- `preview.amig.kbkbk.xyz`
- `*.preview.amig.kbkbk.xyz`

这两个 DNS 记录都指向同一台机器，并保留 `*.preview.amig.kbkbk.xyz` 这段 Caddy 配置。

## systemd 配置

服务文件参考：

- [ops/systemd/amigo.service](/Users/lawkaiqing/code/amigo/ops/systemd/amigo.service)

首次安装：

```bash
sudo cp /path/to/repo/ops/systemd/amigo.service /etc/systemd/system/amigo.service
sudo systemctl daemon-reload
sudo systemctl enable amigo
```

注意把服务文件里的 `User`、`Group`、`WorkingDirectory` 改成你自己的真实路径。

当前样板已经按 `ubuntu` 用户写好。

## GitHub Actions secrets

在 GitHub 仓库里配置：

- `DEPLOY_HOST`: `101.36.117.121`
- `DEPLOY_PORT`: SSH 端口，默认 `22`
- `DEPLOY_USER`: `ubuntu`
- `DEPLOY_PATH`: 固定填 `/var/www/amigo`
- `DEPLOY_SSH_PRIVATE_KEY`: 部署私钥

注意：

- 你现在手上是密码登录，适合首次手工初始化
- GitHub Actions 不建议走密码，应该单独生成一把部署用 SSH key，把公钥加到服务器 `~/.ssh/authorized_keys`

流水线文件在：

- [deploy.yml](/Users/lawkaiqing/code/amigo/.github/workflows/deploy.yml)

行为是：

1. GitHub Actions 安装依赖并执行 `bun run build`
2. 上传 `packages/amigo/dist/web` 到 `/var/www/amigo/frontend`
3. 上传 `packages/amigo/dist/server` 到 `/var/www/amigo/backend/dist/server`
4. 上传 `packages/amigo/dist/data` 到 `/var/www/amigo/backend/dist/data`
5. 上传 `packages/amigo/assets` 到 `/var/www/amigo/backend/assets`
6. 登录服务器执行 `/var/www/amigo/backend/deploy-amigo.sh`
7. 服务器端重建 sandbox 镜像并重启 `systemd`

如果你想先手工上传一次，不走 GitHub Actions，可以直接用：

- [upload-amigo-artifacts.sh](/Users/lawkaiqing/code/amigo/ops/deploy/upload-amigo-artifacts.sh)

默认已经写死成你现在这台机器：

- `REMOTE_HOST=101.36.117.121`
- `REMOTE_USER=ubuntu`
- `REMOTE_PATH=/var/www/amigo`

本地执行：

```bash
bash ./ops/deploy/upload-amigo-artifacts.sh
```

它会：

1. 本地执行 `bun install --frozen-lockfile`
2. 本地执行 `bun run --filter @amigo-llm/amigo build`
3. 上传前端 dist、后端 dist、运行时 data、sandbox assets、deploy 脚本
4. 顺带上传 `amigo.service` 和 `Caddyfile`

如果你只想上传产物，不想顺手上传 Caddy/systemd 样板：

```bash
UPLOAD_CONFIGS=0 bash ./ops/deploy/upload-amigo-artifacts.sh
```

## 首次上线步骤

1. 先在服务器手动装好 Bun、Docker、Caddy、runsc。
2. 创建 `/var/www/amigo/frontend`、`/var/www/amigo/backend`、`/var/www/amigo/shared`、`/var/www/amigo/cache`。
3. 准备 `/var/www/amigo/shared/amigo.env`。
4. 安装 systemd 服务。
5. 安装 Caddy 配置并 reload。
6. 手动执行一次部署脚本确认环境无误：

```bash
AMIGO_DEPLOY_ROOT=/var/www/amigo bash /var/www/amigo/backend/deploy-amigo.sh
```

7. 确认服务正常后，再依赖 GitHub Actions 自动部署。

你这台机器第一次建议先手工执行这些命令：

```bash
ssh ubuntu@101.36.117.121
sudo mkdir -p /var/www/amigo/frontend /var/www/amigo/backend /var/www/amigo/shared /var/www/amigo/cache
sudo chown -R ubuntu:ubuntu /var/www/amigo
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.$(date +%F-%H%M%S)
```

然后把下面两个文件分别放上去：

- `ops/systemd/amigo.service` -> `/etc/systemd/system/amigo.service`
- `ops/caddy/Caddyfile.example` -> `/etc/caddy/Caddyfile`

再执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable amigo
sudo systemctl restart caddy
```

## Sandbox 准备项

Amigo 在 Linux 下默认使用 `runsc`。因此你至少要保证：

- Docker 正常运行
- `runsc` 已安装
- Docker 已注册 `runsc`
- 服务器能执行 `docker build`
- `/var/www/amigo/backend/assets/Dockerfile` 存在

部署脚本会在每次部署时自动执行：

```bash
docker build -t ai_sandbox /var/www/amigo/backend/assets
```

所以你不用手动维护 `ai_sandbox`，但要保证构建依赖和网络可用。

如果你暂时不想启用 gVisor，可以在 `/var/www/amigo/shared/amigo.env` 里改成：

```env
AMIGO_SANDBOX_RUNTIME=runc
```

## Penpot 准备项

如果你要启用 Penpot，同步链路依赖：

- 一个可访问的 Penpot 实例
- Penpot 个人 access token
- 目标 team id
- 目标 project id

Amigo 侧需要配置：

```env
PENPOT_BASE_URL=https://penpot.example.com
PENPOT_ACCESS_TOKEN=your_penpot_token
PENPOT_TEAM_ID=team_id
PENPOT_PROJECT_ID=project_id
```

Penpot 本身建议独立部署，不要和 Amigo 强耦合到同一个进程里。最稳妥的方式是：

1. 单独给 Penpot 一个二级域名，例如 `penpot.example.com`
2. 按官方 Docker Compose 方案部署
3. 由 Caddy 给 Penpot 单独签 HTTPS
4. 在 Penpot 后台生成 access token，再回填到 `amigo.env`

如果你只是想先把 Amigo 上线，Penpot 完全可以后补。

## 官方参考

- Penpot Docker 自托管文档：
  https://help.penpot.app/technical-guide/getting-started/docker/
- Penpot access token 文档：
  https://help.penpot.app/technical-guide/integration/
- gVisor `runsc` 安装文档：
  https://gvisor.dev/docs/user_guide/install/
- gVisor Docker quick start：
  https://gvisor.dev/docs/user_guide/quick_start/docker/
