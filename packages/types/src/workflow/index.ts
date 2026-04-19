import { z } from "zod";
import type { ChatMessage } from "../websocketMessage";

export const workflowPhaseValues = [
  "requirements",
  "design",
  "execution",
  "verification",
  "complete",
] as const;

export const WorkflowPhaseSchema = z.enum(workflowPhaseValues);
export type WorkflowPhase = z.infer<typeof WorkflowPhaseSchema>;

export const workflowAgentRoleValues = [
  "controller",
  "execution_worker",
  "verification_reviewer",
] as const;

export const WorkflowAgentRoleSchema = z.enum(workflowAgentRoleValues);
export type WorkflowAgentRole = z.infer<typeof WorkflowAgentRoleSchema>;

export const workflowPhaseStatusValues = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const;
export const WorkflowPhaseStatusSchema = z.enum(workflowPhaseStatusValues);
export type WorkflowPhaseStatus = z.infer<typeof WorkflowPhaseStatusSchema>;

export const WorkflowPhaseStateSchema = z.object({
  status: WorkflowPhaseStatusSchema,
  enteredAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export type WorkflowPhaseState = z.infer<typeof WorkflowPhaseStateSchema>;

export const WorkflowSkipRecordSchema = z.object({
  fromPhase: WorkflowPhaseSchema,
  toPhase: WorkflowPhaseSchema,
  reason: z.string(),
  evidence: z.string().optional(),
  skippedAt: z.string(),
});

export type WorkflowSkipRecord = z.infer<typeof WorkflowSkipRecordSchema>;

export const WorkflowCompletionSeedStateSchema = z.object({
  sourceMessageCount: z.number().int().nonnegative(),
  messages: z.array(z.custom<ChatMessage>()),
});

export type WorkflowCompletionSeedState = z.infer<typeof WorkflowCompletionSeedStateSchema>;

export const WorkflowDesignExecutionHandoffSchema = z.object({
  summary: z.string(),
  confirmedFacts: z.array(z.string()),
  constraints: z.array(z.string()),
  implementationPlan: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  sourceResult: z.string().optional(),
});

export type WorkflowDesignExecutionHandoff = z.infer<typeof WorkflowDesignExecutionHandoffSchema>;

export const WorkflowStateSchema = z.object({
  currentPhase: WorkflowPhaseSchema,
  agentRole: WorkflowAgentRoleSchema,
  phaseSequence: z.array(WorkflowPhaseSchema).optional(),
  visitedPhases: z.array(WorkflowPhaseSchema),
  skippedPhases: z.array(WorkflowSkipRecordSchema),
  phaseStates: z.record(WorkflowPhaseSchema, WorkflowPhaseStateSchema),
  completionSeedState: WorkflowCompletionSeedStateSchema.optional(),
  designExecutionHandoff: WorkflowDesignExecutionHandoffSchema.optional(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const WORKFLOW_PHASE_SEQUENCE: WorkflowPhase[] = [
  "requirements",
  "design",
  "execution",
  "verification",
  "complete",
];

export const CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE: WorkflowPhase[] = [
  ...WORKFLOW_PHASE_SEQUENCE,
];
export const EXECUTION_WORKER_PHASE_SEQUENCE: WorkflowPhase[] = ["execution"];
export const VERIFICATION_REVIEWER_PHASE_SEQUENCE: WorkflowPhase[] = ["verification"];

export const normalizeWorkflowPhaseSequence = (
  sequence?: WorkflowPhase[] | null,
  fallback: WorkflowPhase[] = CONTROLLER_DEFAULT_WORKFLOW_PHASE_SEQUENCE,
): WorkflowPhase[] => {
  const deduped = [
    ...new Set(
      (sequence || []).filter((phase): phase is WorkflowPhase =>
        WORKFLOW_PHASE_SEQUENCE.includes(phase),
      ),
    ),
  ];
  return deduped.length > 0 ? deduped : [...fallback];
};

export const getWorkflowPhaseIndex = (
  phase: WorkflowPhase,
  phaseSequence: WorkflowPhase[] = WORKFLOW_PHASE_SEQUENCE,
): number => normalizeWorkflowPhaseSequence(phaseSequence).indexOf(phase);

export const getNextWorkflowPhase = (
  phase: WorkflowPhase,
  phaseSequence: WorkflowPhase[] = WORKFLOW_PHASE_SEQUENCE,
): WorkflowPhase | undefined => {
  const normalizedSequence = normalizeWorkflowPhaseSequence(phaseSequence);
  const currentIndex = getWorkflowPhaseIndex(phase, normalizedSequence);
  if (currentIndex < 0 || currentIndex >= normalizedSequence.length - 1) {
    return undefined;
  }
  return normalizedSequence[currentIndex + 1];
};

export const canAdvanceWorkflowPhase = (
  from: WorkflowPhase,
  to: WorkflowPhase,
  phaseSequence: WorkflowPhase[] = WORKFLOW_PHASE_SEQUENCE,
): boolean => {
  const normalizedSequence = normalizeWorkflowPhaseSequence(phaseSequence);
  const fromIndex = getWorkflowPhaseIndex(from, normalizedSequence);
  const toIndex = getWorkflowPhaseIndex(to, normalizedSequence);
  return fromIndex >= 0 && toIndex >= 0 && toIndex > fromIndex;
};

export const canTransitionWorkflowPhase = (
  from: WorkflowPhase,
  to: WorkflowPhase,
  phaseSequence: WorkflowPhase[] = WORKFLOW_PHASE_SEQUENCE,
): boolean => {
  const normalizedSequence = normalizeWorkflowPhaseSequence(phaseSequence);
  const fromIndex = getWorkflowPhaseIndex(from, normalizedSequence);
  const toIndex = getWorkflowPhaseIndex(to, normalizedSequence);
  return fromIndex >= 0 && toIndex >= 0 && toIndex !== fromIndex;
};
