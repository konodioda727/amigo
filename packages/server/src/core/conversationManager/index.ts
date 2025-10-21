import type {
  ChatMessage,
  ConversationStatus,
  SERVER_SEND_MESSAGE_NAME,
  ToolInterface,
  TransportToolContent,
  WebSocketMessage,
} from "@amigo/types";
import { SystemMessage } from "@langchain/core/messages";
import type { ServerWebSocket } from "bun";
import pWaitFor from "p-wait-for";
import { systemReservedTags } from "@amigo/types";
import { FilePersistedMemory } from "../memory";
import { getLlm } from "../model";
import { getSystemPrompt } from "../systemPrompt";
import {
  AskFollowupQuestions,
  AssignTasks,
  CompletionResult,
  ToolService,
  UpdateTodolist,
} from "../tools";
import { isWhitespaceOnly } from "@/utils/isWhiteSpaceOnly";
import { v4 as uuidV4 } from "uuid";
import { parseStreamingXml } from "@/utils/parseStreamingXml";

// 模拟 llm 对象，用于流式响应
export const mockLlm = {
  async *stream(_messages: any[]): AsyncIterable<any> {
    yield { content: "好的，我" };
    yield { content: "可以帮助你。正在调用工具" };
    yield {
      content: `
    - 用户请求：我想计划一个去日本的两周旅行，帮我安排机票和酒店。
    - 当前用户定义工具中没有可用工具，则置空 tools 列表。
    <assignTasks>
      <tasklist>
        <task>
          <target>查询北京到上海的往返机票，预算不超过2000元。</target>
          <subAgentPrompt>你是一个专业的机票查询代理，请严格按照用户的要求，查询机票信息。</subAgentPrompt>
          <tools>
            <tool></tool>
          </tools>
        </task>
        <task>
          <target>查找上海静安区评分高于4.5的五星级酒店，并提供预订链接。</target>
          <subAgentPrompt>你是一个专业的酒店预订代理，提供预订链接。</subAgentPrompt>
          <tools>
            <tool></tool>
          </tools>
        </task>
      </todolist>
    </assignTasks>`,
    };
    // yield { content: "<completionResult" };
    // yield { content: ">test128937918273918273</completionResult>" };
  },
};

// 模拟 llm 对象，用于流式响应
export const mockSubLlm = {
  async *stream(_messages: any[]): AsyncIterable<any> {
    yield { content: "<completionResult" };
    yield { content: ">test128937918273918273</completionResult>" };
  },
};

/**
 * 会话管理类
 */
export class ConversationManager {
  private startLabels: string[];
  private endLabels: string[];
  private isAborted: boolean = false;
  private retryCount: number = 0;

  public conversationStatus: ConversationStatus = "idle";
  public connections: ServerWebSocket[] = [];
  public userInput: string = "";

  static taskMapToConversationManager: Record<string, ConversationManager> = {};

  constructor(
    private memory: FilePersistedMemory,
    private toolService: ToolService,
    private llm: any,
    private conversationType: "main" | "sub" = "main",
    private customPrompt?: () => string,
  ) {
    const { startLabels, endLabels } = this.toolService.toolNames.concat(systemReservedTags).reduce(
      (acc, cur) => {
        return {
          startLabels: [...acc.startLabels, `<${cur}>`],
          endLabels: [...acc.endLabels, `</${cur}>`],
        };
      },
      { startLabels: [] as string[], endLabels: [] as string[] },
    );
    ConversationManager.taskMapToConversationManager[this.memory.currentTaskId] = this;
    this.startLabels = startLabels;
    this.endLabels = endLabels;
    this.start();
  }
  public addConnection(ws: ServerWebSocket) {
    this.connections.push(ws);
  }
  public removeConnection(ws: ServerWebSocket) {
    const index = this.connections.indexOf(ws);
    this.connections.splice(index, 1);
  }
  /**
   * 发送消息给该 task 下所有 socket
   * @param 要发送的消息, 类型为 WebSocketMessage<T>
   */
  public emitMessage = <T extends SERVER_SEND_MESSAGE_NAME>({
    type,
    data,
  }: WebSocketMessage<T>) => {
    this.connections.forEach((ws) => {
      ws.send(
        JSON.stringify({
          type,
          data: { ...data, updateTime: (data as any).updateTime || Date.now() },
        } as WebSocketMessage<T>),
      );
    });
  };
  /**
   * 开始会话
   * @param initialMessage 初始消息
   */
  private async start() {
    await pWaitFor(() => !!this.userInput);
    this.conversationStatus = "streaming";
    this._handleStream();
  }

