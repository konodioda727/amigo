import type { USER_SEND_MESSAGE_NAME, UserSendMessageData } from "@amigo-llm/types";
import { broadcaster } from "@/core/conversation";
import { CreateTaskDocs } from "@/core/tools/taskDocs";
import { logger } from "@/utils/logger";
import BaseMessageResolver from "../base";

const DOC_PHASES = new Set(["requirements", "design", "taskList"]);

export class UpdateTaskDocMessageResolver extends BaseMessageResolver<"updateTaskDoc"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "updateTaskDoc";

  override async process(message: UserSendMessageData<"updateTaskDoc">): Promise<void> {
    const { taskId, phase, content } = message;

    if (!DOC_PHASES.has(phase)) {
      const errorMessage = `不支持的文档类型: ${phase}`;
      logger.warn(`[UpdateTaskDocMessageResolver] ${errorMessage}`);
      broadcaster.broadcast(taskId, {
        type: "error",
        data: {
          message: "保存文档失败",
          details: errorMessage,
        },
      });
      return;
    }

    try {
      const { toolResult } = await CreateTaskDocs.invoke({
        params: {
          phase,
          content,
        },
        context: {
          taskId,
          parentId: this.conversation.parentId,
          getSandbox: async () => ({}),
          getToolByName: (name: string) => this.conversation.toolService.getToolFromName(name),
          signal: undefined,
        },
      });

      broadcaster.postMessage(this.conversation, {
        role: "assistant",
        type: "tool",
        content: JSON.stringify({
          toolName: "createTaskDocs",
          params: {
            phase,
            content,
          },
          result: toolResult,
        }),
      });

      if (!toolResult.success) {
        broadcaster.broadcast(taskId, {
          type: "error",
          data: {
            message: "保存文档失败",
            details: toolResult.message,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[UpdateTaskDocMessageResolver] 保存文档失败: ${errorMessage}`);
      broadcaster.broadcast(taskId, {
        type: "error",
        data: {
          message: "保存文档失败",
          details: errorMessage,
        },
      });
    }
  }
}
