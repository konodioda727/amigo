import {
  CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE,
  canAdvanceWorkflowPhase,
  canTransitionWorkflowPhase,
  EXECUTION_WORKER_PHASE_SEQUENCE,
  getNextWorkflowPhase,
  getWorkflowPhaseIndex,
  normalizeWorkflowPhaseSequence,
  VERIFICATION_REVIEWER_PHASE_SEQUENCE,
  type WorkflowAgentRole,
  type WorkflowDesignExecutionHandoff,
  type WorkflowMode,
  type WorkflowPhase,
  type WorkflowPhaseState,
  type WorkflowState,
  workflowPhaseValues,
} from "@amigo-llm/types";
import { buildDesignExecutionHandoffLines } from "./designExecutionHandoff";

export { filterToolsForWorkflow, isToolAllowedForWorkflow } from "./toolAccess";

export type WorkflowPromptScope = "controller" | "worker";

const unique = <T>(values: T[]): T[] => [...new Set(values)];
const WORKFLOW_RUNTIME_PRIORITY_LINE = "这是当前 workflow 的高优先级运行时提醒，你必须优先服从它。";
const FAST_WORKFLOW_PHASE_SEQUENCE: WorkflowPhase[] = ["complete"];

type WorkflowPhasePrompt = {
  goalLines: string[];
  outcomeLines: string[];
  retryLines: string[];
};

