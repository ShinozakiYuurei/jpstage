'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 多选下拉：点击展开，勾选后不关闭（便于连续多选）
 *
 * 同维度 OR、维度间 AND、选中后不关闭、右侧显示命中数。
 *
 * ===== 这里踩过的四个坑（别再改回去） =====
 *
 * 1. **下拉面板 z-[60]，必须高于顶栏 z-50**
 *    原为 z-40，筛选区滚到顶栏下方时展开菜单会被顶栏遮住一截
 *    （表现为「筛选项顶进 sticky header 下面、叠在一起」）。
 *
 * 2. **遮罩 z-[45]，高于筛选面板 z-40、低于顶栏 z-50**
 *    遮罩只负责拦截面板外的点击。若它也提到 50 以上，
 *    用户在菜单展开时点导航会被遮罩吃掉，表现为「导航点不动」。
 *
 * 3. **菜单和遮罩必须 Portal 到 body**
 *    筛选面板的 backdrop-filter 会成为 fixed 子元素的定位包含块；
 *    不脱离面板时，视口坐标会被当作面板内坐标，造成重复偏移。
 *
 * 4. **菜单用 position:fixed + 实测坐标，不能用 absolute left-0**
 *    手机上筛选区是 2 列网格，右列按钮的左边缘约在 200px，
 *    而菜单宽 256px —— `absolute left-0 w-64` 会向右溢出 66px，
 *    把右侧的命中数直接切掉。
 *    左对齐修不了右列，右对齐又会溢出左列，所以改成：
 *    展开时量按钮的 rect，算出「不越出视窗」的 left 与宽度，用 fixed 定位。
 *    这样左右两列、桌面与手机都用同一套逻辑，不必判断在第几栏。
 */
export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  /** 可选分组标题（如「原作媒體」） */
  group?: string;
}