  /**
   * 接受用户新输入
   * @param input 用户输入
   */
  public setUserInput(message: WebSocketMessage<"userSendMessage">) {
    this.userInput = message.data.message;
    this.isAborted = false;
    this.memory.addMessage({
      role: "user",
      content: this.userInput,
      type: "userSendMessage",
      partial: false,
    });
    this.memory.addWebsocketMessage(message);
  }

  // 处理流式响应并解析工具调用
  private async _handleStream(): Promise<void> {
    const controller = new AbortController();
    const { signal } = controller;

    try {
      let systemPrompt = getSystemPrompt(this.toolService, this.conversationType);
      if (this.customPrompt) {
        systemPrompt += `

        =====
        用户自定义提示词:

      ${this.customPrompt()}
        `;
      }
      const stream = await this.llm.stream([new SystemMessage(systemPrompt), ...this.memory.messages], {
        signal,
      });
      const currentTool = await parseStreamingXml({
        stream,
        startLabels: this.startLabels,
        onPartialMessageFound: async (message) => {
          this._postMessage({
            role: "assistant",
            content: message,
            type: "message",
            partial: true,
          });
        },
        onCommonMessageFound: async (message: string) => {
          this._postMessage({
            role: "assistant",
            content: message,
            type: "message",
            partial: false,
          });
        },
        onFullToolCallFound: async (fullToolCall, currentTool, currentType) => {
          this.conversationStatus = "tool_executing";
          // 确保有 partial 输出
          this._postMessage({
            role: "assistant",
            content: JSON.stringify({
              params: this.toolService.parseParams(fullToolCall).params,
              toolName: currentTool,
            } as TransportToolContent<any>),
            originalMessage: fullToolCall,
            type: currentType,
            partial: true,
          });
          const { toolResult, message, params } = await this.toolService.parseAndExecute({
            xmlParams: fullToolCall,
            getCurrentTask: () => this.memory.currentTaskId,
          });
          this._postMessage({
            role: "assistant",
            content: JSON.stringify({
              result: toolResult,
              params,
              toolName: currentTool,
            } as TransportToolContent<any>),
            originalMessage: fullToolCall,
            type: currentType,
            partial: false,
          });
          this.memory.addMessage({
            role: "system",
            content: `当前工具调用：${currentTool}，\n工具执行信息：\n${message}\n`,
            type: currentType,
            partial: false,
          });
        },
        onPartialToolCallFound: async (partialToolCall, currentTool, currentType) => {
          // 正在输出参数, 采用最大化解析的办法, 先输出 partial 的工具调用
          const { params } = this.toolService.parseParams(partialToolCall, true);
          this._postMessage({
            role: "assistant",
            content: JSON.stringify({
              params,
              result: "",
              toolName: currentTool,
            } as TransportToolContent<any>),
            originalMessage: partialToolCall,
            type: currentType,
            partial: true,
          });
        },
        checkShouldAbort: async () => this.isAborted,
      });
      switch (currentTool) {
        case "interrupt":
          console.log("\n会话已通过打断信号结束。");
          this.conversationStatus = "aborted";
          this.userInput = "";
          await pWaitFor(() => !!this.userInput);
          break;
        case "completionResult":
          console.log("\n对话已完成。");
          this.conversationStatus = "completed";
          if (this.conversationType !== "main") {
            return ;
          }
          this.userInput = "";
          await pWaitFor(() => !!this.userInput);
          break;
        case "askFollowupQuestion":
          this.userInput = "";
          await pWaitFor(() => !!this.userInput);
          break;
        default:
          console.log("\n等待用户输入下一轮对话...");
          this.conversationStatus = "idle";
      }
      this._handleStream();
    } catch (error: any) {
      console.error("流式响应过程中出现错误:", error);
      this.emitMessage({
        type: "error",
        data: {
          message: "处理您的请求时发生错误，请重试。",
          details: error.message,
        },
      });
      this.conversationStatus = "error";
      this.userInput = ""; // 重置输入，等待下一次用户交互
    }
  }

