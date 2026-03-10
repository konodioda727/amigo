/**
 * 确保输入是数组。如果输入是单个元素、null、undefined 或空字符串，则将其包装成单元素数组或空数组。
 * 解决了 XML 解析器在单元素和多元素列表转换时的不一致性。
 */
export function ensureArray<T>(data: T | T[] | null | undefined | string): T[] {
  if (Array.isArray(data)) {
    return data as T[];
  }
  // 检查 null, undefined, 或空字符串
  if (data === null || data === undefined || data === "") {
    return [];
  }
  // 否则，包装成单元素数组
  return [data as T];
}