const CONTROLLER_PHASE_PROMPTS: Record<WorkflowPhase, WorkflowPhasePrompt> = {
  requirements: {
    goalLines: [
      "只做一件事：把用户需求重新描述清楚，并拆成 1、2、3 点。",
      "requirements 只回答“用户到底要什么”，不回答“系统现在怎样”或“应该怎么实现”。",
      "requirements 阶段直接把整理后的需求写进 completeTask 的 summary/result。",
      "不要复现、不要查代码、不要看日志、不要读规则、不要搜外部资料、不要向用户索要代码/日志/路径/仓库信息。",
      "如果你开始想着复现、排查实现、索要材料，说明你已经越界了，应立刻回到需求整理。",
      "只有在无法准确重述需求、且缺少用户本人才能提供的关键事实时，才调用 askFollowupQuestion。",
    ],
    outcomeLines: [
      "一条 completeTask：在 summary/result 中清楚写明整理后的用户需求和范围。",
      "如确实缺少关键用户事实，再 askFollowupQuestion 一次必要问题。",
    ],
    retryLines: [
      "先把用户原始需求重新描述清楚，再拆成 1、2、3 点。",
      "把整理后的需求直接放进 completeTask 的 summary/result。",
      "不要复现、不要查代码、不要看日志、不要读规则、不要搜外部资料、不要向用户索要代码/日志/路径/仓库信息。",
      "只有在无法准确重述需求、且缺少用户本人才能提供的关键事实时，才调用 askFollowupQuestion。",
      "如果 requirements 阶段已经完成，调用 completeTask 进入下一阶段。",
    ],
  },
  design: {
    goalLines: [
      "直接在 design 阶段完成调查、提问和方案收敛，明确下一步该怎么做。",
      "若本轮包含 requirements，先基于刚澄清好的用户需求与最近会话历史；若本轮没有 requirements，则直接基于用户原始请求与会话历史推进。",
      "当用户反馈遇到问题时，实践大于阅读：先尝试复现具体问题；若无法复现，再询问用户实际现象、报错内容、触发步骤和期望结果，然后继续调查原因。",
      "如果用户补充的新信息表明当前阶段判断不再合适，调用 overridePhase 手动重定位到更合适的阶段。",
      "不要在 design 阶段生成 taskList；重要调查结论、约束、取舍和下一步建议写进 completeTask。",
      "design 阶段结束前，completeTask.result 必须显式包含三个二级标题：`## 已确认事实`、`## 关键约束`、`## 实施计划`。",
      "只有当仍有会阻塞 execution 的事项时，才额外填写 `## 未决问题`；若没有未决问题，就不要写这个板块。",
      "不要再维护阶段文档；调查结论靠会话历史、显式 checkpoint/compaction 与 completeTask 保留。",
      "只有当多个可行方案之间存在真实的用户偏好、验收边界或取舍分歧，且这会阻塞方案收敛时，才调用 askFollowupQuestion。",
      "如果下一步已经明确，就继续调查并收敛方案，不要为了形式化流程重复追问用户。",
    ],
    outcomeLines: [
      "一次 completeTask：按固定章节写清已确认事实、关键约束、实施计划；若仍有阻塞项，再额外写 `## 未决问题`。只有没有未决问题时，execution 才可直接起手。",
    ],
    retryLines: [
      "若本轮没有 requirements，则直接以用户原始请求与会话历史为准；若刚完成 requirements，也把原始用户请求和最近会话历史一起带入设计判断。",
      "用户是在反馈问题时，先尝试复现；若无法复现，再通过 askFollowupQuestion 询问实际现象、报错内容、触发步骤和期望结果，然后继续调查原因。",
      "如果用户新信息已经说明当前阶段判断错了，调用 overridePhase 重定位阶段；不要在错误阶段里硬拖。",
      "用 readFile、listFiles、bash、browserSearch 收集足够证据；能并行的独立只读查询尽量在同一轮一次调用多个工具。",
      "不要在 design 阶段生成 taskList；把关键发现、约束、风险、决策和下一步写进 completeTask。",
      "design completeTask.result 必须包含 `## 已确认事实`、`## 关键约束`、`## 实施计划` 三个章节。",
      "只有当仍有阻塞项时才写 `## 未决问题`；如果写了这个章节且里面还有内容，说明设计还没收敛，不能进入 execution。",
      "只有当真实的用户偏好、验收边界或取舍分歧会阻塞方案收敛时，才调用 askFollowupQuestion；否则不要重复确认用户已经说清楚的事。",
      "不要用普通文本提问，问题必须直接通过 askFollowupQuestion 提出。",
      "如果 design 阶段已经完成，调用 completeTask 进入下一阶段。",
    ],
  },
  execution: {
    goalLines: [
      "基于 design handoff 和最新诊断直接落地实现。",
      "简单任务、单模块任务、紧耦合改动优先由 controller 直接完成，不强制要求使用 taskList。",
      "查看文件内容只用 readFile；修改文件只用 editFile；bash 只用于搜索、构建、测试和诊断。",
      "代码内符号定位优先用 goToDefinition / findReferences / getDiagnostics；只有没有符号锚点时才回退到 bash/rg。",
      "若 handoff、诊断或现有上下文已经明确给出目标文件和动作，就直接修改或验证；不要再补读 readRules/readRepoKnowledge，也不要回退去读 build 产物、生成文件或镜像代码做对照。",
      "如果 getDiagnostics 已确认某个候选文件 clean，就把它移出当前修复范围；优先处理仍报错的文件。",
      "如果任一工具失败只是因为参数、格式、调用方式或前置条件问题，下一步优先修正并重试同一个工具；不要立刻改走别的路径。",
      "若某一处修复已经明确且风险可控，先立即修改这一处并验证；默认采用小步快跑、边改边验。",
      "如果执行中发现问题类型、范围或关键约束已被新证据推翻，调用 overridePhase 回到 design 重新收敛。",
      "只有确实存在可并行、职责独立或依赖清晰的模块/分支时，才调用 taskList(action=execute)。",
      "若使用 taskList，每条任务都必须写成 `- [ ] Task <ID>: ... [deps: ...]`；同一模块的编码、测试、lint/检查尽量放在同一个子任务里完成。",
      "子任务会 fork 父任务 design 以来的会话历史，并优先按模块或变更面做粗粒度划分。",
    ],
    outcomeLines: ["已完成实现，或已通过 taskList(action=execute) 推进并同步 execution 阶段状态。"],
    retryLines: [
      "先判断这是不是简单任务；如果主任务自己直接实现更高效，就直接实现并检查。",
      "查看文件内容只用 readFile，修改文件只用 editFile；不要再用 bash 代替编辑。",
      "已知 filePath + line + symbolName，或诊断已给出未定义符号时，优先使用 goToDefinition / findReferences / getDiagnostics；不要连续用 bash/rg 追同一批 symbol。",
      "若 handoff、诊断或现有上下文已经明确给出目标文件和动作，就直接进入修改或验证；不要再为了补背景调用 readRules/readRepoKnowledge。",
      "如果任一工具失败只是因为参数、格式、调用方式或前置条件问题，下一步优先修正并重试同一个工具；不要因此退回 readFile/listFiles/bash 或立刻切换另一种工具路径。",
      "如果当前上下文已经足以确定下一步修改或验证动作，就直接调用对应工具推进；若仍无法下手，说明仍有阻塞，应 overridePhase 回到 design。",
      "已知源文件和缺失符号时，不要再去读 build 产物、生成文件或旧输出做对照；先 editFile 落最小修复。",
      "如果 getDiagnostics 已确认某个候选文件 clean，就把它移出当前修复范围；不要回头重读这个 clean 文件。",
      "只要已经确认一处修复，就先 editFile 落这一处，再继续验证或调查下一处。",
      "若要分派执行，直接调用 taskList(action=execute)；每条任务都必须使用 `- [ ] Task <ID>: ... [deps: ...]` 格式，并按模块或变更面做粗粒度划分。",
      "如果 execution 阶段已经完成，调用 completeTask 进入 verification。",
      "phased workflow 中不要跳过 verification；execution 阶段完成后调用 completeTask 进入 verification。",
    ],
  },
  verification: {
    goalLines: [
      "对最终结果做收口核对，确认模型的说法与真实举动、实际产物和当前现状是否一致。",
      "优先核对：声称改过的内容是否真的改了，声称已验证的内容是否真的验证了，声称能做到的事情现在是否真的能做到。",
      "需要检查真实产物时，可直接使用 readRules、readFile、listFiles、bash。",
      "如需留下检查记录，把结论写进 completeTask 结果。",
    ],
    outcomeLines: ["一次可进入 complete 的核对结论。"],
    retryLines: [
      "先用会话历史、completeTask 记录和真实产物确认目标、执行结果与待核对项，再做最终核对。",
      "重点检查模型表述和真实状态之间是否冲突，以及当前结果是否已经满足用户想要的能力或约束。",
      "需要查看真实实现、规则或检查结果时，优先使用 readRules、readFile、listFiles、bash。",
      "verification 阶段完成后，调用 completeTask 进入 complete。",
    ],
  },
  complete: {
    goalLines: [
      "向用户正式交付最终结果。",
      "不再维护任何阶段文档，只准备最终答复。",
      "对于简单任务或收尾修正，可以直接在 complete 阶段使用读/改/检查工具完成最后实现。",
      "需要时可直接使用 readRules、readFile、listFiles、bash、editFile、updateDevServer。",
      "最终交付前优先回看 completeTask、checkpoint 与最近会话历史，确认任务目标、关键发现和最终结论。",
    ],
    outcomeLines: ["一次面向用户的 completeTask 交付。"],
    retryLines: [
      "先用最近的 completeTask 与 checkpoint 确认任务状态、关键结论和交付重点，再组织最终交付结果。",
      "若还需做最后一轮核对或小范围实现，可直接使用 readRules、readFile、listFiles、bash、editFile、updateDevServer。",
      "complete 阶段只做必要的最后实现、检查和交付。",
      "已经可以正式交付最终结果时，直接调用 completeTask。",
      "若仍需回看真实实现确认最后措辞，先使用允许的只读工具。",
    ],
  },
};

