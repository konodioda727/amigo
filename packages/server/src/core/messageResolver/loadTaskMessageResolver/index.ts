import { getGlobalState } from "@/globalState";
import fs from "node:fs";
import path from "node:path";
import { StorageType, type USER_SEND_MESSAGE_NAME } from "@amigo/types";
import BaseMessageResolver from "../base";
import { changeCurrentTaskId } from "@/utils/changeCurrentTaskId";

export class LoadTaskMessageResolver extends BaseMessageResolver<"loadTask"> {
  static override resolverName: USER_SEND_MESSAGE_NAME = "loadTask";
  async process({ taskId }: { taskId: string }) {
    await changeCurrentTaskId(taskId, this.manager);
  }
}
