/**
 * 售票平台支付方式（网上购票）
 *
 * ===== 为什么单独一个纯模块 =====
 *
 * 与 hkmovie-lab 的 lib/cinema-payments.ts 同一套理由：支付方式是**平台政策**，
 * 变动频率远低于公演资料，写死在这里而不是塞进每次抓取都会被覆写的 data/*.json。
 * 改时只需动下面一张表，重新 build 即可（静态导出会烤进 HTML）。
 *
 * ===== 数据来源与可信度 =====
 *
 * 每个平台都标了 source 和 verified：
 *   verified: true  → 平台官网的支付说明／FAQ 明文
 *   verified: false → 尚未取得足以确认该平台支付方式的官方证据
 *
 * UI 上对 verified:false 的平台显示「支付方式待确认」，
 * 不显示具体支付方式 —— 显示错的比不显示更糟。
 *
 * ===== 已确认平台（2026-10-01 实查）=====
 *
 * ローソンチケット（樂虎） https://l-tike.com/guide/payment/
 *   官网「お支払い方法について」明文：PayPay、楽天ペイ、クレジットカード決済、
 *   キャリア決済、ちょコムｅマネー決済、Pay-easy、ローソン・ミニストップ店頭決済、
 *   郵便振込、コンビニ入金（イーコンテクスト）。
 *   同页明列可用卡种：VISA、JCB、Mastercard、Diners Club、American Express，
 *   并单列 **PayPal**（日本售票平台中极少数支持 PayPal 的一家）。
 *
 * チケットぴあ（Ticket Pia） https://t.pia.jp/help/payment/credit.html
 *   官网「支払方法一覧 → クレジットカード」明文：
 *   ぴあカード（VISA・MasterCard・JCB）／VISA／MasterCard／JCB／Diners Club／
 *   NICOS／イオン／American Express 的卡片可用。
 *
 * イープラス（eplus） https://support-qa.eplus.jp/hc/ja/articles/360041176594
 *   官方客服站「利用できるクレジットカードの種類は何か」明文：
 *   セゾン、UC、VISA、MASTER、JCB、アメリカン・エキスプレス、Diners Club、DC
 *   的标记卡片可用。另页（支払・受取方法の詳細）列出支付方式为
 *   クレジットカード／コンビニエンスストア／ATM／ネットバンキング。
 *
 * CNプレイガイド（CN Playguide） https://www.cnplayguide.com/guide/
 *   官网使用指南明文：「クレジットカード決済では、ＶＩＳＡ、ＭＡＳＴＥＲ、
 *   ＪＣＢ、ダイナースクラブ、ＡＭＥＸの各カードがご利用いただけます」。
 *   （页面为 Shift-JIS 编码，抓取时需正确解码。）
 *
 * セブンチケット（Seven Ticket） https://www.7ticket.jp/faq
 *   官网 FAQ 明文：「クレジットカードは、JCB、VISA、マスターカード、
 *   アメリカン・エキスプレス、ダイナースがご利用いただけます」。
 *   同页明确：バーコード決済（PayPay 等）不可用，电子货币仅 nanaco。
 *
 * FANYチケット https://ticket.fany.lol/
 *   官网 FAQ 分类「支払・受取について → 支払方法について」列有
 *   「利用できるクレジットカードの種類は？」条目；购买流程与配送说明
 *   均以「クレジットカード決済」为前提。具体卡种清单未能取到答案页全文，
 *   故只确认「支持信用卡」这一事实，不列卡种。
 *
 * LivePocket https://ticket.livepocket.jp/commercial
 *   官网主办方页面「支払方法」明文：クレジットカード決済（VISA、MasterCard、JCB）、
 *   コンビニ決済、LivePocketあと払い powered by atone。
 *
 * 天王洲 銀河劇場（銀河劇場チケットセンター） https://www.gingeki.jp/ticket/
 *   官网「購入方法」明文：「支払方法 クレジットカード（UFJ・VISA・MASTER・NICOS）
 *   のお支払いのみとなります」。仅网上购票渠道，电话受付为便利店支付。
 *
 * イーティックス（E-Get / e-ティックス） https://www.e-tix.jp/faq/
 *   官网 FAQ「支払方法の指定はできますか？」明文：可用支付方式为
 *   「クレジットカード決済」「NTTドコモd払い」「コンビニ決済」「代引き決済」。
 *   未列卡种，故不列卡种。
 *
 * ===== 待确认平台 =====
 *
 * 東宝ナビザーブ、楽天チケット、TBSオンラインチケット、チケットWeb松竹、
 * アソビュー！、飛行船オンラインチケット —— 这些站点的支付说明页
 * 需要登录态或对抓取返回错误页，尚未取得官方明文，维持 verified:false。
 *
 * ===== 关于支付宝／微信支付 =====
 *
 * 日本主流售票平台（ローソン、ぴあ、イープラス、CN、セブン、FANY、
 * LivePocket、銀河劇場、イーティックス）的官方支付说明中
 * **均未出现支付宝或微信支付**。这不是抓取遗漏，而是这些平台
 * 面向日本国内结算的现状。若未来某家开通，更新本表即可。
 */

