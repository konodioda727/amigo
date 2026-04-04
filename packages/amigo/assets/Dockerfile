FROM node:22

ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

# 1. 安装基础工具 (Git, Python3, 基础编译工具)
RUN apt-get update && apt-get install -y \
    bash \
    git \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    curl \
    ripgrep \
    unzip \
    ca-certificates \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip \
    && rm -rf /var/lib/apt/lists/*

ENV BUN_INSTALL=/root/.bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

RUN curl --http1.1 --retry 5 --retry-delay 2 -fsSL https://bun.sh/install -o /tmp/install-bun.sh \
    && bash /tmp/install-bun.sh \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx \
    && rm -f /tmp/install-bun.sh \
    && bun --version

ENV DENO_INSTALL=/root/.deno
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

RUN curl --http1.1 --retry 5 --retry-delay 2 -fsSL https://deno.land/install.sh -o /tmp/install-deno.sh \
    && sh /tmp/install-deno.sh \
    && ln -sf /root/.deno/bin/deno /usr/local/bin/deno \
    && rm -f /tmp/install-deno.sh \
    && deno --version

# 2. 预创建工作目录
WORKDIR /sandbox

RUN curl -fsSL https://code-server.dev/install.sh | sh

RUN mkdir -p /root/.local/share/code-server/extensions
COPY code-server-open-file-extension /root/.local/share/code-server/extensions/amigo-code-server-open-file


# 3. 配置 npm/pnpm 镜像，并仅用 npm 安装 pnpm；其他常用 JS 工具统一通过 pnpm 安装
RUN npm install -g pnpm \
    && mkdir -p "${PNPM_HOME}" \
    && pnpm config set registry "${NPM_CONFIG_REGISTRY}" \
    && pnpm add -g typescript ts-node pyright lodash react next tailwindcss @tailwindcss/vite tsx

ENV GIT_AUTHOR_NAME="Amigo-Bot" \
    GIT_AUTHOR_EMAIL="amigo@kbkbk.xyz" \
    GIT_COMMITTER_NAME="Amigo-Bot" \
    GIT_COMMITTER_EMAIL="amigo@kbkbk.xyz"
# 4. 关键：入口命令。
# 我们不让容器退出，也不运行具体代码，而是让它挂起等待指令。
# tail -f /dev/null 是最省资源的挂起方式。
CMD ["tail", "-f", "/dev/null"]
