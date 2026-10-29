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
- 新 Mac 版尚未在真實桌面、手機和付費 AI 路徑驗收；目前 PR 保持草稿，不能標為已上線。

再次部署時先確認目標 ref，再依序套用 `schema.sql`、`hardening.sql`、部署 Edge Functions，最後用新 project 的 publishable key 及 Keychain owner key 跑 `verify-hardening.mjs`。若要更動其他應用共用的 Auth 設定或 `public.handle_new_user`，先比對本檔與現況。
