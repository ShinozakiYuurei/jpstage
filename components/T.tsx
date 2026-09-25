import type { LocalizedText } from '@/lib/types';

/**
 * 双语文字（服务端组件，零客户端 JS）
 *
 * 用法：<T t={show.title} /> —— 两种语言都渲染，由 CSS 决定显示哪一种
 * （机制与理由见 app/globals.css 的「双语显示机制」注释块）。
 *
 * ★ 为什么做成组件而不是让调用方自己写两个 span：
 *   1. 漏写一种语言是最容易发生的错误，而且**在中文模式下完全看不出来**
 *      （日语那段被 display:none 藏住了）—— 只有日语用户会发现页面缺字。
 *      收进组件后，类型系统保证必须传完整二元组。
 *   2. 两个 span 的类名必须严格成对（.i18n-zh / .i18n-ja），
 *      手写时错一个字母就静默失效。组件里写一次即可。
 *
 * ★ as 属性为什么存在：双语文字的**外层标签**往往有语义或布局作用
 *   （h1/h2/span/p/div）。若组件固定渲染 <span>，调用方就得在外层再包一层，
 *   于是 DOM 里出现「span 套 span」的噪音，且外层 span 会破坏
 *   grid/flex 的直接子元素选择器。
 *   这里把标签名交给调用方，组件的职责收窄到「只负责双语」这一件事。
 */
export function T({
  t,
  as: Tag = 'span',
  className,
}: {
  t: LocalizedText;
  /** 外层标签。默认 span；标题类用 'h1'/'h2'，段落用 'p'，块级容器用 'div' */
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'li';
  className?: string;
}) {
  return (
    <Tag className={className}>
      <span className="i18n-zh">{t.zh}</span>
      <span className="i18n-ja">{t.ja}</span>
    </Tag>
  );
}