const resolveDefaultPhaseSequence = (agentRole: WorkflowAgentRole): WorkflowPhase[] => {
  if (agentRole === "execution_worker") {
    return EXECUTION_WORKER_PHASE_SEQUENCE;
  }

  if (agentRole === "verification_reviewer") {
    return VERIFICATION_REVIEWER_PHASE_SEQUENCE;
  }

  return CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE;
};

const formatPhaseSequence = (phaseSequence: WorkflowPhase[]): string => phaseSequence.join(" -> ");

const buildInitialPhaseStates = (
  currentPhase: WorkflowPhase,
): Record<WorkflowPhase, WorkflowPhaseState> =>
  Object.fromEntries(
    workflowPhaseValues.map((phase) => [
      phase,
      {
        status: phase === currentPhase ? "in_progress" : "pending",
      },
    ]),
  ) as Record<WorkflowPhase, WorkflowPhaseState>;

export const createWorkflowState = (params?: {
  currentPhase?: WorkflowPhase;
  agentRole?: WorkflowAgentRole;
  mode?: WorkflowMode;
  phaseSequence?: WorkflowPhase[];
  completionSeedState?: WorkflowState["completionSeedState"];
  designExecutionHandoff?: WorkflowDesignExecutionHandoff;
}): WorkflowState => {
  const agentRole = params?.agentRole || "controller";
  const mode = params?.mode || "phased";
  const defaultSequence =
    agentRole === "controller" && mode === "fast"
      ? FAST_WORKFLOW_PHASE_SEQUENCE
      : resolveDefaultPhaseSequence(agentRole);
  const phaseSequence = normalizeWorkflowPhaseSequence(params?.phaseSequence, defaultSequence);
  const requestedPhase = params?.currentPhase;
  const currentPhase =
    requestedPhase && phaseSequence.includes(requestedPhase) ? requestedPhase : phaseSequence[0]!;
  return {
    currentPhase,
    agentRole,
    mode,
    phaseSequence,
    ...(params?.completionSeedState ? { completionSeedState: params.completionSeedState } : {}),
    ...(params?.designExecutionHandoff
      ? { designExecutionHandoff: params.designExecutionHandoff }
      : {}),
    visitedPhases: [currentPhase],
    skippedPhases: [],
    phaseStates: buildInitialPhaseStates(currentPhase),
  };
};

