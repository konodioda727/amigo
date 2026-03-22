import { createHash } from "node:crypto";

const SANDBOX_CONTAINER_NAME_PREFIX = "amigo-sandbox-";
const MAX_TASK_SLUG_LENGTH = 48;

export function getSandboxContainerName(taskId: string): string {
  const normalizedTaskId = taskId.trim();
  const slug = normalizedTaskId
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, MAX_TASK_SLUG_LENGTH)
    .replace(/[.-]+$/g, "");
  const fallbackSlug = slug || "task";
  const hash = createHash("sha1")
    .update(normalizedTaskId || taskId)
    .digest("hex")
    .slice(0, 10);

  return `${SANDBOX_CONTAINER_NAME_PREFIX}${fallbackSlug}-${hash}`;
}
