import type { WorkflowPhase } from "@amigo-llm/types";
import type { DisplayMessageType } from "../messages/types";
import type { TaskStatus } from "../types/store";

export interface TaskTimelineMessageNode {
  kind: "message";
  message: DisplayMessageType;
}

export type TaskTimelineNode = TaskTimelineMessageNode;

export const buildTaskTimeline = ({
  messages,
  taskStatus: _taskStatus,
}: {
  messages: DisplayMessageType[];
  taskStatus: TaskStatus;
}): TaskTimelineNode[] =>
  messages.map((message) => ({
    kind: "message",
    message,
  }));

export const COMPLETE_TASK_PHASE_TITLES: Record<WorkflowPhase, string> = {
  requirements: "需求阶段",
  design: "设计阶段",
  execution: "执行阶段",
  verification: "验证阶段",
  complete: "最终交付",
};
