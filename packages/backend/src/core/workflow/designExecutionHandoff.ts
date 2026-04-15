import type { WorkflowDesignExecutionHandoff } from "@amigo-llm/types";

const REQUIRED_DESIGN_HANDOFF_SECTIONS = ["已确认事实", "关键约束", "实施计划"] as const;
const OPTIONAL_DESIGN_HANDOFF_SECTIONS = ["未决问题"] as const;
const DESIGN_HANDOFF_SECTIONS = [
  ...REQUIRED_DESIGN_HANDOFF_SECTIONS,
  ...OPTIONAL_DESIGN_HANDOFF_SECTIONS,
] as const;

type DesignHandoffSectionName = (typeof DESIGN_HANDOFF_SECTIONS)[number];

const normalizeLine = (value: string): string =>
  value
    .replace(/^\s*[-*+]\s*/, "")
    .replace(/^\s*\d+\.\s*/, "")
    .trim();

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const extractSectionBody = (markdown: string, title: DesignHandoffSectionName): string | null => {
  const headingPattern = /^##\s+(.+?)\s*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const heading = match?.[1]?.trim();
    if (heading !== title || typeof match?.index !== "number") {
      continue;
    }

    const bodyStart = match.index + match[0].length;
    const nextHeadingStart =
      typeof matches[index + 1]?.index === "number" ? matches[index + 1]!.index! : markdown.length;
    return markdown.slice(bodyStart, nextHeadingStart).trim() || null;
  }

  return null;
};

const parseSectionItems = (body: string | null): string[] => {
  if (!body) return [];

  const lines = body.split(/\r?\n/).map(normalizeLine).filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  return lines;
};

const normalizeOpenItems = (items: string[]): string[] => {
  if (items.length === 0) {
    return [];
  }

  const singleValue = collapseWhitespace(items.join(" "));
  if (/^(无|没有|none|n\/a|na|nil)$/i.test(singleValue)) {
    return [];
  }

  return items.filter((item) => !/^(无|没有|none|n\/a|na|nil)$/i.test(collapseWhitespace(item)));
};

export const DESIGN_EXECUTION_HANDOFF_SECTION_TITLES = [...DESIGN_HANDOFF_SECTIONS];

export type ParseDesignExecutionHandoffResult =
  | {
      ok: true;
      handoff: WorkflowDesignExecutionHandoff;
    }
  | {
      ok: false;
      errors: string[];
    };

export const parseDesignExecutionHandoff = ({
  summary,
  result,
}: {
  summary: string;
  result: string;
}): ParseDesignExecutionHandoffResult => {
  const sectionBodies = Object.fromEntries(
    DESIGN_HANDOFF_SECTIONS.map((section) => [section, extractSectionBody(result, section)]),
  ) as Record<DesignHandoffSectionName, string | null>;

  const missingSections = REQUIRED_DESIGN_HANDOFF_SECTIONS.filter(
    (section) => !sectionBodies[section],
  );
  if (missingSections.length > 0) {
    return {
      ok: false,
      errors: [
        `design 阶段的 completeTask.result 缺少必填章节：${missingSections
          .map((section) => `## ${section}`)
          .join("、")}。`,
      ],
    };
  }

  const confirmedFacts = parseSectionItems(sectionBodies.已确认事实);
  const constraints = parseSectionItems(sectionBodies.关键约束);
  const implementationPlan = parseSectionItems(sectionBodies.实施计划);
  const unresolvedQuestions = normalizeOpenItems(parseSectionItems(sectionBodies.未决问题));

  const errors: string[] = [];
  if (confirmedFacts.length === 0) {
    errors.push("`## 已确认事实` 不能为空，必须写清已经核实过的事实。");
  }
  if (constraints.length === 0) {
    errors.push("`## 关键约束` 不能为空，必须写清执行时必须遵守的限制。");
  }
  if (implementationPlan.length === 0) {
    errors.push("`## 实施计划` 不能为空，必须写清 execution 阶段的直接起手动作。");
  }
  if (unresolvedQuestions.length > 0) {
    errors.push(
      `design 仍有未决问题：${unresolvedQuestions.join("；")}。请先继续 design 收敛，不要进入 execution。`,
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    handoff: {
      summary: summary.trim(),
      confirmedFacts,
      constraints,
      implementationPlan,
      unresolvedQuestions,
      sourceResult: result.trim(),
    },
  };
};

export const buildDesignExecutionHandoffLines = (
  handoff: WorkflowDesignExecutionHandoff | undefined,
): string[] => {
  if (!handoff) {
    return [];
  }

  return [
    "设计交接：",
    `- 设计摘要：${handoff.summary}`,
    "- 已确认事实：",
    ...handoff.confirmedFacts.map((item) => `  - ${item}`),
    "- 关键约束：",
    ...handoff.constraints.map((item) => `  - ${item}`),
    "- 实施计划：",
    ...handoff.implementationPlan.map((item) => `  - ${item}`),
    handoff.unresolvedQuestions.length > 0
      ? "- 未决问题："
      : "- 未决问题：已收敛。若真实文件与交接冲突，只补最小必要证据后立即推进修改。",
    ...(handoff.unresolvedQuestions.length > 0
      ? handoff.unresolvedQuestions.map((item) => `  - ${item}`)
      : []),
  ];
};