export const createExecutionWorkerWorkflowState = (): WorkflowState =>
  createWorkflowState({
    currentPhase: "execution",
    agentRole: "execution_worker",
    mode: "phased",
    phaseSequence: EXECUTION_WORKER_PHASE_SEQUENCE,
  });

export const createVerificationReviewerWorkflowState = (): WorkflowState =>
  createWorkflowState({
    currentPhase: "verification",
    agentRole: "verification_reviewer",
    mode: "phased",
    phaseSequence: VERIFICATION_REVIEWER_PHASE_SEQUENCE,
  });

export const createFastWorkflowState = (): WorkflowState =>
  createWorkflowState({
    currentPhase: "complete",
    agentRole: "controller",
    mode: "fast",
    phaseSequence: FAST_WORKFLOW_PHASE_SEQUENCE,
  });

export const resolveWorkflowPromptScope = (params?: {
  workflowState?: Partial<WorkflowState> | null;
  toolNames?: string[];
  parentId?: string;
}): WorkflowPromptScope => {
  const agentRole = params?.workflowState?.agentRole;
  if (agentRole === "execution_worker" || agentRole === "verification_reviewer") {
    return "worker";
  }

  if (agentRole === "controller") {
    return "controller";
  }

  const toolNames = new Set(params?.toolNames || []);
  if (
    toolNames.has("askFollowupQuestion") ||
    toolNames.has("taskList") ||
    toolNames.has("overridePhase") ||
    toolNames.has("changePhase")
  ) {
    return "controller";
  }

  if (params?.parentId) {
    return "worker";
  }

  return "controller";
};

export const WORKFLOW_STATE_MESSAGE_PREFIX = "[WorkflowState]";

export const getControllerWorkflowPhasePrompt = (phase: WorkflowPhase): WorkflowPhasePrompt =>
  CONTROLLER_PHASE_PROMPTS[phase];