/** 支付方式 key */
export type PaymentMethod =
  | 'visa'
  | 'mastercard'
  | 'jcb'
  | 'american_express'
  | 'diners_club'
  | 'nicos'
  | 'ufj'
  | 'dc'
  | 'saizon'
  | 'uc'
  | 'aeon'
  | 'pia_card'
  | 'paypal'
  | 'paypay'
  | 'rakuten_pay'
  | 'carrier'
  | 'd_barai'
  | 'chocom'
  | 'atone'
  | 'pay_easy'
  | 'convenience_store'
  | 'atm'
  | 'net_banking'
  | 'postal_transfer'
  | 'nanaco'
  | 'cash'
  | 'credit_card';

export interface PaymentInfo {
  /** 接受的支付方式 */
  methods: PaymentMethod[];
  /** 出处（平台官网说明页 URL） */
  source: string | null;
  /** 一句话说明 */
  note: string;
  /** 是否已从平台官网公开说明确认 */
  verified: boolean;
}

/** 显示名称（繁中 / 日文） */
export const PAYMENT_LABEL: Record<PaymentMethod, { zh: string; ja: string }> = {
  visa: { zh: 'Visa', ja: 'VISA' },
  mastercard: { zh: 'MasterCard', ja: 'MasterCard' },
  jcb: { zh: 'JCB', ja: 'JCB' },
  american_express: { zh: '美國運通', ja: 'アメリカン・エキスプレス' },
  diners_club: { zh: 'Diners Club', ja: 'ダイナースクラブ' },
  nicos: { zh: 'NICOS', ja: 'NICOS' },
  ufj: { zh: 'UFJ', ja: 'UFJ' },
  dc: { zh: 'DC', ja: 'DC' },
  saizon: { zh: 'SAISON', ja: 'セゾン' },
  uc: { zh: 'UC', ja: 'UC' },
  aeon: { zh: 'AEON', ja: 'イオン' },
  pia_card: { zh: 'Pia 卡', ja: 'ぴあカード' },
  paypal: { zh: 'PayPal', ja: 'PayPal' },
  paypay: { zh: 'PayPay', ja: 'PayPay' },
  rakuten_pay: { zh: '樂天 Pay', ja: '楽天ペイ' },
  carrier: { zh: '電信業者代扣', ja: 'キャリア決済' },
  d_barai: { zh: 'd 付款', ja: 'd払い' },
  chocom: { zh: 'ちょコム e 錢包', ja: 'ちょコムｅマネー' },
  atone: { zh: 'atone 後付款', ja: 'atone（後払い）' },
  pay_easy: { zh: 'Pay-easy', ja: 'Pay-easy（ペイジー）' },
  convenience_store: { zh: '便利商店付款', ja: 'コンビニ決済' },
  atm: { zh: 'ATM', ja: 'ATM' },
  net_banking: { zh: '網路銀行', ja: 'ネットバンキング' },
  postal_transfer: { zh: '郵政匯款', ja: '郵便振込' },
  nanaco: { zh: 'nanaco', ja: 'nanaco' },
  cash: { zh: '現金', ja: '現金' },
  credit_card: { zh: '信用卡', ja: 'クレジットカード' },
};

