# 紅棉賽場 KP Arena

鏡平學校田徑運動會（2026年10月28日至30日）的網頁版賽程、名單與即時成績。手機瀏覽器打開即可使用，不需要安裝 App，也可以「加到主畫面」。

- 觀眾：未登入只看賽程；班級（班級代號＋4 位班級密碼）或運動員（號碼布＋所屬班級的密碼）登入後可看比賽名單、成績、破紀錄、相片集、我的成績（介面為繁體中文）
- 工作人員（`/admin`）另有「班級密碼」頁：匯入名單時自動為每班產生密碼，可修改、全部換新、下載密碼表交給班主任
- 工作人員（`/admin`）：匯入 Excel、逐場錄入並發佈成績、標記進行中、公告橫幅、修改賽次時間、上載相片縮圖
- 成績以大會張貼的紙本為準，本系統與紙本並行

## 架構

```
手機瀏覽器 ──每 30 秒──> Cloudflare R2 上的 public.json，或登入後的 live.json / meet.json
                              ^
工作人員 /admin ──> Vercel 上的 Next.js API ──寫入──┘
```

沒有資料庫。全部資料是 R2 裏的 JSON 檔。R2 網域任何人都能讀取，所以名單和成績都加密存放：

| 檔案 | 內容 | 誰看得到 |
| --- | --- | --- |
| `public.json` | 賽程、公告、哪些賽次進行中 / 已出成績（不含姓名和成績） | 所有人 |
| `meet.json` | 運動員、參賽名單、大會紀錄、相片清單（加密） | 登入的班級和運動員 |
| `live.json` | 已發佈的成績、進行中的賽次（加密） | 登入的班級和運動員 |
| `private/meet.json` | 完整主檔，包括班級密碼（另一把鑰匙加密） | 只有伺服器 |
| `photos/*.jpg` | 相片縮圖（原圖放外部雲端相簿） | 知道網址的人 |

登入時 `/api/login` 核對「班級＋密碼」或「號碼布＋該生班級的密碼」，通過後把解密鑰匙交給該手機。兩把鑰匙都由 `SESSION_SECRET` 推導。

兩人同時發佈時用 R2 的條件寫入（If-Match）避免互相覆蓋。

## 本機試用（不用任何帳號）

```bash
npm install
npm run seed-demo   # 產生示範數據到 .data/，並產生 samples/demo.xlsx 與 public/template.xlsx
npm run dev         # http://localhost:3000 ，後台 http://localhost:3000/admin
```

本機開發時後台密碼為 `admin`（管理員）和 `entry`（成績錄入）。

## 正式部署

### 1. Cloudflare R2

1. 註冊 Cloudflare，開通 R2（免費額度：每月 10 GB 儲存、1000 萬次讀取，流量不收費）。
2. 建立 bucket，例如 `kp-arena`。
3. 在 R2 →「Manage API tokens」建立一個 **Object Read & Write** 權限、只限此 bucket 的 token，記下 Access Key ID、Secret Access Key 和 Account ID。
4. 公開讀取：bucket → Settings → **Custom Domains** 連接一個子網域，例如 `data.你的網域`。網域需要在同一個 Cloudflare 帳號內（在 Cloudflare 買一個約 10 美元一年）。
   - 彩排時可先開 **r2.dev** 網址測試，但 Cloudflare 說明它有限流、不適合正式使用。
5. bucket → Settings → **CORS Policy** 填入（把網址換成 Vercel 網址）：

   ```json
   [{ "AllowedOrigins": ["https://kparena.site", "https://www.kparena.site", "https://kp-arena.vercel.app"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```

### 2. Vercel

1. 用 GitHub 登入 Vercel，Import 這個倉庫，框架自動識別為 Next.js。
2. 在 Environment Variables 填入（參考 `.env.example`）：

   | 變數 | 值 |
   | --- | --- |
   | `ADMIN_PASSWORD` | 管理員密碼 |
   | `ENTRY_PASSWORD` | 成績錄入員密碼 |
   | `SESSION_SECRET` | 一串隨機字元（`openssl rand -hex 32`） |
   | `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | 第 1 步取得 |
   | `NEXT_PUBLIC_DATA_URL` | R2 公開網址，例如 `https://data.你的網域` |
   | `PREVIOUS_SESSION_SECRET` | 只在更換 `SESSION_SECRET` 時填舊值，讓系統讀得到舊資料 |

3. Deploy。改了 `NEXT_PUBLIC_DATA_URL` 之後要重新 Deploy 一次才生效。

> 未設定 `NEXT_PUBLIC_DATA_URL` 時，手機會改經 Vercel 讀取資料。這在彩排人少時沒問題，但 800 人每 30 秒輪詢三天約 350 萬次請求，超過 Vercel 免費版每月 100 萬次，正式比賽一定要設定。

### 3. 匯入學校資料

1. 打開 `/admin`，用管理員密碼登入。
2. 「匯入資料」→ 上載 Excel。可先下載範本（`/template.xlsx`）看欄位名稱：
   - **運動員**：號碼布、姓名、班級、性別、組別
   - **參賽名單**：序號（賽程表上的 101、102…）或項目（如「男甲100M初」）、號碼布或班級/隊伍、組次、道次
   - **大會紀錄**：項目（如「男甲100M」）、成績、保持者、年份
3. 同一個 Excel 可以只有其中一兩張表，只會更新檔案中有的部分。
4. 想先看效果，可以匯入 `samples/demo.xlsx`（假名字），之後再匯入真資料覆蓋。

## 比賽當天流程

1. 錄入員在 `/admin` →「成績錄入」選賽次，可先按「標記為進行中」。
2. 按紙本輸入成績（在成績格按 Enter 會跳到下一行），名次按成績自動計算；缺席、未完成、犯規在「狀態」揀選。每一行都要有成績或狀態（DNS / DNF / DQ）才能發佈。
3. 系統會提示號碼不在名單、號碼重複、不合理的時間；如成績優於大會紀錄會預先提示，請總裁判確認後才發佈。
4. 按「發佈成績」，觀眾約 30 秒內看到。發錯可以改完再按「更新發佈」，或「撤回成績」。

## 已知限制（MVP）

- 這是校內層級的保護，不是銀行級：班級密碼只有 4 位數字（登入失敗會延遲並限次），運動員用號碼布加班級密碼登入，所以知道某班密碼的人就能登入。登入後可看全部名單和成績，不只本班。
- 某班密碼外洩：在後台「班級密碼」改該班密碼即可。已登入的手機不受影響；要讓所有手機重新登入，就更換 `SESSION_SECRET`（舊值填 `PREVIOUS_SESSION_SECRET`），重新部署後打開一次 `/admin`，系統會自動用新鑰匙重新加密。
- 沒有修改歷史，只記錄最後一次發佈的人和時間；紙本為最終依據。
- 預賽晉級名單不會自動產生，複賽 / 決賽的名單要在 Excel 補上或直接在錄入時輸入號碼。
- 相片原圖需另外放在雲端相簿，後台只上載縮圖並貼上原圖連結。

## 開發

- 賽程來源：`data/schedule-source.pdf` → `data/schedule-source.txt`（`pdftotext -layout`）→ `npm run parse-schedule` → `data/schedule.json`
- `npm run typecheck` 型別檢查，`npm run build` 建置