export const buildControllerNoToolRetryMessage = (params: {
  phase: WorkflowPhase;
  allowedToolNames: string[];
  workflowMode?: WorkflowMode;
  phaseSequence?: WorkflowPhase[];
}): string => {
  const allowedToolsLine =
    params.allowedToolNames.length > 0 ? params.allowedToolNames.join(", ") : "无显式可用工具";
  if (params.workflowMode === "fast") {
    return [
      "上一条回复没有调用任何工具。",
      "",
      "你当前处于 fast mode。下一条回复必须直接调用一个工具，不要再输出普通文本。",
      "- fast mode 不走 requirements/design/execution/verification 状态机。",
      "- 直接围绕最新用户消息推进；需要读就读，需要改就改，需要检查就检查。",
      "- 如果任务原本看似简单，但新证据表明它已经变成需要重新调查和方案收敛的复杂问题，调用 overridePhase 回到 design，再继续推进。",
      "- 没有更多动作时调用 completeTask 交付最终结果。",
      "",
      `当前允许工具: ${allowedToolsLine}`,
    ].join("\n");
  }
  const prompt = getControllerWorkflowPhasePrompt(params.phase);
  const phaseSequence = normalizeWorkflowPhaseSequence(params.phaseSequence);
  return [
    "上一条回复没有调用任何工具。",
    "",
    `你当前处于 ${params.phase} 阶段。下一条回复必须直接调用一个工具，不要再输出普通文本。`,
    `当前阶段序列：${formatPhaseSequence(phaseSequence)}`,
    ...prompt.retryLines.map((line) => `- ${line}`),
    "",
    `当前允许工具: ${allowedToolsLine}`,
  ].join("\n");
};

const buildControllerRoutingLines = (workflowState: WorkflowState): string[] => {
  const phaseSequence = normalizeWorkflowPhaseSequence(
    workflowState.phaseSequence,
    resolveDefaultPhaseSequence(workflowState.agentRole),
  );
  return ["阶段序列：", `- ${formatPhaseSequence(phaseSequence)}`];
};

export const buildWorkflowStateSystemMessage = (workflowState: WorkflowState): string => {
  const phaseSequence = normalizeWorkflowPhaseSequence(
    workflowState.phaseSequence,
    resolveDefaultPhaseSequence(workflowState.agentRole),
  );
  const nextPhase = getNextWorkflowPhase(workflowState.currentPhase, phaseSequence);

  if (workflowState.agentRole === "execution_worker") {
    return [
      WORKFLOW_STATE_MESSAGE_PREFIX,
      WORKFLOW_RUNTIME_PRIORITY_LINE,
      `当前阶段：${workflowState.currentPhase}`,
      `当前阶段序列：${formatPhaseSequence(phaseSequence)}`,
      "当前角色：execution_worker",
      "阶段目标：",
      "- 完成分配到的执行任务并自查结果。",
      "预期产出：",
      "- 已完成的代码/产物，以及完整的 completeTask 执行结果。",
      "完成当前子任务后调用 completeTask。",
    ].join("\n");
  }

  if (workflowState.agentRole === "verification_reviewer") {
    return [
      WORKFLOW_STATE_MESSAGE_PREFIX,
      WORKFLOW_RUNTIME_PRIORITY_LINE,
      `当前阶段：${workflowState.currentPhase}`,
      `当前阶段序列：${formatPhaseSequence(phaseSequence)}`,
      "当前角色：verification_reviewer",
      "阶段目标：",
      "- 核对执行结果是否满足任务目标与验证标准。",
      "- 只读检查并通过 submitTaskReview 提交最终裁决。",
      "预期产出：",
      "- 一次 submitTaskReview 工具调用。",
      "完成审查后调用 submitTaskReview，不要调用 completeTask。",
    ].join("\n");
  }

  if (workflowState.mode === "fast") {
    return [
      WORKFLOW_STATE_MESSAGE_PREFIX,
      WORKFLOW_RUNTIME_PRIORITY_LINE,
      "当前模式：fast",
      `当前阶段：${workflowState.currentPhase}`,
      "当前角色：controller",
      "模式目标：",
      "- 不走 requirements/design/execution/verification 状态机，直接围绕当前用户请求完成任务。",
      "- 可直接使用当前 controller 可见的全部工具，不受常规 phase 限制。",
      "- 会话原始历史仍完整保留；组装上下文时，优先使用由历史 user 消息与对应 completeTask/checkpoint 投影出的 seed history 快速接续上下文。",
      "预期产出：",
      "- 需要用户事实或偏好时用 askFollowupQuestion，否则直接推进实现/检查/交付。",
      "- 若执行途中发现问题类型或范围升级，已经不适合继续 fast 直推，则调用 overridePhase 回到 design，显式重新收敛方案。",
      "- 完成后调用 completeTask。",
      "如果用户下一条消息明确要求切回工作流模式，系统会按消息重新切换。",
    ].join("\n");
  }

  const controllerPhasePrompt = getControllerWorkflowPhasePrompt(workflowState.currentPhase);
  const controllerPhaseLines = [
    "阶段目标：",
    ...controllerPhasePrompt.goalLines.map((line) => `- ${line}`),
    "预期产出：",
    ...controllerPhasePrompt.outcomeLines.map((line) => `- ${line}`),
    ...(workflowState.currentPhase === "execution" && workflowState.designExecutionHandoff
      ? buildDesignExecutionHandoffLines(workflowState.designExecutionHandoff)
      : []),
  ];

  return [
    WORKFLOW_STATE_MESSAGE_PREFIX,
    WORKFLOW_RUNTIME_PRIORITY_LINE,
    `当前阶段：${workflowState.currentPhase}`,
    "当前角色：controller",
    ...buildControllerRoutingLines(workflowState),
    ...controllerPhaseLines,
    nextPhase
      ? `完成当前阶段后调用 completeTask，系统会切换到 ${nextPhase}。`
      : "当前已处于最终阶段；完成全部任务后调用 completeTask 结束会话。",
  ].join("\n");
};

