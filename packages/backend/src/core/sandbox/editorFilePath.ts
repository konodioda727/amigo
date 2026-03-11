export function normalizeEditorOpenFilePath(filePath: string): string {
  const trimmed = filePath.trim();

  if (!trimmed || trimmed === "." || trimmed === "/sandbox" || trimmed === "sandbox") {
    return "/sandbox";
  }

  if (trimmed.startsWith("/sandbox/")) {
    return trimmed;
  }

  if (trimmed.startsWith("sandbox/")) {
    return `/sandbox/${trimmed.slice("sandbox/".length)}`;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  const normalized = trimmed.replace(/^\.\/+/, "").replace(/^\/+/, "");
  return `/sandbox/${normalized}`;
}
