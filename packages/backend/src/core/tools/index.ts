import type { ToolInterface } from "@amigo-llm/types";
import { getGlobalState } from "@/globalState";
import type { WorkflowPromptScope } from "../workflow";
import { AskFollowupQuestions } from "./askFollowupQuestions";
import { Bash } from "./bash";
import { BrowserSearch } from "./browserSearch";
import { EditFile } from "./editFile";
import { FinishPhase } from "./finishPhase";
import { ListFiles } from "./listFiles";
import { ReadFile } from "./readFile";
import { createReadRulesTool, READ_RULES_TOOL_NAME } from "./readRules";
import { SubmitTaskReview } from "./submitTaskReview";
import { ToolService } from "./ToolService";
import { TaskList } from "./taskList";
import { UpdateDevServer } from "./updateDevServer";

type GenericTool = ToolInterface<any>;

export const DEFAULT_CONTROLLER_BASIC_TOOLS: GenericTool[] = [
  AskFollowupQuestions,
  FinishPhase,
  BrowserSearch,
  EditFile,
  ListFiles,
  ReadFile,
  Bash,
  TaskList,
  SubmitTaskReview,
  UpdateDevServer,
];

export const DEFAULT_WORKER_BASIC_TOOLS: GenericTool[] = [
  EditFile,
  ListFiles,
  ReadFile,
  Bash,
  FinishPhase,
  SubmitTaskReview,
  UpdateDevServer,
];

export const getBaseTools = (promptScope: WorkflowPromptScope): GenericTool[] => {
  const configuredBaseTools = getGlobalState("baseTools")?.[promptScope];
  if (configuredBaseTools) {
    return [...configuredBaseTools];
  }

  return promptScope === "controller" ? DEFAULT_CONTROLLER_BASIC_TOOLS : DEFAULT_WORKER_BASIC_TOOLS;
};

export const CUSTOMED_TOOLS: GenericTool[] = [];

export {
  ToolService,
  AskFollowupQuestions,
  FinishPhase,
  BrowserSearch,
  EditFile,
  ListFiles,
  ReadFile,
  createReadRulesTool,
  READ_RULES_TOOL_NAME,
  Bash,
  TaskList,
  SubmitTaskReview,
  UpdateDevServer,
};