export const normalizeWorkflowState = (
  state: WorkflowState | null | undefined,
  fallback?: Partial<WorkflowState>,
): WorkflowState => {
  const agentRole = state?.agentRole || fallback?.agentRole || "controller";
  const mode = state?.mode || fallback?.mode || "phased";
  const fallbackPhaseSequence = normalizeWorkflowPhaseSequence(
    fallback?.phaseSequence,
    agentRole === "controller" && mode === "fast"
      ? FAST_WORKFLOW_PHASE_SEQUENCE
      : resolveDefaultPhaseSequence(agentRole),
  );
  const phaseSequence = normalizeWorkflowPhaseSequence(state?.phaseSequence, fallbackPhaseSequence);
  const initialPhase = phaseSequence[0] || "complete";
  const requestedPhase =
    state?.currentPhase ||
    fallback?.currentPhase ||
    (agentRole === "verification_reviewer"
      ? "verification"
      : agentRole === "execution_worker"
        ? "execution"
        : agentRole === "controller" && mode === "fast"
          ? "complete"
          : initialPhase);
  const currentPhase = phaseSequence.includes(requestedPhase as WorkflowPhase)
    ? requestedPhase
    : initialPhase;
  const base = createWorkflowState({
    currentPhase,
    agentRole,
    mode,
    phaseSequence,
    completionSeedState: state?.completionSeedState || fallback?.completionSeedState,
    designExecutionHandoff: state?.designExecutionHandoff || fallback?.designExecutionHandoff,
  });

  return {
    ...base,
    currentPhase,
    agentRole,
    mode,
    phaseSequence,
    ...(state?.completionSeedState || fallback?.completionSeedState
      ? { completionSeedState: state?.completionSeedState || fallback?.completionSeedState }
      : {}),
    ...(state?.designExecutionHandoff || fallback?.designExecutionHandoff
      ? {
          designExecutionHandoff: state?.designExecutionHandoff || fallback?.designExecutionHandoff,
        }
      : {}),
    visitedPhases: unique([...(state?.visitedPhases || []), currentPhase]),
    skippedPhases: [...(state?.skippedPhases || [])],
    phaseStates: {
      ...base.phaseStates,
      ...(state?.phaseStates || {}),
      [currentPhase]: {
        ...(state?.phaseStates?.[currentPhase] || {}),
        status:
          state?.phaseStates?.[currentPhase]?.status === "completed" ? "completed" : "in_progress",
      },
    },
  };
};

