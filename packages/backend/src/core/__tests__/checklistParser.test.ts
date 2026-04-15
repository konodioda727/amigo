import { describe, expect, it } from "bun:test";
import {
  getTaskId,
  parseChecklist,
  parseDependenciesFromDescription,
  parseDesignSectionRefsFromDescription,
  parseFileRefsFromDescription,
} from "@/core/templates/checklistParser";

describe("parseDependenciesFromDescription", () => {
  it("treats '[deps: none]' as no dependencies", () => {
    expect(parseDependenciesFromDescription("Task 1.0: 初始化项目 [deps: none]")).toEqual([]);
  });

  it("treats localized empty markers as no dependencies", () => {
    expect(parseDependenciesFromDescription("Task 1.0: 初始化项目 [deps: 无]")).toEqual([]);
    expect(parseDependenciesFromDescription("Task 1.0: 初始化项目 [deps: 暂无]")).toEqual([]);
  });

  it("keeps real dependency ids and removes empty sentinels mixed in", () => {
    expect(
      parseDependenciesFromDescription(
        "Task build-page: 集成页面 [deps: Task init-repo, none, T1]",
      ),
    ).toEqual(["init-repo", "T1"]);
  });
});

describe("parseChecklist", () => {
  it("extracts alphanumeric task ids", () => {
    expect(getTaskId("Task T1: 初始化项目")).toBe("T1");
    expect(getTaskId("Task init-repo: 初始化项目")).toBe("init-repo");
  });

  it("does not attach fake dependency ids for root tasks", () => {
    const items = parseChecklist("- [ ] Task 1.0: 初始化项目 [deps: none]").items;
    expect(items[0]?.dependencies).toEqual([]);
  });

  it("parses design section anchors from task lines", () => {
    expect(
      parseDesignSectionRefsFromDescription(
        "Task 2.0: 实现变更 [designSections: #Technical Decisions, #Ownership]",
      ),
    ).toEqual(["#Technical Decisions", "#Ownership"]);

    const items = parseChecklist(
      "- [ ] Task 2.0: 实现变更 [deps: Task 1.0] [designSections: #Technical Decisions, #Ownership]",
    ).items;
    expect(items[0]?.designSectionRefs).toEqual(["#Technical Decisions", "#Ownership"]);
  });

  it("parses bound file refs from task lines", () => {
    expect(
      parseFileRefsFromDescription(
        "Task 2.1: 修改实现 [files: src/foo.ts, src/foo.test.ts, `src/bar.ts`]",
      ),
    ).toEqual(["src/foo.ts", "src/foo.test.ts", "src/bar.ts"]);

    const items = parseChecklist(
      "- [ ] Task 2.1: 修改实现 [designSections: #Technical Decisions] [files: src/foo.ts, src/foo.test.ts]",
    ).items;
    expect(items[0]?.fileRefs).toEqual(["src/foo.ts", "src/foo.test.ts"]);
  });
});