/**
 * 平台支付方式表
 *
 * ★ key 是 TicketVendor（平台），不是作品 slug。
 *   支付方式是平台政策，全站一致 —— 同一平台下所有作品共用一条记录。
 *
 * ★ verified:false 的平台在 UI 上不显示具体支付方式，只显示「待确认」。
 *   这是刻意为之 —— 显示错的比不显示更糟。
 */
const BY_VENDOR: Partial<Record<string, PaymentInfo>> = {
  lawson: {
    methods: [
      'visa',
      'jcb',
      'mastercard',
      'diners_club',
      'american_express',
      'paypal',
      'paypay',
      'rakuten_pay',
      'carrier',
      'chocom',
      'pay_easy',
      'convenience_store',
      'postal_transfer',
    ],
    source: 'https://l-tike.com/guide/payment/',
    note: 'ローソンチケット官網「お支払い方法について」：可用 VISA、JCB、Mastercard、Diners Club、American Express，另支持 PayPal、PayPay、楽天ペイ、電信業者代扣、ちょコム e 錢包、Pay-easy、便利商店與郵政匯款。',
    verified: true,
  },
  pia: {
    methods: [
      'visa',
      'mastercard',
      'jcb',
      'american_express',
      'diners_club',
      'nicos',
      'aeon',
      'pia_card',
      'convenience_store',
      'pay_easy',
      'net_banking',
      'atm',
    ],
    source: 'https://t.pia.jp/help/payment/credit.html',
    note: 'チケットぴあ官網「支払方法一覧 → クレジットカード」：可用ぴあカード、VISA、MasterCard、JCB、Diners Club、NICOS、イオン、American Express；另支持セブン-イレブン、ファミリーマート、イーコンテクスト（便利商店／ATM／網路銀行／楽天Edy）、後払い atone。',
    verified: true,
  },
  eplus: {
    methods: ['visa', 'mastercard', 'jcb', 'american_express', 'diners_club', 'saizon', 'uc', 'dc', 'convenience_store', 'atm', 'net_banking'],
    source: 'https://support-qa.eplus.jp/hc/ja/articles/360041176594',
    note: 'イープラス官方客服站「利用できるクレジットカードの種類は何か」：可用セゾン、UC、VISA、MASTER、JCB、アメリカン・エキスプレス、Diners Club、DC 標記的卡片；支付方式另有便利商店、ATM、網路銀行。',
    verified: true,
  },
  cn: {
    methods: ['visa', 'mastercard', 'jcb', 'diners_club', 'american_express', 'convenience_store'],
    source: 'https://www.cnplayguide.com/guide/',
    note: 'CNプレイガイド官網使用指南：「クレジットカード決済では、ＶＩＳＡ、ＭＡＳＴＥＲ、ＪＣＢ、ダイナースクラブ、ＡＭＥＸの各カードがご利用いただけます」；另支持便利商店店頭付款。',
    verified: true,
  },
  seven: {
    methods: ['jcb', 'visa', 'mastercard', 'american_express', 'diners_club', 'nanaco', 'cash'],
    source: 'https://www.7ticket.jp/faq',
    note: 'セブンチケット官網 FAQ：「クレジットカードは、JCB、VISA、マスターカード、アメリカン・エキスプレス、ダイナースがご利用いただけます」。店頭僅收現金、nanaco 與信用卡；官網明文バーコード決済（PayPay 等）不可用。',
    verified: true,
  },
  livepocket: {
    methods: ['visa', 'mastercard', 'jcb', 'convenience_store', 'atone'],
    source: 'https://ticket.livepocket.jp/commercial',
    note: 'LivePocket 官網主辦方頁「支払方法」：クレジットカード決済（VISA、MasterCard、JCB）、コンビニ決済、LivePocketあと払い powered by atone。',
    verified: true,
  },
  gingeki: {
    methods: ['visa', 'mastercard', 'nicos', 'ufj'],
    source: 'https://www.gingeki.jp/ticket/',
    note: '天王洲 銀河劇場官網「購入方法」：「支払方法 クレジットカード（UFJ・VISA・MASTER・NICOS）のお支払いのみとなります」。此為線上購票渠道；電話受付為便利商店付款。',
    verified: true,
  },
  etix: {
    methods: ['credit_card', 'd_barai', 'convenience_store'],
    source: 'https://www.e-tix.jp/faq/',
    note: 'イーティックス官網 FAQ「支払方法の指定はできますか？」：可用支付方式為「クレジットカード決済」「NTTドコモd払い」「コンビニ決済」「代引き決済」。官網未列卡種，故不列卡種。',
    verified: true,
  },
  fany: {
    methods: ['credit_card', 'convenience_store'],
    source: 'https://ticket.fany.lol/faq/',
    note: 'FANYチケット官網 FAQ 設有「支払・受取について → 支払方法について」分類，購買流程與配送說明均以「クレジットカード決済」為前提，另提供ファミリーマート付款。卡種清單未取得，故只列「信用卡」。',
    verified: true,
  },

  // ===== 待確認（尚未取得官方支付說明明文）=====
  toho: {
    methods: [],
    source: null,
    note: '東宝ナビザーブ的購票頁需登入後才能進入，官網未公開支付方式說明；暫不列具體支付方式。',
    verified: false,
  },
  rakuten: {
    methods: [],
    source: null,
    note: '楽天チケット的支付說明頁未取得（官網 FAQ 未公開對應條目）；暫不列具體支付方式。',
    verified: false,
  },
  tbs: {
    methods: [],
    source: null,
    note: 'TBSオンラインチケット官網對本機請求持續回錯誤，未取得支付說明；暫不列具體支付方式。',
    verified: false,
  },
  shochiku: {
    methods: [],
    source: null,
    note: 'チケットWeb松竹官網未公開支付方式說明頁；暫不列具體支付方式。',
    verified: false,
  },
  asoview: {
    methods: [],
    source: null,
    note: 'アソビュー！官網 FAQ 頁回 404，未取得支付說明；暫不列具體支付方式。',
    verified: false,
  },
  hikosen: {
    methods: [],
    source: null,
    note: '飛行船オンラインチケット由 CNプレイガイド 系統承辦，但官網未針對此渠道單獨列出支付方式；暫不列具體支付方式。',
    verified: false,
  },
};

