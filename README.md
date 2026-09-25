# jpstage · 日本 2.5 次元舞台劇資料庫

日本 2.5 次元舞台劇 / 音樂劇的公演資訊聚合站。中日雙語、三套主題、
靜態導出（無需 Node 常駐進程）。

視覺體系移植自姊妹站 [hkmovie](https://github.com/)（液態玻璃 + 環境光），
並按本站場景做了三處調整 —— 詳見 `app/globals.css` 頂部的說明。

---

## ⚠️ 目前是示範資料

站點介面已完成，但 **`data/*.json` 裡的公演日程是手寫的示範資料**，
不是真實情報。作品名與系列是**真實存在**的 2.5 次元企劃，
但日期、會場、出演者均為虛構。

頁面上有明確的「示範資料」提示條。它由 `getMeta().demo` 驅動 ——
**只要資料裡還有任何一筆 `source === 'sample'`，提示條就會出現**。
接入真實抓取後它會自動消失，不需要改任何組件代碼。

> 為什麼要這麼較真：2.5 次元的公演日程是會被拿去訂機票、買票的。
> 捏造的日程比「沒有日程」危害大得多。

---

## 快速開始

```bash
npm install
npm run dev          # 開發（http://localhost:3000）
npm run build        # 靜態導出到 out/
npm run scrape       # 抓取（目前是骨架，見下）
npm run validate     # 只跑資料校驗（不需要網路）
```

### 預覽構建產物

`npm run build` 之後 `out/` 是純靜態檔案，用任何靜態伺服器都能預覽：

```bash
node probe/serve.mjs out 4321   # 自帶的零依賴預覽伺服器
# 或：npx serve out
```

---

## 專案結構

```
app/
  globals.css          視覺體系（液態玻璃令牌 + 三套主題 + 雙語機制）
  layout.tsx           根佈局（主題/語言啟動腳本、頂欄、極光層）
  page.tsx             首頁（上演中 / 即將開演 / 系列 / 收錄範圍）
  now/                 上演中的公演（搜尋 + 篩選）
  upcoming/            即將開演的公演（搜尋 + 篩選）
  show/[slug]/         公演詳情（檔期、出演、工作人員、同系列）
  venue/               會場一覽（按城市分組）
  venue/[id]/          會場詳情（檔期時間軸）
  series/              系列一覽
  series/[id]/         系列詳情（按狀態分組）
  sitemap.ts robots.ts 靜態導出的 SEO 端點
components/
  ShowCard.tsx         公演卡片（主色氛圍層 + 狀態徽章）
  PosterArt.tsx        無海報時的示意海報（按主色生成）
  ShowExplorer.tsx     搜尋 + 多維篩選（客戶端）
  FilterDropdown.tsx   多選下拉（Portal + 實測定位）
  ThemeToggle.tsx      三檔主題切換
  LangToggle.tsx       中日切換
  T.tsx                雙語文字（服務端組件）
lib/
  types.ts             資料型別（雙語二元組、狀態、會場…）
  data.ts              資料存取層（全站唯一讀 JSON 的地方）
  i18n.ts              語言標籤、地名對照
  format.ts            日期 / 期間格式化（時區安全）
  color.ts             主色 → CSS 通道、對比度計算
scripts/
  scrape.mjs           抓取骨架 + 資料校驗
probe/
  theme-contrast.mjs   三主題 × 雙語 對比度實測（真實瀏覽器）
  functional.mjs       響應式 / 雙語 / 主題時序驗收
  interactive.mjs      搜尋 / 篩選 / 排序 / 高亮驗收
  serve.mjs            零依賴預覽伺服器
data/
  shows.json           公演（26 部）
  series.json          系列 / 原作（24 個）
  venues.json          會場（17 個）
```

---

## 三個關鍵設計決策

### 1. 雙語由 CSS 決定，不由 JS

兩種語言的文案**都渲染進 HTML**，由 `html[data-lang]` 決定顯示哪一種
（`.i18n-zh` / `.i18n-ja`）。

為什麼不用 React state 只渲染一種：本站是靜態導出，服務端必須先假設一種
語言，hydrate 之後才讀到 localStorage 裡的另一種 —— 用戶會看到**整頁文字
換一次**，而且必然造成 hydration mismatch。

代價是 HTML 裡有兩份文案（gzip 後增量很小）。這與主題切換是同一個模式：
**凡是首次繪製前就必須正確的顯示狀態，都不要交給 JS 決定。**

### 2. 狀態存在資料裡，不在運行時算

`show.status`（now / upcoming / ended）由資料決定，不在組件裡
`new Date() > endDate` 判斷。

因為靜態導出的 HTML 在**構建時**定稿，而產物可能上線跑幾個月。
運行時判斷只反映「構建那一刻」的真實性 —— 之後會**靜默錯誤**
（頁面照常渲染，只是狀態不對）。這是同類站點最常見的一類長期 bug。

代價是資料必須定期重抓，這一點在頁腳的「最後更新」裡對用戶明示。
`scripts/scrape.mjs` 的 `validate()` 會檢查 `status` 與日期是否一致。

### 3. 玻璃可以透，但狀態徽章不行

`probe/theme-contrast.mjs` 在真實瀏覽器裡量到過兩個真實缺陷：

| 缺陷 | 實測值 | 原因 | 修法 |
|---|---|---|---|
| 狀態徽章（疊在海報上） | **1.14:1** | 淡彩底只有 10% 不透明，顏色 90% 來自身後的海報（可能是任意深色） | 給徽章自帶高不透明度底板，文字按底板標定 |
| chip 內的次級文字 | **4.19:1** | chip 自己是又半透明表面，把底再抬亮一檔 | 新增 `--jp-fg-onchip` 令牌單獨標定 |

兩者同源：**半透明表面疊加**會讓「為 A 標定的文字」落到「B 的底」上。
所以本站的原則是 —— 承載資訊的元件（徽章、標籤）自帶底板，
純氛圍的玻璃才允許透。

---

## 驗收

三支探針都用**真實瀏覽器 + CDP**，不引入 playwright 等依賴
（直接用本機的 Chrome / Edge）。

```bash
node probe/serve.mjs out 4321 &     # 先起預覽

node probe/theme-contrast.mjs       # 3 主題 × 3 頁面 × 對比度 + 玻璃邊緣
node probe/functional.mjs           # 雙語 / 主題時序 / 390px 響應式 / 截圖
node probe/interactive.mjs          # 搜尋 / 篩選 / 排序 / 頂欄高亮
```

`theme-contrast.mjs` 的做法值得說明：文字都浮在半透明玻璃上，
而**最終對比度取決於 backdrop-filter 採樣到了什麼** ——
這無法從 CSS 靜態推導（hkmovie 就吃過這個虧：按實心卡片算出的 5.18:1，
實測只有 4.32:1）。

所以它：收集每個元素的**實際 computed color** → 把文字全隱藏後截圖 →
那些位置剩下的像素就是**真實的底** → 算 WCAG 對比度。
全程不注入任何 CSS 覆蓋。

當前結果（全部達標，含余量）：

```
dark    最小余量 0.35（dim 4.85:1）
light   最小余量 0.50（dim 5.00:1）
sakura  最小余量 0.27（dim 4.77:1）
```

---

## 接入真實資料

見 `scripts/scrape.mjs` 頂部的完整說明。要點：

1. 在 `SOURCES` 裡登記資料源並實作 `fetch()` → 返回 `RawShow[]`
2. 在 `normalize()` 裡加翻譯查表 / 日期區間展開 / 系列歸併
3. 把 `source` 從 `'sample'` 改成站點標識 → 提示條自動消失
4. 跑 `npm run validate` 確認資料合規

**雙語資料從哪來**是本站與 hkmovie 最大的不同（hkmovie 是單語站）。
最適合 2.5 次元場景的做法是**人工維護「日文原名 → 中文譯名」表**：
熱門 IP 數量有限（幾百個），而它們的官方中文譯名是穩定且唯一的。
表放在 `data/series.json`，已按這個結構設計。

機器翻譯只適合做兜底 —— 例如「呪術廻戦」的官方繁體譯名是
「咒術迴戰」而不是直譯的「咒术回战」（那是簡中譯名）。

---

## 部署

`out/` 是純靜態檔案。nginx 配置要點：

```nginx
root /var/www/jpstage/out;
index index.html;

# trailingSlash: true → 詳情頁是 /show/xxx/index.html
location / { try_files $uri $uri/index.html $uri/ =404; }

# Next.js 導出的 404 需要顯式接上，否則用戶看到的是 nginx 默認頁
error_page 404 /404.html;

# 帶 hash 的靜態資源可以長期緩存
location /_next/static/ { expires 1y; add_header Cache-Control "public, immutable"; }

# HTML 不緩存（內容隨每次重建更新）
location ~* \.html$ { add_header Cache-Control "no-cache"; }
```

環境變數（構建時）：

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain npm run build
```

它用於 `metadataBase`、`sitemap.xml`、`robots.txt` 的絕對網址。
不設置會回退到 `https://jpstage.example`（不會構建失敗，但 SEO 端點會指向錯的域名）。

---

## 授權與立場

本項目為資訊聚合工具，與各公演主辦單位、製作委員會**無隸屬關係**。
所有公演資訊的權利歸屬於各自的權利人。
如權利人認為內容不當，請開 issue 聯絡移除。
