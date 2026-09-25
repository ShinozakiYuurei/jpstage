import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 类名合并
 *
 * ★ 为什么必须是 twMerge 而不是简单的 clsx：
 *   本站的主题大量依赖「调用方覆写组件默认类」（例如按钮默认 px-4 py-2，
 *   某个位置想改成 px-2 py-1）。clsx 只做拼接，两组 padding 会同时留在
 *   class 里，谁生效取决于**产物 CSS 的顺序**而不是书写顺序 ——
 *   表现为「明明写在后面却没生效」，且随构建产物漂移，极难排查。
 *   twMerge 认识 Tailwind 的类语义，冲突时保留最后一个。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
