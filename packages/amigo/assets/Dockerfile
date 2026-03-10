FROM node:22

# 1. 安装基础工具 (Git, Python3, 基础编译工具)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    build-essential \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 2. 预创建工作目录
WORKDIR /sandbox

RUN curl -fsSL https://code-server.dev/install.sh | sh

RUN mkdir -p /root/.local/share/code-server/extensions
COPY code-server-open-file-extension /root/.local/share/code-server/extensions/amigo-code-server-open-file


# 3. (可选) 预装一些常用的 npm 包，防止 AI 每次都要 npm install
RUN npm install -g typescript ts-node lodash pnpm react next tailwindcss @tailwindcss/vite tsx

ENV GIT_AUTHOR_NAME="Amigo-Bot" \
    GIT_AUTHOR_EMAIL="amigo@kbkbk.xyz" \
    GIT_COMMITTER_NAME="Amigo-Bot" \
    GIT_COMMITTER_EMAIL="amigo@kbkbk.xyz"
# 4. 关键：入口命令。
# 我们不让容器退出，也不运行具体代码，而是让它挂起等待指令。
# tail -f /dev/null 是最省资源的挂起方式。
CMD ["tail", "-f", "/dev/null"]
