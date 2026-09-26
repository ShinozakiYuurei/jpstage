# jpstage · 日本 2.5 次元舞台劇資料庫

日本 2.5 次元舞台劇 / 音樂劇的公演資訊聚合站。中日雙語、兩套主題（深／粉）、
靜態導出（無需 Node 常駐進程）。

資料來自 [CoRich 舞台芸術！](https://stage.corich.jp) 的「2.5次元舞台」分類
與熱門 IP 關鍵字補抓，每日可重跑 —— 詳見下方「資料來源」。

視覺體系移植自姊妹站 [hkmovie](https://github.com/)（液態玻璃 + 環境光），
並按本站場景做了三處調整 —— 詳見 `app/globals.css` 頂部的說明。

---

## 快速開始

```bash
npm install
npm run dev          # 開發（http://localhost:3000）
npm run build        # 靜態導出到 out/
npm run scrape       # 抓取真實資料（寫 data/*.json + 下載海報）
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
  ThemeToggle.tsx      兩檔主題切換（深色 ⇄ 櫻粉）
  LangToggle.tsx       中日切換
  T.tsx                雙語文字（服務端組件）
lib/
  types.ts             資料型別（雙語二元組、狀態、會場…）
  data.ts              資料存取層（全站唯一讀 JSON 的地方）
  i18n.ts              語言標籤、地名對照
  format.ts            日期 / 期間格式化（時區安全）
  color.ts             主色 → CSS 通道、對比度計算
scripts/
  scrape.mjs           CoRich 抓取 + 譯名/翻譯 + 海報 + 資料校驗
deploy/
  sync.sh              一鍵發布：自檢 → 存檔 → 構建 → 上傳 → 冒煙
  remote-init.sh       首次初始化：80 → 簽證書 → 443 → 傳產物
  remote-attach-mount.sh  給 nginx 容器加 bind mount（帶 dry-run 與回滾）
  remote-upload.sh     上傳產物（先傳 /tmp 校驗，再原子切換）
  nginx-jpstage.conf   站點配置（含 443，線上運行的就是這份）
  remote-swap.sh       【伺服器端】校驗與原子切換
  remote-rollback.sh   【伺服器端】回滾上一版
  remote-cert.sh       【伺服器端】簽發 / 復用 Let's Encrypt 證書
  nginx-jpstage-preinit.conf  【伺服器端】簽證書前的「只有 80」臨時配置
probe/
  theme-contrast.mjs   三主題 × 雙語 對比度實測（真實瀏覽器）
  functional.mjs       響應式 / 雙語 / 主題時序驗收
  interactive.mjs      搜尋 / 篩選 / 排序 / 高亮驗收
  serve.mjs            零依賴預覽伺服器
data/
  shows.json           公演（抓取結果，預設近半年）
  series.json          系列 / 原作
  venues.json          會場
  zh-names.json        日文原名 → 中文譯名表（人工維護）
public/posters/        海報（構建前抓成本地 WebP）
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

node probe/theme-contrast.mjs       # 2 主題 × 3 頁面 × 對比度 + 玻璃邊緣
node probe/functional.mjs           # 雙語 / 主題時序 / 390px 響應式 / 截圖
node probe/interactive.mjs          # 搜尋 / 篩選 / 排序 / 頂欄高亮
```

三支探針都接受一個 base URL 參數，所以也能直接跑**線上**站點：

```bash
node probe/theme-contrast.mjs https://jpstage.yuurei.de
```

這比只跑本地產物更有意義：本地預覽伺服器不會經過 Cloudflare、
不經過 nginx 的 gzip 與 try_files，而那幾層都可能改變實際渲染結果
（例如 CF 的 Auto Minify 或 Rocket Loader 會改寫 HTML）。

`theme-contrast.mjs` 的做法值得說明：文字都浮在半透明玻璃上，
而**最終對比度取決於 backdrop-filter 採樣到了什麼** ——
這無法從 CSS 靜態推導（hkmovie 就吃過這個虧：按實心卡片算出的 5.18:1，
實測只有 4.32:1）。

所以它：收集每個元素的**實際 computed color** → 把文字全隱藏後截圖 →
那些位置剩下的像素就是**真實的底** → 算 WCAG 對比度。
全程不注入任何 CSS 覆蓋。

當前結果（全部達標，含余量）：

```
dark    最小余量 0.81（dim 5.31:1）
sakura  最小余量 0.18（dim 4.68:1）
```

★ 接入真實抓取後這裡**重新破線過一次**，值得記下來：
主色改為從真實海報取色後，亮度上限從 L≈0.10 提高到 L≈0.28，
暗色主題下詳情頁主色層上的次級文字實測掉到 **2.70:1**。
修法是三處一起動：取色端加亮度上限（壓回 0.28）、
主色層 alpha 按新的主色域重新掃描（降到 0.55×）、
以及新增 `.jp-accent-dim` 讓壓在主色層上的文字改用 soft 檔。

這件事說明了一條通則：**「標定過的值」只在它的取值域內成立。**
換了一批真實資料，之前掃出來的 alpha 就不再是安全的了。

---

## 資料來源

本站是**雙源合併**，兩個源的職責不同，缺一不可。

### ① 日本2.5次元ミュージカル協會（j25musical.jp）— 優先源

行業官方組織的 `SHOW SCHEDULE`，就是「現在演什麼、接下來演什麼」的
權威答案。抓取它列出的全部作品（每部再抓 `/stage/<id>` 詳情頁）。

★ 為什麼它是**優先**源：它有 CoRich 沒有的獨家條目（実測 9 部裡 6 部
CoRich 分類裡沒有，例如怪物事変、多聞くん今どっち！？、ケロロ軍曹），
而且檔期與會場是官方登記的，不存在用戶共建的滯後。

★ 但它**只能當優先源，不能取代 CoRich**：協會站的 schedule 頁
**沒有歸檔與分頁**，只列當期的 9 部。歷史內容全靠 CoRich。

### ② CoRich 舞台芸術！（stage.corich.jp）— 補充源

抓取「2.5次元舞台」分類（`category_id=7`），再用**譯名表的全部鍵**
做關鍵字補抓並**翻完所有頁**。

```bash
npm run scrape                           # 完整抓取
node scripts/scrape.mjs --no-posters     # 不下載海報
node scripts/scrape.mjs --no-translate   # 不呼叫機器翻譯（只用譯名表）
node scripts/scrape.mjs --keep-all       # 保留全部歷史檔案（預設只留近一年）
node scripts/scrape.mjs --rebuild-accent # 對已緩存的海報重新取主色
SCRAPE_WINDOW_DAYS=1095 npm run scrape   # 自訂時間窗（天）
```

★★ 兩個曾讓「作品不全」的漏項，都必須知道 ★★

1. **關鍵字補抓必須翻完所有頁。** 初版只取每個關鍵字的第 1 頁
   （20 條），而實測「テニスの王子様」有 213 條、「プリキュア」91 條 ——
   只取一頁直接漏掉九成。這是「作品不全」的主因。
2. **關鍵字列表要用譯名表的全部鍵**（目前 69 個），不能只寫幾個熱門。
   譯名表本來就是「本站認可的 2.5 次元 IP 清單」，
   拿它當關鍵字列表，兩件事共用同一份資料，不會各自漂移。

實測規模：全部關鍵字翻完可得 **912 個單會場條目 / 311 部作品**；
套用近一年時間窗後留下 38 部（12 上演中 / 7 即將開演 / 19 剛結束）。

### CoRich 的三個特性（只對 CoRich 成立，協會站皆無此問題）

1. **它是用戶共建庫，不是官方公告。** 條目由劇團與觀眾登記，
   所以出演者、場次數經常是空的，
   簡介也有近半沒填。本站對這些欄位的處理是「沒有就不顯示」，
   而不是拿別的內容湊數 —— 例如下載不到簡介時，詳情頁的
   「作品介紹」整段不渲染，而不是顯示一個空標題。

2. **同一部作品在站上是「一個作品總頁 + N 個單會場頁」。**
   搜索列表裡「名探偵プリキュア」出現 48 次（每個會場一條），
   必須爬回 `/stage_main/<id>` 歸併成本站的一部作品 + 多檔巡演。

3. **它提供官方站連結。** 每條資料都帶 `officialUrl`；
   頁腳也明寫「以各公演官方網站公布為準」—— 這不是免責話術，
   而是這個資料源的真實性質。

### 時間窗：預設只留近半年

分類頁翻完是 62 條、歸併後 54 部，其中 **47 部已經結束**（最早到 2018 年）。
而本站的主體是「現在能看的」。所以抓取時會剔除「半年前就結束」的條目，
實測留下 13 部（2 部上演中 / 5 部即將開演 / 6 部剛結束）。
加 `--keep-all` 可保留全部檔案。

### 雙語資料從哪來

這是本站與 hkmovie 最大的不同（hkmovie 是單語站）。三條路徑，按可靠度排序：

1. **譯名表**（`data/zh-names.json`）→ 優先。熱門 IP 數量有限，
   官方中文譯名穩定且唯一，值得人工維護。
2. **機器翻譯**（MyMemory，ja → zh-CN）→ 兜底，有每日額度限制。
3. **OpenCC**（zh-CN → zh-Hant）→ 把 2 的結果轉繁體。

實測機器翻譯的落差：「刀剣乱舞」被譯成「剑乱舞」、
「呪術廻戦」被譯成「诅咒之战」、「ヒプノシスマイク」被譯成「师饶舌战」——
這些在中文圈早有定譯，機器翻譯的結果對 2.5 次元觀眾來說是**錯的**。

所以譯名表命中時只**替換命中的那一段**，其餘保留原文：

```
舞台「呪術廻戦」-渋谷事変 前編  →  舞台「咒術迴戰」-渋谷事変 前編
```

副標題（「-懐玉・玉折-」「其ノ弐 絆」）恰恰是區分版本的關鍵，
而它們沒有權威譯名 —— 保留原文比硬翻更誠實。

翻譯額度用完時腳本會明確說「額度已用完，隔天重跑」，
而不只是報一個「有 N 條沒翻」的數字 —— 三種原因
（譯名表沒覆蓋 / 額度用完 / 網路失敗）對應三種不同的下一步。

---

## 部署

**線上位址**：https://jpstage.yuurei.de

### 日常發布：一條命令

```bash
bash deploy/sync.sh              # 自檢 → 存檔 → 構建 → 上傳 → 冒煙
bash deploy/sync.sh -m "修好篩選"
bash deploy/sync.sh --dry-run    # 只構建與檢查，不碰線上
bash deploy/sync.sh --rollback   # 回到線上上一版
```

### 架構：本機構建 + 只傳產物

```
本機  npm run build  →  out/ (12MB, 75 頁)  ──ssh──▶  伺服器 /home/web/jpstage
                                                        （nginx 容器 /var/www/jpstage）
```

**為什麼不像 hkmovie 那樣在服務器構建**（兩站的差別值得說清楚）：

| | hkmovie | jpstage |
|---|---|---|
| 構建位置 | 服務器（2C2G） | **本機** |
| 服務器需要 Node | 是（含 devDependencies） | **否** |
| 部署時內存壓力 | 構建峰值 1GB+（靠 3GB swap 兜） | 只解壓 12MB |

同一臺服務器上，hkmovie 構建 266 頁是成功的 —— 但它**有 OOM 歷史**
（`dmesg` 裡有 `Memory cgroup out of memory: Killed process`），
且長期可用內存只有 600MB 上下。讓它在跑著別人站點（komari、imgmove）的
同時做 Next 構建，風險不是「慢」，而是可能觸發 OOM 把無關進程一起殺掉。

jpstage 是純靜態導出、產物只有 12MB，本機構建再傳上去讓這個風險歸零。
這不是「hkmovie 那樣做錯了」—— 它的構建機就是那臺服務器，沒得選。

### 首次部署（已完成，留作記錄）

```bash
bash deploy/remote-attach-mount.sh   # 1. 給 nginx 容器加 bind mount
bash deploy/remote-init.sh           # 2. 80 → 簽證書 → 443 → 傳產物
```

順序不能顛倒：CF 的 SSL/TLS 是 **Full(strict)**，源站 443 沒有有效證書時
一律返回 525。所以必須先用「只有 80」的配置把 ACME 驗證跑通、簽下證書，
再啟用含 443 的完整配置。`remote-init.sh` 就是按這個順序做的。

### 幾個必須知道的約束

**1. 站點根是獨立目錄，不能放進 `/home/web/html`**

hkmovie 與 imgmove 共用 `/home/web/html`（後者只服務其中的 `/posters/`）。
但 hkmovie 的重建腳本同步產物時執行的是：

```bash
find "$SITE_DIR" -mindepth 1 -delete     # SITE_DIR=/home/web/html
```

也就是**清空整個目錄**。把本站放進去，hkmovie 每次重建都會把它一起刪掉 ——
而且是靜默的：站點先是 404，直到有人發現才明白原因。

**2. 服務器上的容器是 `docker run` 手工創建的，不是 compose 管的**

`docker inspect nginx` 裡沒有任何 `com.docker.compose.*` 標籤，
`docker compose ls` 也是空的。所以 `docker compose up -d nginx` 會失敗：

```
Conflict. The container name "/nginx" is already in use
```

而且 `/home/web/docker-compose.yml` 與運行中的容器**已經漂移**：
文件裡寫著 `tmpfs: /var/cache/nginx size=2048m`，
而容器的 `HostConfig.Tmpfs` 是 `null`（那個 tmpfs 從未生效）。
照文件重建會憑空引入一個變化 —— 所以 `remote-attach-mount.sh` 改為
**從運行中的容器提取參數**（`docker inspect`）再重放，只增不改。

**3. `conf.d` 下的文件是 CRLF 行尾**

這會讓 `grep -v '^_$'` 這類錨定行尾的匹配失效（`_` 實際是 `_\r`）。
部署腳本裡凡是要解析這些文件的地方都帶了 `tr -d '\r'`。

**4. 證書續期依賴兩個約定**

`/root/auto_cert_renewal.sh`（每日 cron）靠**遍歷 `certs/*_cert.pem` 反推域名**，
再按同名 `.conf` 檢查 `letsencrypt` 關鍵字。所以：
- 證書文件名必須是 `<域名>_cert.pem` / `<域名>_key.pem`
- `deploy/nginx-jpstage.conf` 裡的 ACME `location` **不可刪**

兩者任一被破壞，續期都會**靜默**失敗 —— 直到證書過期、CF 開始 525 才有人發現。

### 其他細節

- `NEXT_PUBLIC_SITE_URL` 必須在**構建時**給定：`sitemap.xml` / `robots.txt`
  裡的絕對網址是構建期寫死的字面量，忘了設會烘進錯誤域名 ——
  頁面上完全看不出來。`sync.sh` 會顯式傳入並在構建後立刻校驗。
- 部署腳本全部是 **LF 行尾**（`.gitattributes` 釘死）。
  本機 git 配了 `core.autocrlf=true`，不釘的話下次檢出會變 CRLF，
  送到 Linux 後 `#!/usr/bin/env bash\r` 直接失效。
- 回滾有兩層：`remote-upload.sh --rollback` 換回服務器上留存的上一版；
  `git revert` + `sync.sh` 是代碼層的回滾。前者更快（秒級）。

---

## 授權與立場

本項目為資訊聚合工具，與各公演主辦單位、製作委員會**無隸屬關係**。
所有公演資訊的權利歸屬於各自的權利人。
如權利人認為內容不當，請開 issue 聯絡移除。
