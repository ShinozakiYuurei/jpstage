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
 * WCAG 相对亮度（0 = 黑，1 = 白）
 *
 * ★ 用途：判断某个主色是「亮」还是「暗」，从而决定文字该用深色还是浅色。
 *   为什么不用简单的 (r+g+b)/3：人眼对绿色最敏感、蓝色最不敏感，
 *   算术平均会把 #0000FF（亮蓝，实际很暗）判成与 #808080 一样亮，
 *   于是白色文字被放到亮黄底上 —— 那正是对比度最差的组合之一。
 */
export function relativeLuminance(c: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** 与白色 / 黑色的对比度，取较大者（用于「这块底上文字最多能到多少」） */
export function bestTextContrast(hex: string): { withWhite: number; withBlack: number } {
  const l = relativeLuminance(parseHex(hex));
  const withWhite = 1.05 / (l + 0.05);
  const withBlack = (l + 0.05) / 0.05;
  return { withWhite, withBlack };
}

/**
 * 按比例混合两色（t=0 取 a，t=1 取 b）
 *
 * ★ 用于生成示意海报的渐变：从主色混向近黑，得到「深色调的舞台海报」观感。
 *   直接在主色上加透明度是做不到的 —— 那是「透出背景」，
 *   而海报是不透明的，需要真的算出一个更深的颜色。
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
 * 示意海报的两端颜色
 *
 * ★ 设计意图：没有真实海报时，用作品主色生成一张**看起来像舞台海报**的图，
 *   而不是显示灰色占位方块。理由：
 *   · 灰方块在网格里会让整页显得「坏了一半」，而 2.5 次元公演的
 *     主视觉本来就以大面积单色 + 标题字为主，用主色生成相当接近真实观感；
 *   · 主色本身来自作品（见 data/shows.json 的 accent），因此不同作品的
 *     占位图彼此可区分，用户仍能靠颜色认出「这是哪一部」。
 *
 * ★ 为什么混向近黑而不是混向白：舞台海报绝大多数是深色底 + 亮字，
 *   混向白会得到一张粉彩海报，与真实观感相反。
 */
export function posterGradient(hex: string): { from: string; to: string; ink: string } {
  const base = parseHex(hex);
  const nearBlack = { r: 8, g: 8, b: 12 };
  // 上端保留主色（略提亮 8%），下端压到接近黑 —— 模拟海报的受光与阴影
  const from = mix(base, { r: 255, g: 255, b: 255 }, 0.08);
  const to = mix(base, nearBlack, 0.72);

  /*
   * ★★ 文字色必须按**它实际所在的那一端**判定，而不是按主色 ★★
   *
   *   初版写的是 bestTextContrast(hex)，即拿**主色**判断该用白字还是黑字。
   *   但标题排在**渐变的下端**（深色端），两者并不在同一个亮度上 ——
   *   于是出现了「拿亮色的结论去用在暗底上」的错误：
   *     主色 #E0611A（排球少年!! 的橙）→ 主色上黑字更清楚 → 选黑字
   *     但下端是 rgb(68 33 16) → 黑字只有 **1.37:1**，标题几乎看不见
   *   （实测截图确认，其余 7 个主色恰好都选对了，所以单看代码很难发现。）
   *
   *   修法：拿渐变**下端**（标题所在处）的合成色来判定。
   *   这样 8 个主色全部得到白字（下端都被压到接近黑，白字 14~17:1），
   *   而如果将来某个主色极亮导致下端也偏亮，判定会自动改选黑字 ——
   *   规则仍然成立，不需要人肉维护例外。
   *
   * ★ 为什么还要叠一层底部压暗（见 PosterArt 的渐变）：
   *   上面算的是「渐变下端」的色，而 PosterArt 在下端又叠了 55% 的黑，
   *   实际比这里的 to 更暗 —— 所以按 to 判定出的白字，真实对比度只会更高。
   *   即这个判定是**保守**的（宁可高估背景亮度），方向正确。
   */
  const { withWhite, withBlack } = bestTextContrast(
    '#' + [to.r, to.g, to.b].map((v) => v.toString(16).padStart(2, '0')).join(''),
  );
  const ink = withWhite >= withBlack ? 'rgba(255,255,255,0.94)' : 'rgba(12,12,16,0.92)';
  return { from: toCss(from), to: toCss(to), ink };
}
