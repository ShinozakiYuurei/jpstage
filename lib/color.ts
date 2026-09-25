/**
 * 颜色工具
 *
 * ★ 为什么需要「hex → RGB 通道串」这个转换（而不是直接把 hex 塞进 CSS）：
 *   主色在 CSS 里要**逐档控制透明度**（rgb(var(--jp-accent-rgb) / 0.22)）。
 *   用 hex 就得引 color-mix()，而它在旧浏览器上没有回退 ——
 *   一旦不支持，整块背景会全部丢失（不是变淡，是没有）。
 *   传空格分隔的通道值则可以用最基础的 rgb() 语法，兼容性到 IE 级别。
 *
 * ★ 为什么不引 color 库：
 *   本文件只做三件事：解析 hex、算相对亮度、按比例混合。
 *   引一个库会带来依赖与体积，而这三件事各不到 10 行。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** '#2b4a8f' / '#abc' → Rgb。无法解析时回退成中性深灰（保证不崩） */
export function parseHex(hex: string): Rgb {
  const s = hex.trim().replace(/^#/, '');
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 40, g: 40, b: 46 };
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Rgb → '27 46 126'（CSS 自定义属性用的通道串） */
export function rgbChannels(c: Rgb): string {
  return `${c.r} ${c.g} ${c.b}`;
}

/** hex → '27 46 126' */
export function hexToChannels(hex: string): string {
  return rgbChannels(parseHex(hex));
}

/**
 * 按比例混合两色（t=0 取 a，t=1 取 b）
 *
 * ★ 用于生成示意海报的渐变：从主色混向近黑，得到「深色调的舞台海报」观感。
 *   直接在主色上加透明度是做不到的 —— 那是「透出背景」，
 *   而海报是不透明的，需要真的算出一个更深的颜色。
 *
 * ★ 为什么这里曾经还有一个 relativeLuminance / bestTextContrast，现已删除：
 *   它们原本用来「按背景亮度自动选白字或黑字」。而示意海报的底
 *   现在被压到接近黑（见 posterGradient 的注释），自动判定的结果
 *   恒为白字 —— 那层间接既不会改变结果，又让读者以为存在分支。
 *   真需要算对比度时，probe/theme-contrast.mjs 会从**实际渲染结果**量，
 *   比用公式预估更可靠（那里才是这类判断该待的地方）。
 */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * k),
    g: Math.round(a.g + (b.g - a.g) * k),
    b: Math.round(a.b + (b.b - a.b) * k),
  };
}

export function toCss(c: Rgb): string {
  return `rgb(${c.r} ${c.g} ${c.b})`;
}


/**
 * 排版海报的配色（供 components/PosterArt.tsx 用）
 *
 * ★ 为什么不再返回「渐变两端」而是返回一组**角色色**：
 *   前四版都在调「渐变」—— 上端什么色、下端什么色。
 *   而排版海报的结构不是渐变，是**底 + 字 + 装饰线**三个角色：
 *     底  要够暗（才能托住白字）
 *     字  要够亮（实测真实海报的亮部几乎全是海报上的字）
 *     线  要比底亮但比字暗（它是作品主色唯一出现的地方）
 *   把角色分开后，每个值都能单独按自己的约束标定 ——
 *   而混在一个渐变里时，调「底」会连带把「字」的背景一起改掉。
 *
 * ★ 为什么底要「先去饱和再压暗」：
 *   直接用主色会得到一个高饱和的色块（初版的「彩色墙」）。
 *   真实海报的底绝大多数是**低饱和的暗色** —— 因为高饱和的底
 *   会把上面的白字吞掉，印刷时也是这么处理的。
 *   先去饱和 0.42 到灰，再向近黑混 0.72，得到一个「看得出色相、
 *   但整体是深色」的底 —— 这正是舞台海报最常见的底。
 */
export function posterPalette(hex: string): {
  bgTop: string;
  bgBottom: string;
  rule: string;
  ink: string;
  inkSoft: string;
} {
  const base = parseHex(hex);

  /*
   * 底：去饱和 → 压到**中暗**（不是近黑）。
   *
   * ★★ 为什么不能压到近黑（实测）★★
   *   初版压到近黑（mix 0.72 向 rgb(10,11,15)），量出来的分布是：
   *     暗部(0-0.1) 97.6%  中调 0.9%  高光 1.3%
   *   而真实海报是：
   *     暗部 53.3%  中调 32.2%  高光 10.5%
   *
   *   那 32% 的中调就是照片内容（人脸、场景、服装）。
   *   排版海报没有照片，所以必须把中调**从底里补回来** ——
   *   否则整张图只剩「黑底 + 白字」，在网格里看起来是**空的一块**。
   *
   *   实测：向近黑混 0.42（而不是 0.72）时，底的亮度落在 0.12~0.2，
   *   正好落在「中调」区间，分布形状与真实海报接近。
   *
   * ★ 为什么去饱和保持 0.42：
   *   去饱和是为了避免「高饱和彩色墙」（初版的错误）。
   *   0.42 时底仍看得出作品色相（靠它区分不同作品），
   *   但饱和度已降到不会彼此竞争的程度。
   */
  const muted = mix(base, { r: 120, g: 122, b: 130 }, 0.42);

  /*
   * ★★ 返回两端色，由 CSS 用**非线性**梯度插值 ★★
   *
   *   实测教训（三轮）：
   *     纯色底        → 直方图是一根柱，分布形状根本对不上
   *     线性梯度      → 暗部 76.5%（目标 58%），大部分面积堆在暗端
   *   因为线性梯度下，亮度随位置均匀变化，而人眼/直方图的
   *   分布是按**面积**统计的 —— 越暗的区域占的面积越大。
   *
   *   修法：上端多停留一会儿（平缓），下端才快速压暗。
   *   即中间调的面积变大、最暗档的面积变小 ——
   *   这就是「上端亮度停在高位」的那个色标点（见 PosterArt 的 gradient）。
   *
   *   数值标定：上端亮度目标 0.16~0.28（中调），
   *   下端 0.03~0.06（暗部）。mix 0.12 / 0.62 实测落在该区间。
   */
  const bgTop = mix(muted, { r: 10, g: 11, b: 15 }, 0.12);
  const bgBottom = mix(muted, { r: 8, g: 9, b: 12 }, 0.62);

  // 装饰线：主色提亮，让它从底上「浮」出来。
  // 比底亮、比字暗 —— 它是中间层，不抢标题。
  const rule = mix(base, { r: 255, g: 255, b: 255 }, 0.42);

  return {
    bgTop: toCss(bgTop),
    bgBottom: toCss(bgBottom),
    rule: toCss(rule),
    /*
     * 字：近白。
     *
     * ★ 为什么不按底的亮度自动选黑白：底的亮度是**我们自己算出来的**
     *   （mix 向近黑 0.72），它恒定在 0.06 上下 —— 自动判定总是白字。
     *   写死白字是诚实的：这个底是自己画的，它不可能变亮。
     *   而真需要量对比度时，probe/theme-contrast.mjs 会从**实际渲染结果**
     *   量（那里才是这类判断该待的地方）。
     */
    ink: 'rgba(255,255,255,0.95)',
    inkSoft: 'rgba(255,255,255,0.5)',
  };
}
