/**
 * 演示数据提示条
 *
 * ★ 为什么需要它（而不是把「这是示例数据」写在 README 里就算了）：
 *   本站当前的公演日程是**手写的示范数据**，不是真实抓取结果。
 *   若不在页面上明示，任何看到这个站的人都会把「2026-10-03 开演」
 *   当成真实信息 —— 而 2.5 次元的公演日程是会被拿去买票、订机票的。
 *   捏造的日程比「没有日程」危害大得多。
 *
 * ★ 为什么它是**数据驱动**的（见 lib/data.ts 的 getMeta().demo）：
 *   只要还有任何一笔 source === 'sample'，它就出现；
 *   接入真实抓取后自动消失。这样就不存在「接入后忘了删提示条」
 *   或「删了提示条但其实还是假数据」这两种错误状态。
 *
 * ★ 为什么不用 window.confirm / 弹窗：
 *   弹窗会阻断阅读，用户第一反应是关掉，反而不会读内容。
 *   一条常驻的、位置固定的提示条，比弹窗更容易被看到且不打扰。
 *
 * 服务端组件：没有任何交互，纯 HTML + CSS。
 */
export function DemoNotice() {
  return (
    <aside
      role="note"
      className="jp-panel mb-6 flex flex-wrap items-start gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-[13px] leading-relaxed"
    >
      <span
        className="mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold"
        style={{
          /*
           * ★ 这里为什么直接用 tint 色而不是 .jp-status：
           *   .jp-status 自带**不透明底板**，那是为「叠在海报上」的
           *   强对比场景标定的（见 globals.css 的长注释）。
           *   而这条提示条本身就是一块 jp-panel，徽章只压在它上面 ——
           *   面板底色是可控的，不像海报那样可能是任意颜色，
           *   所以不需要再垫一层不透明底板。
           *
           * ⚠️ 但文字色必须与底色配对：三套主题下 --jp-st-soon-fg 都是
           *   为「浅底」标定的深琥珀，而面板底在三套主题下也都是浅的 ——
           *   恰好成立。若哪天把提示条改成深色底，这里必须跟着换。
           */
          background: 'var(--jp-st-soon-tint)',
          border: '1px solid var(--jp-st-soon-border)',
          color: 'var(--jp-st-soon-fg)',
        }}
      >
        <span className="i18n-zh">示範資料</span>
        <span className="i18n-ja">サンプル</span>
      </span>
      <p className="min-w-0 flex-1 text-fg-soft">
        <span className="i18n-zh">
          本站介面已完成，但<strong className="font-semibold text-fg">公演日程為手寫示範資料</strong>
          ，非真實情報。作品名與系列為真實的 2.5 次元企劃，日期、會場、出演者均為虛構，
          請勿據此安排行程或購票。接入官方資料來源後此提示會自動消失。
        </span>
        <span className="i18n-ja">
          本サイトのUIは完成していますが、
          <strong className="font-semibold text-fg">公演スケジュールは手書きのサンプルデータ</strong>
          であり、実在の情報ではありません。作品名・シリーズは実在の2.5次元企画ですが、
          日程・会場・出演者は架空のものです。日程の手配やチケット購入の判断には使用しないでください。
          公式ソースの取り込み後、この表示は自動的に消えます。
        </span>
      </p>
    </aside>
  );
}
