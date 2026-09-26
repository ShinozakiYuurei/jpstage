import { getMeta, SOURCE_NAME } from '@/lib/data';

/**
 * 页脚
 *
 * ★ 为什么「資料來源」与「最後更新」必须显式列出：
 *   本站是聚合站，所有资讯都来自他处。用户需要知道
 *   「这个日期是谁说的、有多新」才能判断能不能信。
 *   这也是 hkmovie 的做法（它列出各院线名 + 更新时间 + 条目数）。
 *
 * ★ 为什么要有「如權利人認為內容不當，請聯絡我們移除」这一条：
 *   聚合 2.5 次元公演资讯会涉及官方主视觉、演员名单等。
 *   这一条是给权利人的下架通道，也是本站「非官方、无隶属关系」
 *   这一立场的明确表达 —— 少写这一句，站点的性质就会显得含糊。
 */
export function SiteFooter({ updated }: { updated: string }) {
  const meta = getMeta();

  return (
    <footer className="mt-16 border-t border-hairline px-4 py-8 text-xs leading-relaxed text-fg-dim">
      <div className="mx-auto max-w-7xl space-y-2">
        <p>
          <span className="i18n-zh">
            本站為日本 2.5 次元舞台劇、音樂劇公演資訊的聚合服務。所有日程、會場及出演者資訊
            均整理自官方網站與公開資訊，僅供參考；實際演出內容、日程變更及售票狀況
            請以各公演官方網站公布為準。
          </span>
          <span className="i18n-ja">
            本サイトは日本国内の2.5次元舞台・ミュージカル公演情報をまとめたアグリゲーションサービスです。
            掲載している日程・会場・出演者情報は公式サイトおよび公開情報を整理したものであり、
            参考情報として提供しています。実際の公演内容・日程変更・チケット状況は
            各公演の公式サイトでご確認ください。
          </span>
        </p>
        <p>
          <span className="i18n-zh">
            本站與各公演主辦單位、製作委員會無隸屬關係。如權利人認為內容不當，請聯絡我們移除。
          </span>
          <span className="i18n-ja">
            本サイトは各公演の主催者・製作委員会とは関係ありません。
            権利者の方が不適切とお考えの場合は、ご連絡いただければ削除いたします。
          </span>
        </p>
        <p className="pt-2">
          <span className="i18n-zh">資料來源：</span>
          <span className="i18n-ja">データ出典：</span>
          {/*
           * ★ 来源名必须按语言分别渲染（与全站一致）。
           *   初版直接把数据层拼好的字符串插进来，于是日文模式下
           *   显示「データ出典：示範資料」—— 前半句切了语言，后半句没切。
           *   这种「半句切了、半句没切」是最典型的双语破口：
           *   看代码时两段都是普通字符串，很难看出其中一个不会变。
           */}
          {meta.sources.map((s, i) => (
            <span key={s}>
              {i > 0 && '、'}
              <span className="i18n-zh">{(SOURCE_NAME[s] ?? { zh: s }).zh}</span>
              <span className="i18n-ja">{(SOURCE_NAME[s] ?? { ja: s }).ja}</span>
            </span>
          ))}
          {' · '}
          <span className="i18n-zh">最後更新</span>
          <span className="i18n-ja">最終更新</span> {updated}
          {' · '}
          <span className="i18n-zh">
            共 {meta.counts.shows} 部公演 / {meta.counts.now} 部上演中 /{' '}
            {meta.counts.upcoming} 部即將開演
          </span>
          <span className="i18n-ja">
            全 {meta.counts.shows} 公演 / 上演中 {meta.counts.now} / 開幕予定{' '}
            {meta.counts.upcoming}
          </span>
          {' · '}
          {meta.counts.venues}
          <span className="i18n-zh"> 個會場</span>
          <span className="i18n-ja"> 会場</span>
          {' · '}
          {meta.counts.series}
          <span className="i18n-zh"> 個系列</span>
          <span className="i18n-ja"> シリーズ</span>
        </p>
      </div>
    </footer>
  );
}