export const transitionWorkflowState = (
  state: WorkflowState,
  targetPhase: WorkflowPhase,
  mode: "advance" | "skip" | "change" = "advance",
  metadata?: { reason?: string; evidence?: string },
  options?: {
    phaseSequence?: WorkflowPhase[];
  },
): WorkflowState => {
  if (state.currentPhase === targetPhase) {
    return state;
  }

  const phaseSequence = normalizeWorkflowPhaseSequence(
    options?.phaseSequence || state.phaseSequence,
    resolveDefaultPhaseSequence(state.agentRole),
  );

  const canTransition =
    mode === "change"
      ? canTransitionWorkflowPhase(state.currentPhase, targetPhase, phaseSequence)
      : canAdvanceWorkflowPhase(state.currentPhase, targetPhase, phaseSequence);
  if (!canTransition) {
    throw new Error(`非法阶段切换: ${state.currentPhase} -> ${targetPhase}`);
  }

  const now = new Date().toISOString();
  const nextPhaseStates = { ...state.phaseStates };
  const fromIndex = getWorkflowPhaseIndex(state.currentPhase, phaseSequence);
  const toIndex = getWorkflowPhaseIndex(targetPhase, phaseSequence);
  const movingBackward = toIndex < fromIndex;
  const skippedIntermediatePhases =
    !movingBackward && (mode === "skip" || mode === "change")
      ? phaseSequence.slice(fromIndex + 1, toIndex)
      : [];

  if (movingBackward) {
    for (const phase of phaseSequence) {
      const phaseIndex = getWorkflowPhaseIndex(phase, phaseSequence);
      if (phaseIndex < toIndex) {
        continue;
      }

      if (phase === targetPhase) {
        const currentTargetState = nextPhaseStates[phase] || { status: "pending" };
        const { completedAt: _completedAt, ...targetStateWithoutCompletedAt } = currentTargetState;
        nextPhaseStates[phase] = {
          ...targetStateWithoutCompletedAt,
          status: "in_progress",
          enteredAt: targetStateWithoutCompletedAt.enteredAt || now,
        };
        continue;
      }

      nextPhaseStates[phase] = {
        status: "pending",
      };
    }
  } else {
    nextPhaseStates[state.currentPhase] = {
      ...(nextPhaseStates[state.currentPhase] || { status: "in_progress" }),
      status: "completed",
      completedAt: now,
    };
    for (const skippedPhase of skippedIntermediatePhases) {
      nextPhaseStates[skippedPhase] = {
        ...(nextPhaseStates[skippedPhase] || { status: "pending" }),
        status: "skipped",
        completedAt: now,
      };
    }
    nextPhaseStates[targetPhase] = {
      ...(nextPhaseStates[targetPhase] || { status: "pending" }),
      status: "in_progress",
      enteredAt: nextPhaseStates[targetPhase]?.enteredAt || now,
    };
  }

  const shouldClearDesignHandoff = targetPhase === "requirements" || targetPhase === "design";

  return {
    ...state,
    ...(shouldClearDesignHandoff ? { designExecutionHandoff: undefined } : {}),
    currentPhase: targetPhase,
    phaseSequence,
    visitedPhases: unique([...state.visitedPhases, targetPhase]),
    skippedPhases: movingBackward
      ? state.skippedPhases.filter((record) => {
          const recordFromIndex = getWorkflowPhaseIndex(record.fromPhase, phaseSequence);
          const recordToIndex = getWorkflowPhaseIndex(record.toPhase, phaseSequence);
          return recordFromIndex >= 0 && recordToIndex >= 0 && recordToIndex <= toIndex;
        })
      : mode === "skip" || mode === "change"
        ? [
            ...state.skippedPhases,
            {
              fromPhase: state.currentPhase,
              toPhase: targetPhase,
              reason: metadata?.reason?.trim() || "No reason provided",
              ...(metadata?.evidence?.trim() ? { evidence: metadata.evidence.trim() } : {}),
              skippedAt: now,
            },
          ]
        : state.skippedPhases,
    phaseStates: nextPhaseStates,
  };
};
