# InterAct 升級：chinhsi's Project

2026-10-29。InterAct 與十秒課堂是兩個不同程式。使用者指定把新版 InterAct 放進既有 Supabase `chinhsi's Project`（ref `zgtilyeloepqqyfezmca`）。這個 project 原有 `public.sessions(sid,sess,expire)`，所以 InterAct 的 25 張業務表及一張 `presenter_uids` 權限表全部放在 `interact` schema。不要執行會改動 `public.sessions` 的舊版 migrations，也不要把 InterAct 的前端指向這個 project 的 `public` schema。

已完成：
- 已執行 `supabase/schema.sql`、`supabase/hardening.sql`；`interact` schema 有 26 張表及 17 項 members-only policy。`public.sessions` 仍為 `sid,sess,expire`。
- API exposed schemas 加入 `interact`，保留 `public` 和 `graphql_public`；啟用匿名登入並把每 IP 每小時上限設為 500。CLI config diff 只列出這三項更動，其餘遠端設定未覆蓋。
- 既有 `public.handle_new_user` 觸發器原本要求註冊者有電郵，匿名登入回 500。已執行 `supabase/target-chinhsi-project-auth.sql`，讓匿名用戶略過另一應用的 `profiles_saas`，一般電郵／OAuth 註冊走原流程。
- 九個 InterAct Edge Functions 已部署。此舊 project 的 `SUPABASE_SECRET_KEYS` 為空物件，故 `_shared/supabase.ts` 使用 `INTERACT_SERVICE_ROLE_KEY` 後備；金鑰只存於 Edge secret，不在 repo。新 `INTERACT_OWNER_KEY` 在 Edge secret，對應本機 Keychain service `supabase-interact-target-owner-key`。
- `scripts/verify-hardening.mjs` 在新 schema 實跑 23/23 通過，含建課、加入、跨場次隔離、冒名阻擋、Realtime 與測試課堂清除。測試不涉及 AI 或真人錄音。
- 2026-10-29 使用者已在新 project 設定 `GEMINI_API_KEY`。首次 live AI 測試發現 `analyze-session` 線上仍是舊版 `_shared/supabase.ts`，在 `SUPABASE_SECRET_KEYS={}` 時未使用 `INTERACT_SERVICE_ROLE_KEY` 後備；已把六個尚用舊共用程式的函式（`analyze-question`、`analyze-session`、`generate-exit-ticket`、`shorten-url`、`openai-realtime-session`、`gemini-caption-relay`）重新部署到 ref `zgtilyeloepqqyfezmca`。重測建立空白測試課堂、生成繁體中文與英文課後 AI 報告成功，測試課堂已刪，SQL 確認同名場次剩餘 0。此測試證明 Gemini 金鑰及報告路徑可用，未測錄音、圖片、真人操作及其他 AI 功能。

