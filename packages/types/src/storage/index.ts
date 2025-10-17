/**
 * 存储类型
 */
export enum StorageType {
  /**
   * 完整消息
   */
  ORIGINAL = "original",
  /**
   * 发送给前端的消息
   */
  FRONT_END = "websocket",
}
