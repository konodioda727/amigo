# Amigo Code-Server Open File Bridge

This extension polls `/tmp/amigo/open-file.json` inside the sandbox container and opens the
requested file in `code-server`.

## Install Into The Sandbox Image

Copy this directory into the code-server extensions directory inside the image:

```dockerfile
COPY packages/server/assets/code-server-open-file-extension \
  /root/.local/share/code-server/extensions/amigo-code-server-open-file
```

If your image runs as a non-root user, copy it into that user's code-server extensions directory
instead.

## Command File Format

The server writes commands like this:

```json
{
  "nonce": "unique-command-id",
  "path": "/sandbox/quickSort.js",
  "line": 24,
  "column": 1
}
```

The extension removes the command file after a successful open.
