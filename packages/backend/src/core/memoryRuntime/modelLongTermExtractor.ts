import type { AmigoLlm, AmigoModelMessage } from "../model";
import type { LongTermMemoryCandidate } from "./types";

const DEFAULT_SYSTEM_PROMPT = `
你是一个长期记忆提取器。你的任务是判断当前这条用户消息里，是否存在值得跨会话保存的稳定记忆。

只提取这些信息：
1. 用户长期偏好
2. 用户长期约束或协作偏好

不要提取这些信息：
1. 一次性问题、临时任务、当前轮目标
2. assistant 自己提出但未被用户确认的建议
3. 很可能只在当前会话有效的细节
4. 不确定、推断性的结论
5. 当前任务或当前轮的执行协议、流程要求、文档生成顺序
6. 与 taskdoc / requirements / design / taskList 的创建、修改、增量更新方式有关的要求
7. “先问再做”“分步生成”“只改一小段”这类只针对当前任务推进方式的说明
8. 用户在追问、质疑、引用 assistant 过去表现，或分析为什么模型没做到某事

如果没有值得保存的内容，返回空数组。

输出必须是 JSON，对象格式固定为：
{"candidates":[{"scope":"user","kind":"preference"|"constraint","topic":"snake_case_topic","text":"简洁中文陈述","confidence":0.0}]}

要求：
1. 最多返回 3 条 candidate
2. confidence 取 0 到 1 之间的小数
3. topic 使用稳定的 snake_case
4. 只能输出 JSON，不要输出解释、注释或 markdown 代码块
5. 如果用户明确表达了“以后 / 每次 / 默认 / 记住 / 一律 / 必须 / 不要”这类长期偏好或约束，应优先提取
6. 只有当偏好在未来多个独立会话中大概率仍然成立时，才允许提取
7. 如果内容依赖“当前任务 / 当前文档 / 这次修改 / 本轮流程”，即使语气很强，也必须返回空数组
8. confidence 标准：
   - 0.9-1.0：用户明确表达了跨会话稳定偏好或长期约束，且明显不依赖当前任务
   - 0.8-0.89：基本明确的长期偏好，但表述略简短
   - 0.5-0.79：可能只是当前会话/当前任务要求，默认不要返回
   - 0-0.49：猜测、转述、抱怨、临时要求，绝对不要返回
`.trim();

const readJsonPayload = (text: string): unknown => {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return JSON.parse(trimmed);
};

const normalizeTopic = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const toCandidate = (value: unknown): LongTermMemoryCandidate | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const scope =
    typeof (value as { scope?: unknown }).scope === "string"
      ? (value as { scope: string }).scope.trim()
      : "";
  const kind =
    typeof (value as { kind?: unknown }).kind === "string"
      ? (value as { kind: string }).kind.trim()
      : "";
  const topic =
    typeof (value as { topic?: unknown }).topic === "string"
      ? normalizeTopic((value as { topic: string }).topic)
      : "";
  const text =
    typeof (value as { text?: unknown }).text === "string"
      ? (value as { text: string }).text.trim()
      : "";
  const confidenceRaw = (value as { confidence?: unknown }).confidence;
  const confidence =
    typeof confidenceRaw === "number"
      ? confidenceRaw
      : Number.parseFloat(String(confidenceRaw ?? ""));

  if (scope !== "user" || !["preference", "constraint"].includes(kind)) {
    return null;
  }
  if (!topic || !text) {
    return null;
  }
  if (!Number.isFinite(confidence)) {
    return null;
  }

  return {
    scope: scope as LongTermMemoryCandidate["scope"],
    kind: kind as LongTermMemoryCandidate["kind"],
    topic,
    text,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
};

export const extractLongTermMemoryCandidatesWithModel = async (params: {
  llm: AmigoLlm;
  userText: string;
  systemPrompt?: string;
}): Promise<LongTermMemoryCandidate[]> => {
  const messages: AmigoModelMessage[] = [
    {
      role: "system",
      content: params.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `Current user message:\n${params.userText.trim()}`,
    },
  ];

  const stream = await params.llm.stream(messages);
  let text = "";
  for await (const event of stream) {
    if (event.type === "text_delta" && event.text) {
      text += event.text;
    }
  }

  const parsed = readJsonPayload(text) as { candidates?: unknown } | null;
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const candidates = rawCandidates
    .map((candidate) => toCandidate(candidate))
    .filter((candidate): candidate is LongTermMemoryCandidate => !!candidate)
    .slice(0, 3);

  return candidates;
};
