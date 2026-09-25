'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_LANG, HTML_LANG, LANG_LABEL, LANGS, isLang } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

/**
 * 语言切换（顶栏，中文 / 日本語）
 *
 * 与 ThemeToggle 同构：启动脚本在首次绘制前设好 <html data-lang>，
 * 这里只负责改写它并记住选择。UI 上是**两个并列的按钮**而不是一颗
 * 循环切换的图标 —— 语言只有两种，直接列出比「点一下猜一次」清楚得多，
 * 而且用户能看到「现在在哪一种」。
 *
 * ===== 为什么状态判定读 DOM 而不是 React state =====
 *
 * 与主题同一个理由（见 ThemeToggle 的长注释）：
 * 语言是**执行期**才知道的（localStorage / 首次访问默认值），
 * 服务端渲染时只能假设一个默认值。若用 useState + useEffect 读出来，
 * 服务端画「中文选中」、hydrate 后变成「日本語选中」——
 * 用户会看到选中态跳一下。
 *
 * 这里改为：按钮的选中态由 CSS 依 html[data-lang] 决定
 * （见 globals.css 的 .jp-lang-btn 规则），React state 只用于
 * 切换时的过渡锁。于是服务端与客户端渲染的 HTML 完全相同，
 * 不可能 mismatch，首屏选中态也一定是正确的。
 */

/** 目前实际生效的语言（以 <html> 上的 data-lang 为唯一事实来源）
 *
 * ★ 为什么用 isLang 校验而不是直接比较 'ja'：
 *   data-lang 理论上只可能是 'zh' / 'ja'（构建时写死的默认值 + 启动脚本），
 *   但它是**可被外部修改的 DOM 属性** —— 浏览器扩展、用户手动改、
 *   或未来某次改动写入了一个未知值时，直接比较会静默地把它当作中文，
 *   而校验后回退到 DEFAULT_LANG 是同一个结果、但意图明确。
 *   更重要的是：有这一道校验，`Lang` 类型就真的是被守卫的，
 *   而不是靠「我们相信 DOM 是对的」。
 */
function currentLang(): Lang {
  const v = document.documentElement.dataset.lang;
  return isLang(v) ? v : DEFAULT_LANG;
}

/** 把语言写进 DOM */
export function applyLang(lang: Lang) {
  document.documentElement.dataset.lang = lang;
  /*
   * ★ lang 属性必须同步：它影响浏览器的断行规则（CJK 与拉丁文的换行点不同）、
   *   字体回退（:lang() 选择器）、以及屏幕阅读器的发音。
   *   只改 data-lang 不改 lang，会得到「页面显示日文、但按中文规则断行」
   *   这种半对状态 —— 表现为日文长标题在奇怪的位置换行。
   */
  document.documentElement.lang = HTML_LANG[lang];
}

export function LangToggle() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  /* 首次挂载时对齐一次：启动脚本已设好 data-lang，但 lang 属性
   * （<html lang>）是服务端渲染的默认值，需要按实际语言同步。 */
  useEffect(() => {
    applyLang(currentLang());
  }, []);

  const choose = (lang: Lang) => {
    if (lock.current || currentLang() === lang) return;
    lock.current = true;
    setBusy(true);
    applyLang(lang);
    try {
      localStorage.setItem('jp-lang', lang);
    } catch {
      /* Safari 隐私模式下 localStorage 会抛错 —— 忽略即可，
         语言切换本身已经生效，只是这次选择不会被记住。 */
    }
    /* 解锁：不等待任何过渡。语言切换是纯 CSS 显隐，改完属性就已经生效。 */
    requestAnimationFrame(() => {
      lock.current = false;
      setBusy(false);
    });
  };

  return (
    <div className="jp-lang-toggle" role="group" aria-label="語言 / 言語">
      {/*
       * ★ 语言列表与标签从 lib/i18n.ts 读，不在这里写死：
       *   写死会让「支持哪些语言」这件事有两份定义，而它们必然漂移 ——
       *   表现为某个语言在切换器里能点，但 lib/data.ts 里没有对应数据。
       */}
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          data-lang-btn={lang}
          onClick={() => choose(lang)}
          aria-disabled={busy}
          className="jp-lang-btn"
          title={
            lang === 'zh'
              ? '切換至中文'
              : '日本語に切り替え'
          }
        >
          {LANG_LABEL[lang]}
        </button>
      ))}
    </div>
  );
}
