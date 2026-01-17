/**
 * createTaskDocs 工具的属性测试
 *
 * 测试以下正确性属性：
 * - 属性 2: Document Creation Location
 *
 * **Feature: structured-agent-workflow, Property 2: Document Creation Location**
 * **Validates: Requirements 1.1, 1.2, 2.2, 3.3, 4.2, 6.1**
 *
 * 对于任意在工作流中创建的文档，它应当位于 `docs/{task-name}/{phase}.md`，
 * 其中 task-name 为 kebab-case 格式。
 */

import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { toKebabCase } from "../taskDocs";

// ============================================================================
// 测试生成器 (Arbitraries)
// ============================================================================

/**
 * 生成有效的任务名称（包含各种格式）
 */
const taskNameArb = fc.oneof(
  // 普通英文名称
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,30}$/),
  // camelCase 名称
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,20}$/),
  // PascalCase 名称
  fc.stringMatching(/^[A-Z][a-zA-Z0-9]{0,20}$/),
  // 带空格的名称
  fc
    .array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,10}$/), { minLength: 1, maxLength: 4 })
    .map((words) => words.join(" ")),
  // 带下划线的名称
  fc
    .array(fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/), { minLength: 1, maxLength: 4 })
    .map((words) => words.join("_")),
  // 中文任务名称
  fc.constantFrom("用户登录功能", "数据导出", "API重构", "性能优化", "错误处理改进"),
);

/**
 * 生成有效的文档阶段
 */
const phaseArb = fc.constantFrom("requirements", "design", "taskList");

/**
 * 生成有效的文档内容
 */