/** 未知平台的兜底 */
const UNKNOWN: PaymentInfo = {
  methods: [],
  source: null,
  note: '未確認支付方式。',
  verified: false,
};

/**
 * 查詢某平台的支付方式
 *
 * @param vendor 售票平台 id（如 'lawson'）
 */
export function paymentMethodsOf(vendor: string): PaymentInfo {
  return BY_VENDOR[vendor] ?? UNKNOWN;
}

/** 某平台是否已確認支付方式 */
export function isPaymentVerified(vendor: string): boolean {
  return BY_VENDOR[vendor]?.verified ?? false;
}

/**
 * 取得所有已確認支付方式的平台列表
 *
 * 返回 [{ vendor, methods }]
 */
export function getVerifiedPaymentVendors(): { vendor: string; methods: PaymentMethod[] }[] {
  return Object.entries(BY_VENDOR)
    .filter(([, info]) => info?.verified && info.methods.length > 0)
    .map(([vendor, info]) => ({ vendor, methods: info!.methods }));
}

/**
 * 取得所有出現過的支付方式（用於篩選下拉選項）
 *
 * 只從 verified:true 的平台收集，避免把未確認的支付方式放進篩選器。
 */
export function getAllPaymentMethods(): PaymentMethod[] {
  const set = new Set<PaymentMethod>();
  for (const info of Object.values(BY_VENDOR)) {
    if (info?.verified) {
      for (const m of info.methods) set.add(m);
    }
  }
  return [...set];
}
