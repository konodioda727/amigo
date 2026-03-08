"use strict";

const fs = require("node:fs/promises");
const vscode = require("vscode");

const COMMAND_FILE_PATH = "/tmp/amigo/open-file.json";
const POLL_INTERVAL_MS = 500;

let lastNonce = "";

async function readCommand() {
  try {
    const raw = await fs.readFile(COMMAND_FILE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    console.warn("[amigo-code-server-open-file] Failed to read command:", error);
    return null;
  }
}

async function clearCommandFile() {
  try {
    await fs.unlink(COMMAND_FILE_PATH);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }
    console.warn("[amigo-code-server-open-file] Failed to clear command file:", error);
  }
}

function toPosition(line, column) {
  return new vscode.Position(Math.max(0, (line || 1) - 1), Math.max(0, (column || 1) - 1));
}

async function openRequestedFile(command) {
  if (!command || typeof command.path !== "string" || !command.path) {
    return;
  }

  const uri = vscode.Uri.file(command.path);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: true,
    preserveFocus: false,
  });

  if (typeof command.line === "number") {
    const position = toPosition(command.line, command.column);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
}

function activate(context) {
  const timer = setInterval(async () => {
    const command = await readCommand();
    if (!command || typeof command.nonce !== "string" || !command.nonce) {
      return;
    }

    if (command.nonce === lastNonce) {
      return;
    }

    try {
      await openRequestedFile(command);
      lastNonce = command.nonce;
      await clearCommandFile();
    } catch (error) {
      console.warn("[amigo-code-server-open-file] Failed to open requested file:", error);
    }
  }, POLL_INTERVAL_MS);

  context.subscriptions.push({
    dispose() {
      clearInterval(timer);
    },
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