待完成：
- `OPENAI_API_KEY`／`REURL_API_KEY` 尚未搬。這些不能從舊 Supabase secret 讀回；如需相應功能，須由使用者持有的原始金鑰安全設定，不能把值寫入 repo 或聊天。
- 目前 GitHub Pages 的 `main` 仍指舊 InterAct Supabase project。切換時須把 repo variables `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 指向新 project；`VITE_PUBLIC_APP_URL` 維持本人的 Pages 網址。變數與新版前端必須同批切換，不能先改變數讓舊程式讀到新 schema。
- 原 project 有一個舊 InterAct 場次與一名參與者；本次未搬歷史資料。舊 project 的十秒課堂課堂與回答仍在原處。是否保留歷史 InterAct 場次作封存由使用者決定，不刪原資料。
- Preview Mac 版已在真實桌面啟動、儲存管理金鑰、測試連線及實際開課；學生端在 Chrome 加入並送訊息成功。仍未用真手機掃碼，錄音、截圖及其他付費 AI 路徑也未驗收；升級 PR 保持草稿。

再次部署時先確認目標 ref，再依序套用 `schema.sql`、`hardening.sql`、部署 Edge Functions，最後用新 project 的 publishable key 及 Keychain owner key 跑 `verify-hardening.mjs`。若要更動其他應用共用的 Auth 設定或 `public.handle_new_user`，先比對本檔與現況。

## 2026-10-29 晚上課堂試用版

- 在 Supabase Dashboard 新增專用 publishable key `interact`。新版學生端另行部署於 <https://chinhsi.github.io/InterAct-preview/>（repo `chinhsi/InterAct-preview`）；Pages workflow 成功。瀏覽器實測學生加入臨時場次並送出訊息，SQL 確認寫入 `interact.messages`；測試場次與訊息已清除。
- macOS arm64 試用版安裝於 `/Users/chinhsi/Applications/InterActPreview/InterActPreview.app`，DMG 為 `release/InterActPreview.dmg`。Preview 的 Electron userData、sessionData 與可攜設定檔位置均與舊版分開。實際啟動確認專案 ref、publishable key 和學生網址指向新版、管理金鑰欄空白；在 Mac UI 按「測試連線」成功。
- 使用者已在 Preview 系統設定親自貼入新管理金鑰。Mac UI 成功建立場次 `582e5b7e-0eef-460c-8a9b-8298995725fe`；QR 網址指向 Preview 站與新 project。Chrome 學生端加入後，Mac 講師面板顯示 1 人在線；學生送出訊息後 SQL 查 `interact.messages` 有 1 筆。測試場次已經 `presenter-action/delete_session` 清除，SQL 確認 sessions/messages 各 0。重開 Mac App 後「管理場次」正常載入且尚未結束 0，最後留在「建立新場次」首頁供使用者上課。金鑰留在本機，不寫入 repo。原 `/Users/chinhsi/Applications/InterAct.app`、`chinhsi/InterAct` main 和 <https://chinhsi.github.io/InterAct/> 仍為舊版，可作備用入口。
- 尚未用真手機掃碼，也未驗證錄音、截圖等功能；升級 PR 仍為草稿。先前完成的 23/23 權限測試與 AI 報告測試各有其測試範圍。

上方「待完成」清單是試用版部署前的紀錄，正式版 Pages 變數尚未切換，Preview 已使用自己的 repo 與變數。

## 2026-10-29 OpenRouter 備援

- 使用者指定沿用十秒課堂正在用的 OpenRouter key，不使用另一把舊 key。本機金鑰指紋已與十秒課堂 `TEN_SECOND_OPENROUTER_API_KEY` secret 核對相同；同一值另設於新版 InterAct project 的 `INTERACT_OPENROUTER_API_KEY` Edge secret。值不在 repo、Mac App、Pages 或本文件。十秒課堂的 secret 未改。
- 非即時 Gemini `generateContent` 呼叫在 404／408／429／5xx 或逾時時，改以 OpenRouter 的 `google/gemini-3.8-flash` 重試一次；400、401、403 等不可重試錯誤不轉送。支援文字、普通圖片和學生口說題提交的 WAV 錄音；PDF 與其他檔案保持原有 Gemini 兩模型流程。Gemini Live 字幕及 OpenAI 即時口譯不走此備援。此路由仍使用 Google 模型，只是另一把金鑰與 OpenRouter 通道，不能稱跨模型供應商備援。
- 更新並部署 `analyze-question`、`analyze-session`、`generate-exit-ticket`、`presenter-action`、`participant-action` 到 ref `zgtilyeloepqqyfezmca`。離線測試涵蓋正常 Gemini 不花 OpenRouter、429 切換、400 不重送、圖片／WAV 格式和錯誤遮蔽；用真實 OpenRouter 做一次極小 JSON 請求及一次短合成 WAV 請求，兩次均在模擬 Gemini 429 後成功。新版 Edge 部署後以空白測試場次呼叫 `analyze-session`，繁中和英文報告成功；測試場次 SQL 查已刪除。尚未在 Edge 端強制 Gemini 故障或用真學生錄音驗證備援的整條路徑。
- 口說題由瀏覽器壓縮錄製，提交前轉為 16 kHz、單聲道、16-bit PCM WAV；約 1.92 MB／分鐘，最長 180 秒約 5.76 MB，後端單檔限制 10 MiB。OpenRouter 備援會再將音訊編成 base64 傳出，資料量約多三分之一；多人同時交長錄音可能形成網路與 AI 服務尖峰。此容量估算不是多人實測結果。討論板上的錄音卡片另保留瀏覽器壓縮格式，不走此口說評測流程。

## 2026-10-29 8934 課堂現場進度與可用功能

- Preview 版的 Mac 建課、QR 指向 Preview 學生網站、Chrome 學生加入、在線人數及學生文字訊息已實測成功。這是新版的基本互動路徑；原 InterAct 和十秒課堂仍為獨立程式。
- 現場一筆口說題錄音的 `audio_responses.analysis_status='success'`，但題目仍為 `active`，故「綜整全班口說」尚不能啟動。老師需先停止作答；這個介面門檻目前容易被誤認為 AI 卡住。尚未確認現場全班綜整成功，也沒有多人同時錄音測試。
- 現場搶答顯示「1 人可搶答」但未顯示得主。這是合資格人數，不是成功搶到的人數。資料庫四次事件都無 `winner_id`，Edge 日誌顯示學生 `participant-action` 請求 401；原因為學生端 `claimBuzzer` 漏帶 `participantToken`。修正提交 `9740541` 已推到 Preview main 及 fork 升級分支，TypeScript 通過，Pages run `40845128807` 成功；公開站 index 已更新。學生需重新整理網頁、老師開新一輪並按「開始搶答」再複測。尚未將這次發布視為真人搶答驗收成功；Mac App 不需重裝。
- 目前可優先用於課堂：QR 加入與文字／彈幕收回饋（基本路徑已測）、抽籤或抽未作答者、老師口頭提出問題後開手機投票或問答。搶答已修正但待重試；口說題已有單人 AI 評測證據，操作時要先停止作答才可做全班綜整。
- 程式另提供截圖派題、多種題型（投票、選擇、文字問答、排序、配對、圖上點選、電寫、討論板、上傳、口說、自訂測驗）、即時字幕／口譯、匿名、課後 AI 報告、Exit Ticket、Excel 原始紀錄匯出、參與度與名單。這是程式功能清單，不代表 Preview 在本班逐項驗收；截圖需 Mac 螢幕錄製權限，錄音／多人併發、字幕、匯出、Exit Ticket 和實際課堂報告仍待實測。空白測試場次的中英文 AI 報告已成功，不能等同有學生資料的報告。
- 後續驗收按課堂風險優先：學生重載後搶答得主姓名、口說題停止後全班綜整、課後 Excel 匯出與有資料的報告、截圖權限、錄音／字幕與多人同時提交。現場失敗先看對應 Edge HTTP 狀態與資料庫事件，不直接改正在進行的場次。
