# Amigo 生产部署（Caddy + systemd + MySQL）

这套部署文档对应当前架构：

- 反向代理: Caddy
- 进程托管: systemd
- 运行时: Bun
- 数据库: MySQL 8+
- sandbox: Docker + `runsc`

## 目录约定

推荐目录：

```text
/var/www/amigo/
  frontend/   # 前端静态产物
  backend/    # 后端 bundle 与 sandbox assets
  shared/     # 不随发布覆盖的环境变量文件
  cache/      # 运行时缓存与 sandbox 资产
```

其中：

- 前端目录: `/var/www/amigo/frontend`
- 后端目录: `/var/www/amigo/backend`
- 环境变量文件: `/var/www/amigo/shared/amigo.env`
- 运行时目录: `/var/www/amigo/cache`

## 部署前置要求

至少准备：

- `git`
- `rsync`
- `curl`
- `bun`
- `docker`
- `caddy`
- `mysql-server`

如果要启用 sandbox，再准备：

- `runsc`
- Docker 已注册 `runsc` runtime

## 数据库准备

应用启动时会自动跑 migration，但数据库本身需要先存在。

示例：

```sql
CREATE DATABASE amigo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'amigo'@'localhost' IDENTIFIED BY 'replace_me';
GRANT ALL PRIVILEGES ON amigo.* TO 'amigo'@'localhost';
FLUSH PRIVILEGES;
```

## 环境变量文件

服务器上创建：

```bash
sudo mkdir -p /var/www/amigo/frontend /var/www/amigo/backend /var/www/amigo/shared /var/www/amigo/cache
sudo cp /path/to/repo/ops/deploy/amigo.env.example /var/www/amigo/shared/amigo.env
sudo chown -R ubuntu:ubuntu /var/www/amigo
```

然后编辑 `/var/www/amigo/shared/amigo.env`。

至少需要这些项：

```env
MODEL_API_KEY=your_api_key
MODEL_NAME=qwen3-coder
MODEL_BASE_URL=https://openrouter.ai/api/v1

AMIGO_PORT=10013
AMIGO_CACHE_PATH=/var/www/amigo/cache
AMIGO_SANDBOX_IMAGE=ai_sandbox
AMIGO_SANDBOX_RUNTIME=runsc

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=amigo
MYSQL_PASSWORD=replace_me
MYSQL_DATABASE=amigo

BETTER_AUTH_SECRET=replace_with_a_long_random_secret
BETTER_AUTH_BASE_URL=https://amigo.example.com
BETTER_AUTH_TRUSTED_ORIGINS=https://amigo.example.com
```

参考：

- [ops/deploy/amigo.env.example](/Users/lawkaiqing/code/amigo/ops/deploy/amigo.env.example)

## systemd 配置

服务文件参考：

- [ops/systemd/amigo.service](/Users/lawkaiqing/code/amigo/ops/systemd/amigo.service)

首次安装：

```bash
sudo cp /path/to/repo/ops/systemd/amigo.service /etc/systemd/system/amigo.service
sudo systemctl daemon-reload
sudo systemctl enable amigo
```

当前样板默认：

- `User=ubuntu`
- `Group=ubuntu`
- `WorkingDirectory=/var/www/amigo/backend`
- `EnvironmentFile=/var/www/amigo/shared/amigo.env`

如果这些路径和用户不一致，先改 service 文件。

安装后启动：

```bash
sudo systemctl restart amigo
sudo systemctl status amigo
journalctl -u amigo -n 200 --no-pager
```

## Caddy 配置

基础站点参考：

- [ops/caddy/Caddyfile.example](/Users/lawkaiqing/code/amigo/ops/caddy/Caddyfile.example)

核心思路：

- `/api/*`、`/ws*` 反代到 `127.0.0.1:10013`
- 其余请求由 Caddy 从 `/var/www/amigo/frontend` 提供静态文件
- preview/editor 都走同域或 preview 子域代理

## GitHub Actions secrets

GitHub 仓库里至少配置：

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_PRIVATE_KEY`

部署流水线：

- [deploy.yml](/Users/lawkaiqing/code/amigo/.github/workflows/deploy.yml)

## 部署产物

默认部署脚本会上传：

- `packages/amigo/dist/web` -> `/var/www/amigo/frontend`
- `packages/amigo/dist/server` -> `/var/www/amigo/backend/dist/server`
- `packages/amigo/dist/data` -> `/var/www/amigo/backend/dist/data`
- `packages/amigo/assets` -> `/var/www/amigo/backend/assets`

## 首次上线步骤

1. 安装 Bun、Docker、Caddy、MySQL、runsc
2. 创建 `/var/www/amigo/...` 目录
3. 创建 MySQL 数据库与账号
4. 准备 `/var/www/amigo/shared/amigo.env`
5. 安装 systemd 服务
6. 安装 Caddy 配置
7. 上传构建产物
8. 执行 `systemctl restart amigo`
9. 用 `journalctl -u amigo` 检查 migration 和启动日志

## 关键点

- MySQL 是完整应用必需项
- 应用启动时会自动跑 migration
- 如果 `MYSQL_*` 缺失，服务会直接启动失败
- `cachePath` 只用于运行时缓存和 sandbox 资产，不承载业务真相
