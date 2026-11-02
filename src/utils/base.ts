function startOfWeekMonday(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - daysFromMonday);
  return start;
}

// 判断当前时间是否在本周内（周一00点重置）
export const isInCurrentWeek = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return false;
  const start = startOfWeekMonday(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return timestamp >= start.getTime() && timestamp < end.getTime();
};

/** 生成 [min,max] 的随机整数 */
export const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** Promise 版 sleep */
export { sleep } from "./helperTaskRunner.js";
