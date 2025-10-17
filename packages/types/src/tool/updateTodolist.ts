import { z } from "zod";

export const TodoListSchema = z.object({
  name: z.literal("updateTodolist"),
  params: z
    .object({
      todolist: z.string().describe("分解后的多步骤待办事项列表。"),
    })
    .describe("包含用户输入和可用工具的参数对象"),
  result: z.string().describe("成功更新待办事项列表"),
});
