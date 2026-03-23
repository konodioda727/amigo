const WEEKDAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

const pad2 = (value: number): string => String(value).padStart(2, "0");

const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatLocalDateTime = (date: Date): string =>
  `${formatLocalDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;

const formatUtcOffset = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
};

export const appendRuntimeDateTimeContextToUserInput = (
  message: string,
  now: Date = new Date(),
): string => {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const runtimeContext = [
    "[系统自动附加的当前时间信息，仅用于解释这条用户消息中的时间表达]",
    `- 当前本地日期: ${formatLocalDate(now)}`,
    `- 当前本地时间: ${formatLocalDateTime(now)}`,
    `- 当前星期: ${WEEKDAY_NAMES[now.getDay()]}`,
    `- 当前时区: ${timeZone} (UTC${formatUtcOffset(now)})`,
    `- 当前 UTC 时间: ${now.toISOString()}`,
    "解释要求：",
    "1. 用这些时间信息解释这条消息里的“今天/明天/今晚/下周三”等相对时间。",
    "2. 对“6:50”“8点”这类未说明上午/下午的时间，要结合当前时间和语境选择更合理的未来时间。",
    "3. 如果这条消息要求设置一次性提醒或 automation，不要把已经过去的时间设成未来执行时间。",
  ].join("\n");

  const trimmedMessage = message.trim();
  return trimmedMessage ? `${trimmedMessage}\n\n${runtimeContext}` : runtimeContext;
};
