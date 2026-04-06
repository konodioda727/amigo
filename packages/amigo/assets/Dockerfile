FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
    PNPM_HOME=/root/.local/share/pnpm \
    BUN_INSTALL=/root/.bun \
    DENO_INSTALL=/root/.deno

ENV PATH="${PNPM_HOME}:${BUN_INSTALL}/bin:${DENO_INSTALL}/bin:${PATH}"

# Base system utilities for coding, dependency install, and language tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    build-essential \
    ca-certificates \
    curl \
    git \
    git-lfs \
    jq \
    openssh-client \
    python3 \
    python3-pip \
    python3-venv \
    ripgrep \
    unzip \
    xz-utils \
    zip \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /sandbox

# bun
RUN curl --http1.1 --retry 5 --retry-delay 2 -fsSL https://bun.sh/install -o /tmp/install-bun.sh \
    && bash /tmp/install-bun.sh \
    && ln -sf /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -sf /root/.bun/bin/bunx /usr/local/bin/bunx \
    && rm -f /tmp/install-bun.sh \
    && bun --version

# deno
RUN curl --http1.1 --retry 5 --retry-delay 2 -fsSL https://deno.land/install.sh -o /tmp/install-deno.sh \
    && sh /tmp/install-deno.sh \
    && ln -sf /root/.deno/bin/deno /usr/local/bin/deno \
    && rm -f /tmp/install-deno.sh \
    && deno --version

# code-server for in-sandbox editing.
RUN curl -fsSL https://code-server.dev/install.sh | sh
RUN mkdir -p /root/.local/share/code-server/extensions
COPY code-server-open-file-extension /root/.local/share/code-server/extensions/amigo-code-server-open-file

# Package managers and globally available developer tooling.
RUN corepack enable \
    && npm install -g pnpm \
    && mkdir -p "${PNPM_HOME}" \
    && pnpm config set registry "${NPM_CONFIG_REGISTRY}"

# Global JS/TS tooling available to arbitrary repos inside the sandbox.
# Important: keep language servers installed globally so Amigo LSP tools work
# even before a repo installs local devDependencies.
RUN npm install -g \
    pyright \
    ts-node \
    tsx \
    typescript \
    typescript-language-server \
    && npm cache clean --force

# Keep a small set of common frontend utilities globally available for quick bootstraps.
RUN pnpm add -g \
    @tailwindcss/vite \
    lodash \
    next \
    react \
    tailwindcss

ENV GIT_AUTHOR_NAME="Amigo-Bot" \
    GIT_AUTHOR_EMAIL="amigo@kbkbk.xyz" \
    GIT_COMMITTER_NAME="Amigo-Bot" \
    GIT_COMMITTER_EMAIL="amigo@kbkbk.xyz"

CMD ["tail", "-f", "/dev/null"]
