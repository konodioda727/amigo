/**
 * 判断是否为本地测试
 * @returns true if the current host is localhost
 */
export const isLocalhost = () => {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
};
