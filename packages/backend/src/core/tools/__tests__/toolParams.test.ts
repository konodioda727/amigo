import { describe, expect, it } from "bun:test";
import { EditFile } from "../editFile";
import { TaskList } from "../taskList/taskList";
import { buildToolParametersSchema, normalizeToolCallParams } from "../toolParams";

describe("toolParams", () => {
  it("supports editFile batch edits as an array of objects", () => {
    const normalized = normalizeToolCallParams({
      toolName: "editFile",
      params: {
        edits: [
          {
            filePath: "/tmp/one.txt",
            oldString: "before",
            newString: "after",
          },
          {
            filePath: "/tmp/two.txt",
            newString: "hello",
          },
        ],
      },
      paramDefinitions: EditFile.params,
    });

    expect(normalized).toEqual({
      edits: [
        {
          filePath: "/tmp/one.txt",
          oldString: "before",
          newString: "after",
        },
        {
          filePath: "/tmp/two.txt",
          newString: "hello",
        },
      ],
    });
  });

  it("builds an object item schema for editFile batch edits", () => {
    const schema = buildToolParametersSchema(EditFile.params);
    const editsSchema = (schema.properties as Record<string, any>).edits;

    expect(editsSchema?.type).toBe("array");
    expect(editsSchema?.items?.type).toBe("object");
    expect(editsSchema?.items?.properties?.filePath?.type).toBe("string");
    expect(editsSchema?.items?.properties?.oldString?.type).toBe("string");
    expect(editsSchema?.items?.properties?.newString?.type).toBe("string");
  });

  it("supports taskList tasks as an array of objects", () => {
    const normalized = normalizeToolCallParams({
      toolName: "taskList",
      params: {
        action: "execute",
        tasks: [
          {
            id: "1.1",
            title: "梳理阶段切换逻辑",
            deps: ["1.0"],
          },
          {
            id: "2.1",
            title: "移除 router 配置入口",
          },
        ],
      },
      paramDefinitions: TaskList.params,
    });

    expect(normalized).toEqual({
      action: "execute",
      tasks: [
        {
          id: "1.1",
          title: "梳理阶段切换逻辑",
          deps: ["1.0"],
        },
        {
          id: "2.1",
          title: "移除 router 配置入口",
        },
      ],
    });
  });

  it("builds an object item schema for taskList tasks", () => {
    const schema = buildToolParametersSchema(TaskList.params);
    const tasksSchema = (schema.properties as Record<string, any>).tasks;

    expect(tasksSchema?.type).toBe("array");
    expect(tasksSchema?.items?.type).toBe("object");
    expect(tasksSchema?.items?.properties?.id?.type).toBe("string");
    expect(tasksSchema?.items?.properties?.title?.type).toBe("string");
    expect(tasksSchema?.items?.properties?.deps?.type).toBe("array");
    expect(tasksSchema?.items?.properties?.deps?.items?.type).toBe("string");
  });
});
