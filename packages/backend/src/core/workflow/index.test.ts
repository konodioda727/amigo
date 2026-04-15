import { describe, expect, it } from "bun:test";
import type { ToolInterface } from "@amigo-llm/types";
import {
  buildControllerNoToolRetryMessage,
  buildWorkflowStateSystemMessage,
  createExecutionWorkerWorkflowState,
  createFastWorkflowState,
  createVerificationReviewerWorkflowState,
  createWorkflowState,
  isToolAllowedForWorkflow,
  transitionWorkflowState,
} from "./index";

const createMockTool = (name: string): ToolInterface<string> =>
  ({
    name,
    description: `${name} mock`,
    params: [],
    async invoke() {
      return {
        message: "",
        toolResult: "",
      };
    },
  }) as ToolInterface<string>;

describe("workflow tool access", () => {
  it("allows reviewer read-only verification tools", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("readFile"), {
        currentPhase: "verification",
        agentRole: "verification_reviewer",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("bash"), {
        currentPhase: "verification",
        agentRole: "verification_reviewer",
      }),
    ).toBe(true);
  });

  it("allows controller to use verification read/check tools during verification", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("readFile"), {
        currentPhase: "verification",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("listFiles"), {
        currentPhase: "verification",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("bash"), {
        currentPhase: "verification",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("allows controller to use direct implementation tools during execution", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("readFile"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("listFiles"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("bash"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("editFile"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("updateDevServer"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("blocks background knowledge/rule reading tools during execution", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("readRules"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(false);

    const readRepoKnowledgeTool = {
      ...createMockTool("readRepoKnowledge"),
      workflow: {
        scopes: [
          {
            roles: ["controller"],
            phases: ["design", "verification", "complete"],
          },
          {
            roles: ["verification_reviewer"],
            phases: ["verification"],
          },
        ],
      },
    } satisfies ToolInterface<string>;

    expect(
      isToolAllowedForWorkflow(readRepoKnowledgeTool, {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(false);
  });

  it("allows execution worker to finish with completeTask after execution", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("completeTask"), {
        currentPhase: "execution",
        agentRole: "execution_worker",
      }),
    ).toBe(true);
  });

  it("allows controller to use coding tools in complete for simple tasks", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("editFile"), {
        currentPhase: "complete",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("bash"), {
        currentPhase: "complete",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("updateDevServer"), {
        currentPhase: "complete",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("allows custom tools to remain available in complete for controller handoff-free tasks", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("customTool"), {
        currentPhase: "complete",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("allows custom tools during design for question-answer routing", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("customTool"), {
        currentPhase: "design",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("blocks controller from using reviewer-only tools", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("submitTaskReview"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(false);
  });

  it("allows controller to use overridePhase all the way through verification", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("overridePhase"), {
        currentPhase: "requirements",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("overridePhase"), {
        currentPhase: "execution",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("overridePhase"), {
        currentPhase: "verification",
        agentRole: "controller",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("overridePhase"), {
        currentPhase: "verification",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("allows controller to finish only from the complete phase", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("completeTask"), {
        currentPhase: "complete",
        agentRole: "controller",
      }),
    ).toBe(true);
  });

  it("allows controller to use every tool in fast mode", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("editFile"), {
        currentPhase: "complete",
        agentRole: "controller",
        workflowMode: "fast",
      }),
    ).toBe(true);

    expect(
      isToolAllowedForWorkflow(createMockTool("taskList"), {
        currentPhase: "complete",
        agentRole: "controller",
        workflowMode: "fast",
      }),
    ).toBe(true);
  });

  it("blocks controller from using investigation tools during requirements", () => {
    expect(
      isToolAllowedForWorkflow(createMockTool("readFile"), {
        currentPhase: "requirements",
        agentRole: "controller",
      }),
    ).toBe(false);

    expect(
      isToolAllowedForWorkflow(createMockTool("listFiles"), {
        currentPhase: "requirements",
        agentRole: "controller",
      }),
    ).toBe(false);

    expect(
      isToolAllowedForWorkflow(createMockTool("bash"), {
        currentPhase: "requirements",
        agentRole: "controller",
      }),
    ).toBe(false);

    expect(
      isToolAllowedForWorkflow(createMockTool("readRules"), {
        currentPhase: "requirements",
        agentRole: "controller",
      }),
    ).toBe(false);
  });

  it("injects rich requirements-phase guidance into the workflow state message", () => {
    const message = buildWorkflowStateSystemMessage(
      createWorkflowState({
        currentPhase: "requirements",
        agentRole: "controller",
      }),
    );

    expect(message).toContain("当前阶段：requirements");
    expect(message).toContain("这是当前 workflow 的高优先级运行时提醒");
    expect(message).toContain("阶段目标：");
    expect(message).toContain("只做一件事：把用户需求重新描述清楚");
    expect(message).toContain("预期产出：");
    expect(message).toContain("summary/result");
    expect(message).toContain("不要复现、不要查代码、不要看日志");
    expect(message).toContain("直接把整理后的需求写进 completeTask");
  });

  it("injects issue-investigation guidance into the design-phase workflow state message", () => {
    const message = buildWorkflowStateSystemMessage(
      createWorkflowState({
        currentPhase: "design",
        agentRole: "controller",
      }),
    );

    expect(message).toContain("当前阶段：design");
    expect(message).toContain("实践大于阅读");
    expect(message).toContain("先尝试复现具体问题");
    expect(message).toContain("报错内容、触发步骤和期望结果");
  });

  it("keeps worker/reviewer workflow state messages focused on execution and review duties", () => {
    const executionWorkerMessage = buildWorkflowStateSystemMessage(
      createExecutionWorkerWorkflowState(),
    );
    const verificationReviewerMessage = buildWorkflowStateSystemMessage(
      createVerificationReviewerWorkflowState(),
    );

    expect(executionWorkerMessage).toContain("当前角色：execution_worker");
    expect(verificationReviewerMessage).toContain("当前角色：verification_reviewer");
    expect(verificationReviewerMessage).toContain("submitTaskReview");
  });

  it("injects optional task-splitting guidance into the execution-phase workflow state message", () => {
    const message = buildWorkflowStateSystemMessage(
      createWorkflowState({
        currentPhase: "execution",
        agentRole: "controller",
      }),
    );

    expect(message).toContain("简单任务、单模块任务、紧耦合改动优先由 controller 直接完成");
    expect(message).toContain("调用 overridePhase 回到 design 重新收敛");
    expect(message).toContain("查看文件内容只用 readFile；修改文件只用 editFile");
    expect(message).toContain("bash 只用于搜索、构建、测试和诊断");
    expect(message).toContain("如果任一工具失败只是因为参数、格式、调用方式或前置条件问题");
    expect(message).toContain("若 handoff、诊断或现有上下文已经明确给出目标文件和动作");
    expect(message).toContain("不要回退去读 build 产物");
    expect(message).toContain("如果 getDiagnostics 已确认某个候选文件 clean");
    expect(message).toContain("小步快跑、边改边验");
    expect(message).toContain("只有确实存在可并行、职责独立或依赖清晰的模块/分支时");
    expect(message).toContain("`- [ ] Task <ID>: ... [deps: ...]`");
    expect(message).toContain("同一模块的编码、测试、lint/检查尽量放在同一个子任务里完成");
    expect(message).toContain("子任务会 fork 父任务 design 以来的会话历史");
    expect(message).not.toContain("controller 负责调用 taskList");
  });

  it("injects the persisted design handoff into the execution-phase workflow state message", () => {
    const message = buildWorkflowStateSystemMessage(
      createWorkflowState({
        currentPhase: "execution",
        agentRole: "controller",
        designExecutionHandoff: {
          summary: "设计已收敛，可以直接编码",
          confirmedFacts: ["目标文件已定位。"],
          constraints: ["只做最小改动。"],
          implementationPlan: ["直接修改目标文件并运行检查。"],
          unresolvedQuestions: [],
        },
      }),
    );

    expect(message).toContain("设计交接：");
    expect(message).toContain("设计摘要：设计已收敛，可以直接编码");
    expect(message).toContain("目标文件已定位。");
    expect(message).toContain("只做最小改动。");
    expect(message).toContain("直接修改目标文件并运行检查。");
    expect(message).toContain("未决问题：已收敛");
  });

  it("injects fast-mode guidance into the workflow state message", () => {
    const message = buildWorkflowStateSystemMessage(createFastWorkflowState());

    expect(message).toContain("当前模式：fast");
    expect(message).toContain("不走 requirements/design/execution/verification 状态机");
    expect(message).toContain("调用 overridePhase 回到 design");
    expect(message).toContain("completeTask");
    expect(message).toContain("完成后调用 completeTask");
  });

  it("tells fast mode to fall back into design when the task stops being simple", () => {
    const message = buildControllerNoToolRetryMessage({
      phase: "complete",
      workflowMode: "fast",
      allowedToolNames: ["readFile", "editFile", "overridePhase", "completeTask"],
    });

    expect(message).toContain("fast mode 不走 requirements/design/execution/verification 状态机");
    expect(message).toContain("调用 overridePhase 回到 design");
    expect(message).toContain("当前允许工具: readFile, editFile, overridePhase, completeTask");
  });

  it("tells execution retries to fix and retry the same tool after tool-call failures", () => {
    const message = buildControllerNoToolRetryMessage({
      phase: "execution",
      allowedToolNames: ["readFile", "editFile", "bash", "completeTask"],
    });

    expect(message).toContain("优先修正并重试同一个工具");
    expect(message).toContain("不要因此退回 readFile/listFiles/bash");
  });

  it("injects verification and complete phase guidance for direct checking and final-mile edits", () => {
    const verificationMessage = buildWorkflowStateSystemMessage(
      createWorkflowState({
        currentPhase: "verification",
        agentRole: "controller",
      }),
    );
    const completeMessage = buildWorkflowStateSystemMessage(
      createWorkflowState({
        currentPhase: "complete",
        agentRole: "controller",
      }),
    );

    expect(verificationMessage).toContain("模型的说法与真实举动、实际产物和当前现状是否一致");
    expect(verificationMessage).toContain("readRules、readFile、listFiles、bash");
    expect(completeMessage).toContain("直接在 complete 阶段使用读/改/检查工具");
    expect(completeMessage).toContain(
      "readRules、readFile、listFiles、bash、editFile、updateDevServer",
    );
  });
});

describe("workflow transitions", () => {
  it("allows manual phase changes back to an earlier stage and resets downstream state", () => {
    const nextState = transitionWorkflowState(
      {
        ...createWorkflowState({
          currentPhase: "execution",
          agentRole: "controller",
          phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        }),
        visitedPhases: ["requirements", "design", "execution"],
        phaseStates: {
          requirements: { status: "completed" },
          design: { status: "completed" },
          execution: { status: "in_progress" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
      "design",
      "change",
      { reason: "用户指出设计判断错了" },
    );

    expect(nextState.currentPhase).toBe("design");
    expect(nextState.phaseStates.requirements?.status).toBe("completed");
    expect(nextState.phaseStates.design?.status).toBe("in_progress");
    expect(nextState.phaseStates.execution?.status).toBe("pending");
    expect(nextState.phaseStates.verification?.status).toBe("pending");
    expect(nextState.phaseStates.complete?.status).toBe("pending");
  });

  it("can reset back to requirements on the full phased sequence", () => {
    const nextState = transitionWorkflowState(
      createWorkflowState({
        currentPhase: "verification",
        agentRole: "controller",
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
      }),
      "requirements",
      "change",
      { reason: "用户换了问题" },
      {
        phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
      },
    );

    expect(nextState.currentPhase).toBe("requirements");
    expect(nextState.phaseSequence).toEqual([
      "requirements",
      "design",
      "execution",
      "verification",
      "complete",
    ]);
  });

  it("allows manual phase changes forward and marks skipped intermediate phases", () => {
    const nextState = transitionWorkflowState(
      {
        ...createWorkflowState({
          currentPhase: "requirements",
          agentRole: "controller",
          phaseSequence: ["requirements", "design", "execution", "verification", "complete"],
        }),
        visitedPhases: ["requirements"],
        skippedPhases: [],
        phaseStates: {
          requirements: { status: "in_progress" },
          design: { status: "pending" },
          execution: { status: "pending" },
          verification: { status: "pending" },
          complete: { status: "pending" },
        },
      },
      "execution",
      "change",
      { reason: "已有足够证据，不需要单独停留在 design" },
    );

    expect(nextState.currentPhase).toBe("execution");
    expect(nextState.phaseStates.requirements?.status).toBe("completed");
    expect(nextState.phaseStates.design?.status).toBe("skipped");
    expect(nextState.phaseStates.execution?.status).toBe("in_progress");
    expect(nextState.skippedPhases).toHaveLength(1);
    expect(nextState.skippedPhases[0]?.fromPhase).toBe("requirements");
    expect(nextState.skippedPhases[0]?.toPhase).toBe("execution");
  });
});
