import type {
  ToolInterface,
  ToolWorkflowAccess,
  ToolWorkflowScope,
  WorkflowAgentRole,
  WorkflowMode,
  WorkflowPhase,
} from "@amigo-llm/types";

type ToolExecutionScope = {
  currentPhase?: WorkflowPhase;
  agentRole?: WorkflowAgentRole;
  workflowMode?: WorkflowMode;
};

const DEFAULT_WORKFLOW_ACCESS: Record<string, ToolWorkflowAccess> = {
  askFollowupQuestion: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["requirements", "design"],
      },
    ],
  },
  overridePhase: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["requirements", "design", "execution", "verification"],
      },
    ],
  },
  changePhase: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["requirements", "design", "execution", "verification"],
      },
    ],
  },
  browserSearch: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["design", "verification", "complete"],
      },
    ],
  },
  readRules: {
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
  readFile: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["design", "execution", "verification", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
      {
        roles: ["verification_reviewer"],
        phases: ["verification"],
      },
    ],
  },
  listFiles: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["design", "execution", "verification", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
      {
        roles: ["verification_reviewer"],
        phases: ["verification"],
      },
    ],
  },
  bash: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["design", "execution", "verification", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
      {
        roles: ["verification_reviewer"],
        phases: ["verification"],
      },
    ],
  },
  taskList: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["execution"],
      },
    ],
  },
  completeTask: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["requirements", "design", "execution", "verification", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
    ],
  },
  editFile: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["execution", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
    ],
  },
  updateDevServer: {
    scopes: [
      {
        roles: ["controller"],
        phases: ["execution", "complete"],
      },
      {
        roles: ["execution_worker"],
        phases: ["execution"],
      },
    ],
  },
  submitTaskReview: {
    scopes: [
      {
        roles: ["verification_reviewer"],
        phases: ["verification"],
      },
    ],
  },
};

const getWorkflowScopes = (access: ToolWorkflowAccess): ToolWorkflowScope[] =>
  access.scopes && access.scopes.length > 0 ? access.scopes : [access];

const normalizeToolWorkflowAccess = (
  tool: ToolInterface<string>,
  scope: ToolExecutionScope | undefined,
): ToolWorkflowAccess | null => {
  const configured = tool.workflow || DEFAULT_WORKFLOW_ACCESS[tool.name];
  if (configured) {
    return configured;
  }

  if (!scope?.agentRole || scope.agentRole !== "controller") {
    return null;
  }

  return {
    scopes: [
      {
        roles: ["controller"],
        phases: ["design", "execution", "verification", "complete"],
      },
    ],
  };
};

export const isToolAllowedForWorkflow = (
  tool: ToolInterface<string>,
  scope?: ToolExecutionScope,
): boolean => {
  if (!scope?.agentRole) {
    return true;
  }

  if (scope.workflowMode === "fast" && scope.agentRole === "controller") {
    return true;
  }

  const access = normalizeToolWorkflowAccess(tool, scope);
  if (!access) {
    return true;
  }

  return getWorkflowScopes(access).some((rule) => {
    if (rule.roles && !rule.roles.includes(scope.agentRole!)) {
      return false;
    }

    if (scope.currentPhase && rule.phases && !rule.phases.includes(scope.currentPhase)) {
      return false;
    }

    return true;
  });
};

export const filterToolsForWorkflow = <T extends ToolInterface<string>>(
  tools: T[],
  scope?: ToolExecutionScope,
): T[] => tools.filter((tool) => isToolAllowedForWorkflow(tool, scope));
