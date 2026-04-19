import { conversationRepository } from "@/core/conversation";
import {
  extractCompletedExecutionTaskPayload,
  formatCompletedExecutionTaskPayload,
} from "@/core/conversation/execution/taskExecutionResult";

const DEPENDENCY_RESULT_CHAR_LIMIT = 3000;

const trimDependencyResult = (content: string) => {
  const normalized = content.trim();
  if (normalized.length <= DEPENDENCY_RESULT_CHAR_LIMIT) {
    return normalized;
  }

  return `${normalized.slice(0, DEPENDENCY_RESULT_CHAR_LIMIT)}\n...（依赖任务结果过长，已截断）`;
};
export const buildDependencyResultContext = ({
  dependencies,
  parentConversation,
  loadConversation,
}: {
  dependencies: string[];
  parentConversation: {
    memory: {
      executionTasks: Record<
        string,
        {
          executionTaskId?: string;
        }
      >;
    };
  };
  loadConversation?: (executionTaskId: string) => {
    memory: {
      messages: import("@amigo-llm/types").ChatMessage[];
      lastMessage?: import("@amigo-llm/types").ChatMessage;
    };
  } | null;
}) => {
  if (dependencies.length === 0) {
    return "";
  }

  const resolveConversation =
    loadConversation || ((executionTaskId: string) => conversationRepository.load(executionTaskId));

  const sections = dependencies.map((dependencyId) => {
    const dependencyStatus = parentConversation.memory.executionTasks[dependencyId];

    if (!dependencyStatus?.executionTaskId) {
      return `### Task ${dependencyId}\n未找到该依赖任务的 finishPhase 内容。`;
    }

    const dependencyConversation = resolveConversation(dependencyStatus.executionTaskId);
    if (!dependencyConversation) {
      return `### Task ${dependencyId}\n未能加载该依赖任务的 finishPhase 内容。`;
    }

    const dependencyPayload = extractCompletedExecutionTaskPayload(dependencyConversation);
    const dependencyResult = dependencyPayload
      ? formatCompletedExecutionTaskPayload(dependencyPayload)
      : "";
    if (!dependencyResult.trim()) {
      return `### Task ${dependencyId}\n未提取到有效的 finishPhase 内容。`;
    }

    return `### Task ${dependencyId}\n${trimDependencyResult(dependencyResult)}`;
  });

  return sections.join("\n\n");
};