  /**
   * 发送消息，并保存
   */
  private _postMessage(message: ChatMessage & { originalMessage?: string }) {
    // 1. 避免模型有时候输出空白字符
    // 2. 避免在 abort 后会发送残留信息
    if (
      (isWhitespaceOnly(message.originalMessage) && isWhitespaceOnly(message.content)) ||
      this.isAborted
    ) {
      return;
    }
    this.memory.addMessage({ ...message, content: message.originalMessage || message.content });
    const lastMessage = this.memory.lastMessage!;
    const requestBody = {
      type: message.type as SERVER_SEND_MESSAGE_NAME,
      data: {
        message: message.content,
        partial: message.partial || false,
        updateTime: lastMessage.updateTime,
        taskId: this.memory.currentTaskId,
      },
    };
    this.emitMessage(requestBody);
    this.memory.addWebsocketMessage(requestBody);
  }

  /**
   * 打断会话
   */
  public interrupt() {
    console.log("会话已被打断。");
    this.isAborted = true;
    this.memory.addMessage({
      role: "assistant",
      content: "用户已打断会话。",
      type: "interrupt",
      partial: false,
    });
    this.memory.addWebsocketMessage({
      type: "interrupt",
      data: {
        taskId: this.memory.currentTaskId,
        updateTime: Date.now().valueOf(),
      },
    });

    // 递归打断所有子任务
    const currentTaskId = this.memory.currentTaskId;
    const managers = Object.values(ConversationManager.taskMapToConversationManager);
    for (const manager of managers) {
      // 子任务的 memory.parentTaskId 等于当前 taskId
      if (
        manager !== this &&
        (manager.memory as any).parentTaskId === currentTaskId &&
        manager.conversationStatus !== "aborted" &&
        manager.conversationStatus !== "completed"
      ) {
        manager.interrupt();
      }
    }
  }

  /**
   * 创建新会话
   */
  static createConversationManager = ({
    taskId,
    fatherTaskId,
    userDefinedTools,
  }: {
    taskId: string;
    fatherTaskId?: string;
    userDefinedTools?: ToolInterface<any>[];
  }) => {
    const memory = new FilePersistedMemory(taskId, fatherTaskId);
    const toolService = new ToolService(
      [AssignTasks, AskFollowupQuestions, CompletionResult, UpdateTodolist],
      userDefinedTools || [],
    );
    const conversationManager = new ConversationManager(memory, toolService, getLlm());

    return conversationManager;
  };

  /**
   * 静态方法：创建并运行子会话，返回最终消息
   */
  static async runSubConversation(props: {
    subPrompt: string;
    target: string;
    parentTaskId: string;
    tools: ToolInterface<any>[];
    index?: number; // 新增 index 参数
  }): Promise<ChatMessage> {
    const { subPrompt, parentTaskId, tools, target, index = 0 } = props;
    const llm = getLlm();
    const subTaskId = uuidV4();
    const toolService = new ToolService([AskFollowupQuestions, CompletionResult], tools);
    const subMemory = new FilePersistedMemory(subTaskId, parentTaskId);
    const subManager = new ConversationManager(subMemory, toolService, llm, "sub", () => subPrompt);

    // 触发子会话输入
    subManager.setUserInput({
      type: "userSendMessage",
      data: { message: target },
    } as any);
    const parentConversationManager =
      ConversationManager.taskMapToConversationManager[parentTaskId];
    if (!parentConversationManager) {
      throw new Error(`未找到父会话管理器，父任务ID：${parentTaskId}`);
    }
    parentConversationManager.emitMessage({
      type: "assignTaskUpdated",
      data: {
        index,
        taskId: subTaskId,
        parentTaskId,
      },
    });
    await pWaitFor(() => subManager.conversationStatus === "completed", {
      timeout: 30 * 60 * 1000,
    });
    console.log(`子会话 ${subTaskId} 已完成。`, subManager.conversationStatus === "completed");
    return subManager.memory.lastMessage!;
  }
}
