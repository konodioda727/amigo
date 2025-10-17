import type { GlobalStateType } from "./types";

const globalState: Partial<GlobalStateType> = {};

/**
 * 设置全局状态
 * @param name 属性名
 * @param value 属性值（类型与name对应的属性类型自动匹配）
 */
export const setGlobalState = <K extends keyof GlobalStateType>(
  name: K,
  value: GlobalStateType[K],
) => {
  globalState[name] = value;
};

/**
 * 获取状态
 * @param name 属性名
 * @returns any
 */
export const getGlobalState = <K extends keyof GlobalStateType>(
  name: K,
): Partial<GlobalStateType>[K] => {
  return globalState[name];
};
