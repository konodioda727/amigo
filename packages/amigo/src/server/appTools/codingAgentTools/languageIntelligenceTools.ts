import { defineTool } from "@amigo-llm/backend";
import { getDefaultLanguageIntelligenceService } from "../../languageDiagnostics/languageIntelligenceService";

const service = getDefaultLanguageIntelligenceService();
const parseIncludeDeclaration = (value: unknown): boolean =>
  value === undefined ? true : value === true || value === "true";

export const goToDefinitionTool = defineTool({
  name: "goToDefinition",
  description:
    "基于语言服务精确跳到当前符号的定义位置，适合从一个已知使用点跳到实现、类型定义或导出源头。",
  whenToUse:
    "当你已经知道 symbolName、所在 filePath，以及大致的 line、column 时优先使用。尤其在 TypeScript/Python 诊断、编译报错或现有上下文已经给出 filePath + line + symbolName 时，应先用它从调用点跳到定义；只有在完全没有符号锚点、或当前文件没有可用 LSP server 时，才回退到 bash/rg、listFiles、readFile 做粗搜索。",
  params: [
    {
      name: "filePath",
      optional: false,
      description: "当前符号所在文件路径。",
    },
    {
      name: "symbolName",
      optional: false,
      description: "要查的变量名、函数名、类型名或字段名。",
    },
    {
      name: "line",
      optional: false,
      description: "1-based 近似行号，用来辅助在附近定位 symbolName。",
    },
    {
      name: "column",
      optional: false,
      description: "1-based 近似列号，用来辅助在附近定位 symbolName。",
    },
  ],
  async invoke({ params, context }) {
    const result = await service.goToDefinition({
      taskId: context.parentId || context.taskId,
      filePath: params.filePath,
      symbolName: params.symbolName,
      line: Number(params.line),
      column: Number(params.column),
      conversationContext: context.conversationContext,
    });

    return {
      message: result.message,
      toolResult: {
        success: result.success && result.locations.length > 0,
        filePath: params.filePath,
        symbolName: params.symbolName,
        line: Number(params.line),
        column: Number(params.column),
        anchor: result.anchor || null,
        locations: result.locations,
        message: result.message,
      },
    };
  },
});

export const findReferencesTool = defineTool({
  name: "findReferences",
  description:
    "基于语言服务查找当前符号的引用位置，适合在修改公共函数、类型、字段或导出前确认影响面。",
  whenToUse:
    "当你准备修改共享 API、类型、字段、导出名或行为入口时，优先用它看影响面。只要你已经知道 filePath、symbolName 和大致的 line、column，或诊断/现有上下文已经给出调用点，就应先尝试它；只有在完全没有候选位置、或当前文件没有可用 LSP server 时，才回退到 bash/rg 做粗搜索。",
  params: [
    {
      name: "filePath",
      optional: false,
      description: "当前符号所在文件路径。",
    },
    {
      name: "symbolName",
      optional: false,
      description: "要查的变量名、函数名、类型名或字段名。",
    },
    {
      name: "line",
      optional: false,
      description: "1-based 近似行号，用来辅助在附近定位 symbolName。",
    },
    {
      name: "column",
      optional: false,
      description: "1-based 近似列号，用来辅助在附近定位 symbolName。",
    },
    {
      name: "includeDeclaration",
      optional: true,
      description: "是否包含定义本身，默认 true。",
    },
  ],
  async invoke({ params, context }) {
    const includeDeclaration = parseIncludeDeclaration(params.includeDeclaration);
    const result = await service.findReferences({
      taskId: context.parentId || context.taskId,
      filePath: params.filePath,
      symbolName: params.symbolName,
      line: Number(params.line),
      column: Number(params.column),
      includeDeclaration,
      conversationContext: context.conversationContext,
    });

    return {
      message: result.message,
      toolResult: {
        success: result.success,
        filePath: params.filePath,
        symbolName: params.symbolName,
        line: Number(params.line),
        column: Number(params.column),
        includeDeclaration,
        anchor: result.anchor || null,
        locations: result.locations,
        message: result.message,
      },
    };
  },
});

export const getDiagnosticsTool = defineTool({
  name: "getDiagnostics",
  description:
    "基于语言服务获取当前文件的语义诊断，适合在编辑后确认类型错误、未解析符号和其他编译器错误。",
  whenToUse:
    "当你遇到 TypeScript/Python 编译错误、未解析符号、类型不匹配，或修改完代码后想确认当前文件是否仍有语义错误时使用。它适合先拿到精确的 file/line/symbol 锚点，再决定是否继续用 goToDefinition / findReferences；它不替代 repo 级全文搜索。如果某个文件已经返回 clean，就先把它移出当前修复范围，不要立刻回头重读这个 clean 文件。",
  params: [
    {
      name: "filePath",
      optional: false,
      description: "要检查的文件路径。",
    },
  ],
  async invoke({ params, context }) {
    const host = context.getLanguageRuntimeHost
      ? await context.getLanguageRuntimeHost()
      : undefined;
    if (!host || typeof host !== "object" || !("runCommand" in host)) {
      return {
        message: "当前任务未启用语言服务运行时，无法获取诊断。",
        toolResult: {
          success: false,
          filePath: params.filePath,
          diagnostics: null,
          message: "当前任务未启用语言服务运行时，无法获取诊断。",
        },
      };
    }

    const content = ((await (
      host as { runCommand: (cmd: string) => Promise<string | undefined> }
    ).runCommand(`cat '${String(params.filePath).replace(/'/g, `'\\''`)}'`)) || "") as string;
    const diagnostics = await service.getDiagnostics({
      taskId: context.parentId || context.taskId,
      filePath: params.filePath,
      content,
      conversationContext: context.conversationContext,
    });

    return {
      message: diagnostics?.summary || "未返回诊断结果",
      toolResult: {
        success: Boolean(diagnostics),
        filePath: params.filePath,
        diagnostics: diagnostics || null,
        message: diagnostics?.summary || "未返回诊断结果",
      },
    };
  },
});

export const LANGUAGE_INTELLIGENCE_TOOLS = [
  goToDefinitionTool,
  findReferencesTool,
  getDiagnosticsTool,
] as const;
