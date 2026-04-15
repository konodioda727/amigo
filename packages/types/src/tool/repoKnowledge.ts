import { z } from "zod";

const RepoKnowledgeSectionSchema = z.object({
  id: z.string().describe("section ID"),
  title: z.string().describe("section 标题"),
  summary: z.string().describe("section 摘要"),
  filePath: z.string().describe("section 文件路径"),
  evidenceFiles: z.array(z.string()).describe("该 section 的 evidence 文件列表"),
  updatedAt: z.string().describe("更新时间"),
  lastVerifiedCommit: z.string().nullable().describe("最后验证过的 commit"),
});

const RepoKnowledgeFileSchema = z.object({
  path: z.string().describe("bundle 内文件路径"),
  kind: z.enum(["index", "section", "evidence"]).describe("文件类型"),
  title: z.string().optional().describe("展示标题"),
  summary: z.string().optional().describe("简短摘要"),
});

const RepoKnowledgeManifestSchema = z.object({
  title: z.string().describe("bundle 标题"),
  repoUrl: z.string().describe("仓库 URL"),
  branch: z.string().describe("当前分支"),
  defaultBranch: z.string().nullable().describe("默认分支"),
  version: z.number().int().positive().describe("bundle 版本"),
  updatedAt: z.string().describe("bundle 更新时间"),
  sections: z.array(RepoKnowledgeSectionSchema).describe("section 列表"),
  files: z.array(RepoKnowledgeFileSchema).describe("bundle 文件列表"),
});

export const ReadRepoKnowledgeSchema = z.object({
  name: z.literal("readRepoKnowledge"),
  params: z.object({
    sectionId: z.string().optional().describe("要读取的 section ID，和 filePath 二选一"),
    filePath: z.string().optional().describe("bundle 内相对路径，默认 INDEX.md"),
    startLine: z.number().int().positive().optional().describe("可选起始行号，从 1 开始"),
    endLine: z.number().int().positive().optional().describe("可选结束行号，包含"),
  }),
  result: z.object({
    success: z.boolean().describe("读取是否成功"),
    repoUrl: z.string().describe("仓库 URL"),
    branch: z.string().describe("请求分支"),
    resolvedBranch: z.string().nullable().describe("实际命中的分支，可能回退到默认分支"),
    filePath: z.string().nullable().describe("本次读取的文件路径"),
    startLine: z.number().int().positive().nullable().describe("实际返回起始行"),
    endLine: z.number().int().positive().nullable().describe("实际返回结束行"),
    content: z.string().describe("读取到的正文内容"),
    manifest: RepoKnowledgeManifestSchema.nullable().describe("bundle manifest"),
    message: z.string().describe("结果说明"),
  }),
});

export const UpsertRepoKnowledgeSchema = z.object({
  name: z.literal("upsertRepoKnowledge"),
  params: z.object({
    sectionId: z.string().min(1).describe("要写入的 section ID"),
    title: z.string().min(1).describe("section 标题"),
    summary: z.string().min(1).describe("section 摘要"),
    content: z.string().min(1).describe("section 正文 markdown"),
    evidenceFiles: z
      .array(
        z.object({
          filePath: z.string().min(1).describe("evidence 相对路径"),
          content: z.string().min(1).describe("evidence markdown 正文"),
        }),
      )
      .optional()
      .describe("附带写入的 evidence 文件集合"),
    lastVerifiedCommit: z.string().optional().describe("本次写入对应的最后验证 commit"),
  }),
  result: z.object({
    success: z.boolean().describe("写入是否成功"),
    repoUrl: z.string().describe("仓库 URL"),
    branch: z.string().describe("当前分支"),
    version: z.number().int().positive().describe("写入后的 bundle 版本"),
    updatedFiles: z.array(z.string()).describe("本次更新的文件路径"),
    manifest: RepoKnowledgeManifestSchema.describe("写入后的 manifest"),
    message: z.string().describe("结果说明"),
  }),
});

export type ReadRepoKnowledgeParams = z.infer<typeof ReadRepoKnowledgeSchema>["params"];
export type ReadRepoKnowledgeResult = z.infer<typeof ReadRepoKnowledgeSchema>["result"];
export type UpsertRepoKnowledgeParams = z.infer<typeof UpsertRepoKnowledgeSchema>["params"];
export type UpsertRepoKnowledgeResult = z.infer<typeof UpsertRepoKnowledgeSchema>["result"];
