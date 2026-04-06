import path from "node:path";
import type { ListFilesResult } from "@amigo-llm/types";

type TreeNode = {
  name: string;
  type: "file" | "directory";
  children: Map<string, TreeNode>;
};

const createDirectoryNode = (name: string): TreeNode => ({
  name,
  type: "directory",
  children: new Map(),
});

const createFileNode = (name: string): TreeNode => ({
  name,
  type: "file",
  children: new Map(),
});

const normalizeRootLabel = (directoryPath: string): string =>
  directoryPath === "." ? "." : directoryPath.replace(/\/+$/, "") || ".";

const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
  [...nodes].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

const appendNodeLines = (lines: string[], nodes: TreeNode[], prefix: string): void => {
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const label = node.type === "directory" ? `${node.name}/` : node.name;
    lines.push(`${prefix}${connector}${label}`);

    if (node.type === "directory" && node.children.size > 0) {
      appendNodeLines(
        lines,
        sortNodes(Array.from(node.children.values())),
        `${prefix}${isLast ? "    " : "│   "}`,
      );
    }
  });
};

export const buildListFilesTree = (
  directoryPath: string,
  entries: ListFilesResult["entries"],
): string => {
  const root = createDirectoryNode(normalizeRootLabel(directoryPath));

  for (const entry of entries) {
    const relativePath =
      directoryPath === "."
        ? entry.path.replace(/^\.\/?/, "")
        : path.posix.relative(directoryPath.replace(/\/+$/, "") || ".", entry.path);
    const parts = relativePath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let cursor = root;
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      const existing = cursor.children.get(part);
      if (existing) {
        cursor = existing;
        return;
      }

      const node = isLeaf
        ? entry.type === "directory"
          ? createDirectoryNode(part)
          : createFileNode(part)
        : createDirectoryNode(part);
      cursor.children.set(part, node);
      cursor = node;
    });
  }

  const lines = [`${root.name}/`];
  appendNodeLines(lines, sortNodes(Array.from(root.children.values())), "");
  return lines.join("\n");
};