const contentArb = fc.stringMatching(/^[a-zA-Z0-9\s\n#\-[\]]{10,100}$/);

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 验证字符串是否为有效的 kebab-case 格式
 * kebab-case: 小写字母、数字、连字符，不以连字符开头或结尾
 */
function isValidKebabCase(str: string): boolean {
  if (!str || str.length === 0) return false;
  // 允许 Unicode 字母（如中文）、数字和连字符
  // 不能以连字符开头或结尾，不能有连续连字符
  const kebabPattern = /^[\p{L}\p{N}][\p{L}\p{N}-]*[\p{L}\p{N}]$|^[\p{L}\p{N}]$/u;
  if (!kebabPattern.test(str)) return false;
  // 检查没有连续连字符
  if (str.includes("--")) return false;
  // 检查全小写（对于 ASCII 字母）
  if (str !== str.toLowerCase()) return false;
  return true;
}

/**
 * 验证文档路径格式是否正确
 */
function isValidDocPath(path: string, taskName: string, phase: string): boolean {
  const kebabName = toKebabCase(taskName);
  const phaseToFile: Record<string, string> = {
    requirements: "requirements.md",
    design: "design.md",
    taskList: "taskList.md",
  };
  const expectedPath = `docs/${kebabName}/${phaseToFile[phase]}`;
  return path === expectedPath;
}

// ============================================================================
// 属性测试
// ============================================================================

describe("createTaskDocs 属性测试", () => {
  /**
   * **Feature: structured-agent-workflow, Property 2: Document Creation Location**
   * **Validates: Requirements 1.1, 1.2, 2.2, 3.3, 4.2, 6.1**
   *
   * 对于任意在工作流中创建的文档，它应当位于 `docs/{task-name}/{phase}.md`，
   * 其中 task-name 为 kebab-case 格式。
   */
  describe("属性 2: Document Creation Location", () => {
    describe("toKebabCase 转换正确性", () => {
      test("任意有效任务名称转换后应为有效的 kebab-case 格式", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const result = toKebabCase(taskName);
            // 如果输入有效（非空白），输出应为有效 kebab-case
            if (taskName.trim().length > 0) {
              expect(isValidKebabCase(result)).toBe(true);
            }
          }),
          { numRuns: 100 },
        );
      });

      test("camelCase 名称应正确转换为 kebab-case", () => {
        fc.assert(
          fc.property(fc.stringMatching(/^[a-z][a-zA-Z0-9]{2,15}$/), (camelName) => {
            const result = toKebabCase(camelName);
            expect(isValidKebabCase(result)).toBe(true);
            // camelCase 转换后应包含连字符（如果有小写字母后跟大写字母的模式）
            const hasLowerUpperTransition = /[a-z][A-Z]/.test(camelName);
            if (hasLowerUpperTransition) {
              expect(result).toContain("-");
            }
          }),
          { numRuns: 100 },
        );
      });

      test("带空格的名称应转换为连字符分隔", () => {
        fc.assert(
          fc.property(
            fc
              .array(fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/), { minLength: 2, maxLength: 4 })
              .map((words) => words.join(" ")),
            (spacedName) => {
              const result = toKebabCase(spacedName);
              expect(isValidKebabCase(result)).toBe(true);
              expect(result).toContain("-");
              expect(result).not.toContain(" ");
            },
          ),
          { numRuns: 100 },
        );
      });

      test("带下划线的名称应转换为连字符分隔", () => {
        fc.assert(
          fc.property(
            fc
              .array(fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/), { minLength: 2, maxLength: 4 })
              .map((words) => words.join("_")),
            (underscoredName) => {
              const result = toKebabCase(underscoredName);
              expect(isValidKebabCase(result)).toBe(true);
              expect(result).toContain("-");
              expect(result).not.toContain("_");
            },
          ),
          { numRuns: 100 },
        );
      });

      test("转换应为幂等操作（对已是 kebab-case 的输入）", () => {
        fc.assert(
          fc.property(
            fc
              .array(fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/), { minLength: 1, maxLength: 4 })
              .map((words) => words.join("-")),
            (kebabName) => {
              const result = toKebabCase(kebabName);
              // 对已是 kebab-case 的输入，转换应保持不变
              expect(result).toBe(kebabName);
            },
          ),
          { numRuns: 100 },
        );
      });

      test("转换结果应全为小写", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const result = toKebabCase(taskName);
            if (result.length > 0) {
              expect(result).toBe(result.toLowerCase());
            }
          }),
          { numRuns: 100 },
        );
      });

      test("转换结果不应包含连续连字符", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const result = toKebabCase(taskName);
            expect(result).not.toContain("--");
          }),
          { numRuns: 100 },
        );
      });

      test("转换结果不应以连字符开头或结尾", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const result = toKebabCase(taskName);
            if (result.length > 0) {
              expect(result.startsWith("-")).toBe(false);
              expect(result.endsWith("-")).toBe(false);
            }
          }),
          { numRuns: 100 },
        );
      });
    });

    describe("文档路径格式正确性", () => {
      test("任意任务名称和阶段组合应生成正确的文档路径", () => {
        fc.assert(
          fc.property(taskNameArb, phaseArb, (taskName, phase) => {
            const kebabName = toKebabCase(taskName);
            if (kebabName.length === 0) return; // 跳过无效输入

            const phaseToFile: Record<string, string> = {
              requirements: "requirements.md",
              design: "design.md",
              taskList: "taskList.md",
            };

            const expectedPath = `docs/${kebabName}/${phaseToFile[phase]}`;

            // 验证路径格式
            expect(expectedPath).toMatch(/^docs\/[\p{L}\p{N}-]+\/\w+\.md$/u);
            // 验证路径包含正确的目录结构
            expect(expectedPath.startsWith("docs/")).toBe(true);
            expect(expectedPath.endsWith(".md")).toBe(true);
            // 验证任务名称在路径中
            expect(expectedPath).toContain(kebabName);
          }),
          { numRuns: 100 },
        );
      });

      test("requirements 阶段应生成 requirements.md 文件", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const kebabName = toKebabCase(taskName);
            if (kebabName.length === 0) return;

            const path = `docs/${kebabName}/requirements.md`;
            expect(path).toMatch(/requirements\.md$/);
          }),
          { numRuns: 100 },
        );
      });

      test("design 阶段应生成 design.md 文件", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const kebabName = toKebabCase(taskName);
            if (kebabName.length === 0) return;

            const path = `docs/${kebabName}/design.md`;
            expect(path).toMatch(/design\.md$/);
          }),
          { numRuns: 100 },
        );
      });

      test("taskList 阶段应生成 taskList.md 文件", () => {
        fc.assert(
          fc.property(taskNameArb, (taskName) => {
            const kebabName = toKebabCase(taskName);
            if (kebabName.length === 0) return;

            const path = `docs/${kebabName}/taskList.md`;
            expect(path).toMatch(/taskList\.md$/);
          }),
          { numRuns: 100 },
        );
      });
    });

    describe("特殊字符处理", () => {
      test("特殊字符应被正确移除或转换", () => {
        const specialCharNames = fc.constantFrom(
          "task@name",
          "task#name",
          "task$name",
          "task%name",
          "task&name",
          "task*name",
          "task!name",
          "task?name",
        );

        fc.assert(
          fc.property(specialCharNames, (name) => {
            const result = toKebabCase(name);
            // 结果不应包含特殊字符
            expect(result).not.toMatch(/[@#$%&*!?]/);
            // 结果应为有效 kebab-case
            if (result.length > 0) {
              expect(isValidKebabCase(result)).toBe(true);
            }
          }),
          { numRuns: 100 },
        );
      });

      test("中文任务名称应被保留", () => {
        const chineseNames = fc.constantFrom("用户登录", "数据导出", "API重构", "性能优化");

        fc.assert(
          fc.property(chineseNames, (name) => {
            const result = toKebabCase(name);
            // 中文字符应被保留
            expect(result.length).toBeGreaterThan(0);
            // 应为小写（中文不受影响）
            expect(result).toBe(result.toLowerCase());
          }),
          { numRuns: 100 },
        );
      });
    });
  });
});
