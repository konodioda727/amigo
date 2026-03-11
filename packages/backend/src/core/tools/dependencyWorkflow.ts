import type { ToolExecutionContext } from "@amigo-llm/types/src/tool";
import {
  enqueueConversationContinuation,
  flushConversationContinuationsIfIdle,
  taskOrchestrator,
} from "@/core/conversation";
import { conversationRepository } from "@/core/conversation/ConversationRepository";
import type { DependencyInstallStatus, Sandbox } from "@/core/sandbox";
import { logger } from "@/utils/logger";
import { type AsyncToolJobInfo, asyncToolJobRegistry } from "./base/asyncJobRegistry";

export function getDependencyInstallJobKey(taskId: string, workingDir: string): string {
  return `installDependencies:${taskId}:${workingDir}`;
}

function getDeferredToolJobKey(
  conversationTaskId: string,
  toolName: string,
  workingDir: string,
  paramsSignature: string,
): string {
  return `deferred:${conversationTaskId}:${toolName}:${workingDir}:${paramsSignature}`;
}

function applyDependencyContinuationPrompt(
  conversation: {
    memory: {
      addMessage: (message: {
        role: "system";
        content: string;
        type: "system";
        partial: false;
      }) => void;
    };
    userInput: string;
    isAborted: boolean;
  },
  prompt: string,
): void {
  conversation.isAborted = false;
  conversation.memory.addMessage({
    role: "system",
    content: prompt,
    type: "system",
    partial: false,
  });
  conversation.userInput = "__amigo_internal_dependency_continuation__";
}

function resumeConversation(taskId: string, prompt: string, reason: string): void {
  resumeConversationWithMode(taskId, prompt, reason, true);
}

function resumeConversationWithMode(
  taskId: string,
  prompt: string,
  reason: string,
  allowActiveLoopInjection: boolean,
): void {
  const conversation = conversationRepository.load(taskId);
  if (!conversation) {
    logger.warn(`[DependencyWorkflow] 未找到会话，跳过续跑 task=${taskId} reason=${reason}`);
    return;
  }

  if (["completed", "aborted"].includes(conversation.status)) {
    logger.info(
      `[DependencyWorkflow] 会话已结束，跳过续跑 task=${taskId} status=${conversation.status} reason=${reason}`,
    );
    return;
  }

  enqueueConversationContinuation({
    conversation,
    reason,
    run: async (currentConversation) => {
      applyDependencyContinuationPrompt(currentConversation, prompt);
      const executor = taskOrchestrator.getExecutor(currentConversation.id);
      await executor.execute(currentConversation);
    },
    injectBeforeNextTurn: allowActiveLoopInjection
      ? (currentConversation) => {
          applyDependencyContinuationPrompt(currentConversation, prompt);
        }
      : undefined,
  });
  void flushConversationContinuationsIfIdle(conversation);
}

export function startDependencyInstallJob(params: {
  sandbox: Sandbox;
  sandboxTaskId: string;
  workingDir: string;
  installCommand: string;
}): {
  installStatus: DependencyInstallStatus;
  job: AsyncToolJobInfo | null;
  started: boolean;
} {
  const installStatus = params.sandbox.getDependencyInstallStatus(params.workingDir);
  if (installStatus.status === "success" || installStatus.status === "not_required") {
    return {
      installStatus,
      job: null,
      started: false,
    };
  }

  const { job, started } = asyncToolJobRegistry.startOrJoin({
    key: getDependencyInstallJobKey(params.sandboxTaskId, params.workingDir),
    toolName: "installDependencies",
    taskId: params.sandboxTaskId,
    run: async () => {
      await params.sandbox.installDependenciesWithCommand({
        workingDir: params.workingDir,
        installCommand: params.installCommand,
      });
    },
  });

  return {
    installStatus: params.sandbox.getDependencyInstallStatus(params.workingDir),
    job,
    started,
  };
}

