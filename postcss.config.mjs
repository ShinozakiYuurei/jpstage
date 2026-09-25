/**
 * Tailwind v4 用独立的 PostCSS 插件包（@tailwindcss/postcss），
 * 不再需要 autoprefixer —— v4 内置了目标浏览器前缀处理。
 *
 * ⚠️ 不要再把 tailwindcss 本身挂进来：v4 的 tailwindcss 包只是 CLI/API，
 *    挂在 PostCSS 插件位会直接报错。
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
