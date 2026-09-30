/**
 * Fill source-site omissions with manually researched, bilingual summaries.
 * Supplements are keyed by show slug so different productions of the same IP
 * cannot accidentally share a synopsis.
 *
 * ★ 覆盖规则（2026-09-29 修订，人工翻译全量补齐后）：
 *   · 中文 —— 本表**永远优先**。源站登记的简介是日文，中文只可能来自
 *     译名表 / 机器翻译 / 本表；既然本表是人工翻译，就不该让机翻盖掉它。
 *     （早先的规则是「scrape 抓到的简介永远胜出」，但那条规则针对的是
 *      源站原文，而源站从来不提供中文 —— 继续沿用它等于让 MyMemory
 *      的译文优先于人工译文，正好反了。）
 *   · 日文 —— **源站优先**，只有源站没登记（summary.ja 为空）时才用本表。
 *
 * ★ 条目的两种形态：
 *   ① { summary: { zh } }                    —— 源站有日文，只需补中文；
 *   ② { summary: { zh, ja } }                —— 源站完全没有简介，双语都由本表提供。
 *
 * ★ 维护提醒：slug 里带的是源站主键（CoRich stage_main_id 或协会站 j25Id），
 *   作品在两个源之间归并成功时 slug 会变（j25Id → mainId）。
 *   补充表失配不会报错，只会静默退回机翻/日文 —— 跑完 scrape 后若看到
 *   「已补充 N 部」比上次少，先检查这里。
 */
export function applySummarySupplements(shows, supplements) {
  let updated = 0;
  for (const show of shows) {
    const supplement = supplements[show.slug];
    if (!supplement?.summary) continue;

    show.summary ??= {};
    let updatedShow = false;
    let updatedSummary = false;

    const titleZh = supplement.title?.zh?.trim();
    if (titleZh && show.title?.zh?.trim() !== titleZh) {
      show.title ??= {};
      show.title.zh = titleZh;
      updatedShow = true;
    }

    /* 日文：源站优先，只有源站没登记时才用补充表 */
    const ja = show.summary.ja?.trim() ?? '';
    if (!ja && supplement.summary.ja?.trim()) {
      show.summary.ja = supplement.summary.ja;
      updatedShow = true;
      updatedSummary = true;
    }

    /* 中文：人工翻译/整理优先于机器翻译 */
    const zh = supplement.summary.zh?.trim();
    if (zh && show.summary.zh?.trim() !== zh) {
      show.summary.zh = zh;
      updatedShow = true;
      updatedSummary = true;
    }

    if (updatedSummary) {
      show.summarySources = [...supplement.sources];
    }
    if (updatedShow) {
      updated++;
    }
  }
  return updated;
}