export function FilterDropdown({
  placeholder,
  options,
  selected,
  onChange,
  /** 无障碍标签：同一页有多个筛选器时，屏幕阅读器需要区分它们 */
  label,
  /** 单选菜单选中后立即收起；默认维持筛选器的多选行为 */
  selectionMode = 'multiple',
}: {
  /** 未选中时的文案（如「所有類型」）；选中多项时自动取「類型 · 3 項」 */
  placeholder: string;
  options: FilterOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
  selectionMode?: 'multiple' | 'single';
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(
    null,
  );
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const has = selected.length > 0;

  /**
   * 量按钮位置 → 算出不越出视窗的 fixed 坐标与可用高度
   *
   * 高度也要算：菜单可能有二十多条选项，在矮屏上展开后会超出下边 ——
   * 固定 max-h-80（320px）并不管「按钮下面只剩多少空间」，
   * 结果靠下的选项直接被切在视窗外。
   *
   * 现在：下方空间够就往下展开；不够就翻到按钮上方；
   * 两边都不够（矮屏）则取空间大的一侧，并把高度限在该侧空间内 ——
   * 无论哪种情形，菜单都完整落在视窗里且可滚动。
   */
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(256, vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));

    const GAP = 6;
    const MARGIN = 8;
    const below = vh - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const flip = below < 200 && above > below;
    /* 高度上限 420px（约 11 项）：再高就不到 1080p 视窗的一半以上，
       显得突兀；320px 又只看得到 8 项，在完全装得下的屏幕上还要滚两次。 */
    const maxH = Math.max(120, Math.min(420, flip ? above : below));
    const top = flip ? Math.max(MARGIN, r.top - GAP - maxH) : r.bottom + GAP;

    setPos({ top, left, width, maxH });
  }, []);

  const openMenu = () => {
    place();
    setOpen(true);
  };

  /**
   * 滚动/缩放：**重新贴合按钮**，而不是关闭菜单
   *
   * ===== 为什么不是「一滚就关」 =====
   *
   * 最初写的是「监听 scroll 就 close」，因为菜单是 position:fixed、
   * 位置是展开时量一次定下来的 —— 页面一滚就会与按钮错位。
   *
   * 但那个策略有三个漏斗，全部都会把菜单意外关掉：
   *   1. **菜单自己的滚动**（选项装不下时必须能滚）——
   *      若用 capture:true，内层 scroll 也传到 window，一滚就自关。
   *      用户看到的就是「无法滑动、选不到下面的项」。
   *   2. **浏览器的 scroll anchoring** —— 选中一项后我们重渲染了清单，
   *      浏览器为了「保持可见内容不跳」会微调页面几个像素，
   *      这也触发 scroll 事件。于是「勾完一项菜单就消失」，多选直接没法用。
   *   3. **focus 引起的滚动** —— 聚焦按钮时浏览器会把元素滚入视口。
   *
   * 与其不断给 close 加例外，不如换方向：**错位就修正位置**。
   * 重跑 place() 用的是按钮**当下**的 rect，所以菜单会一直贴着按钮。
   *
   * 唯一该关的情形是「按钮已完全离开视窗」：那时菜单已经没有锚点，
   * 飘在屏幕中间只会让用户莫名其妙。
   */
  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = (e: Event) => {
      // 菜单自身的滚动不算「页面滚动」—— 那是用户在翻选项，位置不需要修正
      const t = e.target;
      if (t instanceof Node && menuRef.current?.contains(t)) return;

      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // 按钮已完全滚出视窗 → 失去锚点，关闭
      if (r.bottom < 0 || r.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      place();
    };
    window.addEventListener('scroll', onScrollOrResize);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, place]);

  /**
   * ESC 关闭菜单
   *
   * ★ 为什么必须补：菜单原来是「只能再点一次按钮、或点背景层」才能关。
   *   背景层是 aria-hidden 的空 div、不可聚焦 —— 键盘用户
   *   **没有任何办法**关掉它（只能 Tab 回按钮再按一次，
   *   而那还要求用户先想到「再按一次会关」）。
   *   ESC 关浮层是所有平台都有的约定，缺了它等于键盘用户被卡住。
   *
   * ★ 为什么关闭后要把焦点还给按钮：
   *   焦点若停在已经消失的菜单上，浏览器会把它丢回 <body> ——
   *   下一次 Tab 从页面顶部重新开始，而用户原本只是在筛选区里。
   *   还给触发按钮，焦点位置与「菜单没开过」时一致。
   *
   * ★ 为什么监听 document 而不是菜单本身：
   *   焦点可能在菜单里，也可能还在按钮上（开了菜单但没 Tab 进去），
   *   甚至可能在页面别处（开了菜单后点了正文）。
   *   挂在 document 上才保证「只要菜单开着，按 ESC 就一定关」。
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = (v: string) => {
    if (selectionMode === 'single') {
      onChange([v]);
      setOpen(false);
      return;
    }
    onChange(has && selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  };

  /** 「所有 XX」→「XX」，用于「XX · 3 項」的短标签 */
  const short = placeholder.replace(/^(所有|すべての)/, '');

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`relative flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
          has
            ? 'border-accent/60 bg-accent/15 text-fg'
            : 'border-hairline-strong bg-veil text-fg-soft hover:border-hairline-strong hover:bg-veil-strong hover:text-fg'
        }`}
      >
        <span className="truncate font-medium">
          {has
            ? selected.length === 1
              ? (options.find((o) => o.value === selected[0])?.label ?? placeholder)
              : `${short} · ${selected.length}`
            : placeholder}
        </span>
        <svg
          className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[45]" onClick={() => setOpen(false)} aria-hidden />
            <div
              ref={menuRef}
              role="listbox"
              aria-label={label}
              aria-multiselectable={selectionMode === 'multiple' ? true : undefined}
              style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
              className="jp-glass-pop fixed z-[60] overflow-y-auto overscroll-contain rounded-xl p-1.5"
            >
              {options.length === 0 && (
                <p className="px-3 py-2 text-sm text-fg-muted">
                  <span className="i18n-zh">無可選項</span>
                  <span className="i18n-ja">項目がありません</span>
                </p>
              )}

              {options.map((o, i) => {
                const on = selected.includes(o.value);
                // 只在分组标题变化时插一条小标题（第一项若带分组也照样显示）
                const showGroup = !!o.group && o.group !== options[i - 1]?.group;
                return (
                  <div key={o.value}>
                    {showGroup && (
                      <p className="px-3 pb-1 pt-2 text-[11px] font-medium tracking-wide text-fg-dim">
                        {o.group}
                      </p>
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => toggle(o.value)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-veil-strong ${
                        selectionMode === 'single' && on ? 'bg-veil-strong' : ''
                      }`}
                    >
                      {selectionMode === 'multiple' && (
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on ? 'border-accent bg-accent' : 'border-hairline-strong'
                          }`}
                        >
                          {on && (
                            /*
                             * 勾选标记维持纯白：它是「图形物件」（WCAG 1.4.11 要求 3:1），
                             * 而三套主题的强调色都达标 ——
                             *   暗色 #8B7CFF 上的白 3.4:1、浅色 #6B46E5 上的白 5.6:1。
                             */
                            <svg
                              className="h-3 w-3 text-white"
                              viewBox="0 0 10 10"
                              fill="none"
                              aria-hidden
                            >
                              <path
                                d="M2 5L4 7L8 3"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                              />
                            </svg>
                          )}
                        </span>
                      )}
                      <span
                        className={`flex-1 truncate ${on ? 'font-medium text-fg' : 'text-fg-soft'}`}
                      >
                        {o.label}
                      </span>
                      {selectionMode === 'multiple' && o.count !== undefined && (
                        <span className="shrink-0 tabular-nums text-xs text-fg-muted">{o.count}</span>
                      )}
                      {selectionMode === 'single' && on && (
                        <svg
                          className="h-3.5 w-3.5 shrink-0 text-accent"
                          viewBox="0 0 12 12"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M2.5 6L5 8.5L9.5 3.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}

              {has && selectionMode === 'multiple' && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-fg-soft transition hover:bg-veil-strong hover:text-fg"
                >
                  <span className="i18n-zh">清除此項</span>
                  <span className="i18n-ja">この項目をクリア</span>
                </button>
              )}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
