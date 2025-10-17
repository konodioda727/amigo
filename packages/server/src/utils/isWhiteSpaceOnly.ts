/**
 * 检查字符串是否仅包含空白字符或为空。
 * @param str 要检查的字符串。
 * @returns {boolean} 如果字符串只包含空白字符或为空，则返回 true。
 */
export function isWhitespaceOnly(str: string | undefined): boolean {
  if (typeof str !== "string" || str.length === 0) {
    return true; // 空字符串或非字符串被视为无效内容
  }
  // 使用 trim() 移除两端空白，然后检查长度
  return str.trim().length === 0;
}