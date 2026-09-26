/**
 * Fill source-site omissions with manually researched, bilingual summaries.
 * A scrape's non-empty summary always wins; supplements are keyed by show slug
 * so different productions of the same IP cannot accidentally share a synopsis.
 */
export function applySummarySupplements(shows, supplements) {
  let updated = 0;
  for (const show of shows) {
    const supplement = supplements[show.slug];
    if (!supplement) continue;
    let filled = false;
    for (const lang of ['zh', 'ja']) {
      if (!show.summary?.[lang]?.trim() && supplement.summary?.[lang]?.trim()) {
        show.summary ??= {};
        show.summary[lang] = supplement.summary[lang];
        filled = true;
      }
    }
    if (filled) {
      show.summarySources = [...supplement.sources];
      updated++;
    }
  }
  return updated;
}
