import type { ReadRulesResult } from "@amigo-llm/types";
import type { RuleProvider } from "@/core/rules";
import { createTool } from "./base";
import { createToolResult } from "./result";

export const READ_RULES_TOOL_NAME = "readRules";

const CONTINUATION_RULE_CONTENT_LIMIT = 4_000;
const CONTINUATION_TOTAL_CONTENT_LIMIT = 12_000;

const truncateContent = (content: string, maxChars: number): string => {
  if (content.length <= maxChars) {
    return content;
  }

  const headChars = Math.max(0, Math.floor(maxChars * 0.7));
  const tailChars = Math.max(0, maxChars - headChars);
  const omittedChars = content.length - headChars - tailChars;
  return [
    content.slice(0, headChars),
    `\n...（已截断，中间省略 ${omittedChars} 字符）...\n`,
    content.slice(content.length - tailChars),
  ].join("");
};

const buildReadRulesContinuationSummary = (ids: string[]): string => {
  const normalizedIds = ids.map((id) => id.trim()).filter(Boolean);
  if (normalizedIds.length === 0) {
    return "【已阅读规则】";
  }

  const preview =
    normalizedIds.length <= 3
      ? normalizedIds.join(", ")
      : `${normalizedIds.slice(0, 3).join(", ")} 等 ${normalizedIds.length} 条规则`;
  return `【已阅读规则 ${preview}】`;
};

const buildRuleFailure = (id: string, message: string): ReadRulesResult["documents"][number] => ({
  success: false,
  id,
  content: "",
  message,
});

const buildContinuationResult = (
  transportResult: ReadRulesResult,
  summaryMessage: string,
): ReadRulesResult => {
  let remainingBudget = CONTINUATION_TOTAL_CONTENT_LIMIT;
  const documents = transportResult.documents.map((document) => {
    if (!document.success || !document.content.trim()) {
      return { ...document };
    }

    const ruleBudget = Math.max(0, Math.min(CONTINUATION_RULE_CONTENT_LIMIT, remainingBudget));
    if (ruleBudget <= 0) {
      return {
        ...document,
        content: "",
        message: `${document.message}（正文已在 continuation 中省略）`,
      };
    }

    const truncatedContent = truncateContent(document.content, ruleBudget);
    remainingBudget = Math.max(0, remainingBudget - truncatedContent.length);
    return {
      ...document,
      content: truncatedContent,
      message:
        truncatedContent === document.content
          ? document.message
          : `${document.message}（正文已截断）`,
    };
  });

  return {
    success: transportResult.success,
    ids: [...transportResult.ids],
    documents,
    message: summaryMessage,
  };
};

export const createReadRulesTool = (provider: RuleProvider) =>
  createTool({
    name: READ_RULES_TOOL_NAME,
    description:
      "读取宿主应用环境中的规则文档。这些规则文档位于 sandbox 外部，不能通过 readFile 访问。",
    whenToUse:
      "当系统提示词引用了某个规则 ID，且你需要查看该规则的完整正文时使用。优先按 ID 精准读取，不要猜测宿主环境中的文件路径。",
    params: [
      {
        name: "ids",
        optional: false,
        type: "array",
        description: "要读取的规则 ID 列表",
        params: [
          {
            name: "id",
            optional: false,
            description: "单个规则 ID，例如 coding",
          },
        ],
      },
    ],
    async invoke({ params }) {
      const rawIds = Array.isArray(params.ids) ? params.ids : [];
      const ids = rawIds.map((id) => String(id || "").trim()).filter(Boolean);
      if (ids.length === 0) {
        const message = "规则 ID 列表不能为空";
        return createToolResult(
          {
            success: false,
            ids: [],
            documents: [],
            message,
          } satisfies ReadRulesResult,
          {
            transportMessage: message,
            continuationSummary: message,
          },
        );
      }

      const documents: ReadRulesResult["documents"] = [];
      for (const id of ids) {
        try {
          const rule = await provider.getRule(id);
          if (!rule) {
            documents.push(buildRuleFailure(id, `未找到规则: ${id}`));
            continue;
          }

          documents.push({
            success: true,
            id: rule.id,
            title: rule.title,
            whenToRead: rule.whenToRead,
            content: rule.content,
            message: `成功读取规则 ${rule.id}`,
          });
        } catch (error) {
          documents.push(
            buildRuleFailure(
              id,
              `读取规则失败: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      }

      const successCount = documents.filter((document) => document.success).length;
      const failureCount = documents.length - successCount;
      const summaryMessage =
        failureCount === 0
          ? `成功读取 ${successCount} 条规则`
          : `读取完成：成功 ${successCount} 条，失败 ${failureCount} 条`;
      const transportResult = {
        success: failureCount === 0,
        ids,
        documents,
        message: summaryMessage,
      } satisfies ReadRulesResult;

      return createToolResult(transportResult, {
        transportMessage: summaryMessage,
        continuationSummary: buildReadRulesContinuationSummary(ids),
        continuationResult: buildContinuationResult(transportResult, summaryMessage),
      });
    },
  });