export function queueToolRetryAfterDependencies(params: {
  context: ToolExecutionContext;
  sandbox: Sandbox;
  sandboxTaskId: string;
  toolName: string;
  workingDir: string;
  toolParams: Record<string, unknown>;
  successPrompt: string;
  failurePrompt: (errorMessage: string) => string;
}): { job: AsyncToolJobInfo; started: boolean } {
  const paramsSignature = JSON.stringify(params.toolParams);
  const { job, started } = asyncToolJobRegistry.startOrJoin({
    key: getDeferredToolJobKey(
      params.context.taskId,
      params.toolName,
      params.workingDir,
      paramsSignature,
    ),
    toolName: params.toolName,
    taskId: params.context.taskId,
    run: async () => {
      const dependencyPromise = asyncToolJobRegistry.getRunningPromise(
        getDependencyInstallJobKey(params.sandboxTaskId, params.workingDir),
      );
      if (!dependencyPromise) {
        resumeConversation(
          params.context.taskId,
          params.failurePrompt("未找到运行中的依赖安装任务"),
          `${params.toolName} 缺少可等待的依赖安装任务`,
        );
        return;
      }

      await dependencyPromise;
      const latestStatus = params.sandbox.getDependencyInstallStatus(params.workingDir);
      if (latestStatus.status === "success" || latestStatus.status === "not_required") {
        resumeConversation(
          params.context.taskId,
          params.successPrompt,
          `${params.toolName} 等待依赖安装完成后自动续跑`,
        );
        return;
      }

      resumeConversation(
        params.context.taskId,
        params.failurePrompt(latestStatus.error || "依赖安装未成功完成"),
        `${params.toolName} 因依赖安装失败需要人工处理`,
      );
    },
  });

  return { job, started };
}

export function queueDependencyCompletionNotification(params: {
  context: ToolExecutionContext;
  sandbox: Sandbox;
  sandboxTaskId: string;
  workingDir: string;
  installCommand: string;
}): { job: AsyncToolJobInfo; started: boolean } {
  const { job, started } = asyncToolJobRegistry.startOrJoin({
    key: getDeferredToolJobKey(
      params.context.taskId,
      "installDependenciesNotification",
      params.workingDir,
      JSON.stringify({
        workingDir: params.workingDir,
        installCommand: params.installCommand,
      }),
    ),
    toolName: "installDependenciesNotification",
    taskId: params.context.taskId,
    run: async () => {
      const dependencyPromise = asyncToolJobRegistry.getRunningPromise(
        getDependencyInstallJobKey(params.sandboxTaskId, params.workingDir),
      );
      if (!dependencyPromise) {
        resumeConversationWithMode(
          params.context.taskId,
          "依赖安装后台任务失败。未找到运行中的依赖安装任务。请直接告知用户安装状态异常，并提示他们查看日志；如果当前没有其他明确可执行动作，不要再调用工具。",
          "installDependenciesNotification 缺少可等待的依赖安装任务",
          false,
        );
        return;
      }

      await dependencyPromise;
      const latestStatus = params.sandbox.getDependencyInstallStatus(params.workingDir);
      if (latestStatus.status === "success" || latestStatus.status === "not_required") {
        resumeConversationWithMode(
          params.context.taskId,
          "依赖安装后台任务已完成。只有在当前没有其他等待自动继续的执行动作时，才直接告知用户依赖安装已经完成，并说明后续可以继续执行检查、构建或启动 dev server；如果此时上下文里已经有等待恢复的 runChecks、updateDevServer 或其他后续动作，优先立即继续那些动作，不要先单独输出一条通知消息。",
          "installDependenciesNotification 后台完成提示",
          false,
        );
        return;
      }

      resumeConversationWithMode(
        params.context.taskId,
        `依赖安装后台任务失败。\n错误信息：${latestStatus.error || "依赖安装未成功完成"}\n请直接告知用户安装失败，并提示他们查看日志与错误信息；如果当前没有其他明确可执行动作，不要再调用工具。`,
        "installDependenciesNotification 因依赖安装失败需要人工处理",
        false,
      );
    },
  });

  return { job, started };
}
