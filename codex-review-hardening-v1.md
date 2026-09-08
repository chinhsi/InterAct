| 直接 UPDATE／DELETE | schema 尾端未授予前端權限；新 presenter UID 也不會因此獲得直接寫入權。 |

依據：[hardening.sql:59](/Users/chinhsi/InterAct/supabase/hardening.sql:59)、[hardening.sql:133](/Users/chinhsi/InterAct/supabase/hardening.sql:133)、[schema.sql:371](/Users/chinhsi/InterAct/supabase/schema.sql:371)、[schema.sql:524](/Users/chinhsi/InterAct/supabase/schema.sql:524)。

因此，**一般直接資料表操作的 A→B 隔離成立；整個系統的隔離仍被上述 RPC、Edge Function、Storage 與部署問題破壞。**

另須接受目前的信任邊界：知道 B 的有效代碼或 UUID，就可以自行加入 B，隨後讀取 B 所有 membership 可讀資料，沒有教師核准。匿名 Auth 只識別瀏覽器，不證明其為該班學生。

**後續強化建議**

- **縮小 `lookup_session` 回傳與加入憑證的用途。**  
  [participant-action/index.ts:61](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:61) 不要求 UID，支援 code **及 UUID**，且回傳整列，包含已結束場次。[sessions 定義](/Users/chinhsi/InterAct/supabase/schema.sql:3) 沒有 owner key、presenter token 或 AI secret，但有課堂標題、時間、current question UUID、Exit Ticket 題目、短網址及錄製／字幕設定。這些是未加入者不一定需要知道的課堂資訊；UUID 查詢還會回傳可供加入的 code。

  [create-session/index.ts:6](/Users/chinhsi/InterAct/supabase/functions/create-session/index.ts:6) 使用 32 字元、6 位密碼學亂數代碼，共 `2^30` 種，沒有 modulo bias，也不是順序碼。它不代表能輕易掃完整個空間，但目前有明確存在性 oracle、沒有應用層 lookup／join 限流；500/h 限制的是匿名帳號建立，**不限制這些查詢**。建議回傳明確 DTO，限制請求頻率、支援 join code 輪替／失效，若要求班級隱私則增加入班授權。

- **presenter 權限是永久、全專案的 bearer 身分，需要撤權機制。**  
  [auth.ts:22](/Users/chinhsi/InterAct/supabase/functions/_shared/auth.ts:22) 只 upsert，`last_seen_at` 沒有用於到期判斷。換 owner key 不會刪除已登錄 UID，舊瀏覽器仍可刷新 Auth session 並讀所有課堂。應提供明確撤權、到期或授權版本機制。

  call sites 已核對：`create-session`、`verify_owner_key`、`list_sessions` 三處。  
  [presenter-action/index.ts:218](/Users/chinhsi/InterAct/supabase/functions/presenter-action/index.ts:218) 的一般操作接受 owner key **或該課堂 presenter token**，但不執行 `registerPresenter`。因此 session token 能管理對應課堂是既有能力授權，不能據此取得全域 presenter UID；相反地，僅走一般 owner 操作的新 UID 可能仍讀不到資料。

- **同課堂成員仍能讀取具名答案、Exit Ticket 與匿名彈幕的作者。**  
  `participant_name` 和 `participant_id` 仍直接暴露在 messages／answers／exit_tickets；anonymous mode 是顯示匿名，並非對同學保密。這是目前 membership 設計的結果，不是跨 B 的 policy 漏洞。若產品承諾匿名，應提供去識別資料流，將個人回覆限制為本人／教師可讀。

- **Security definer 寫法基本合理，但應收窄環境與驗證成本。**  
  [hardening.sql:24](/Users/chinhsi/InterAct/supabase/hardening.sql:24) 的兩個 helper 都固定 `search_path = public`，表與 `auth.uid()` 使用 schema-qualified 名稱，沒有動態 SQL；未找到直接 search-path 注入途徑。建議改為空 search path 並維持完整限定名稱，確認不信任角色沒有 `CREATE ON SCHEMA public`，以及函式 owner 確實具備必要的 RLS bypass。

  `STABLE` 適合這種以同一 statement snapshot 讀 membership 的函式，**不是永久快取，也不代表每個 session 只執行一次**。presenter PK 與 auth_uid index 已有；建議補 `(auth_uid, session_id)` 複合索引，再以實際查詢計畫及課堂規模壓測。無參數 presenter 判斷可考慮 initPlan，但不能把依 row session 變化的 membership 判斷誤當全查詢常數。[RLS 效能建議](https://supabase.com/docs/guides/database/postgres/row-level-security)

  Realtime 每個變更會對每個訂閱者做授權；participants heartbeat 尤其容易放大負載。另 **DELETE 通知不能宣稱具有相同 row RLS 隔離**，可能暴露被刪除 row 的主鍵／存在性，應補測或改用有授權的 Broadcast。[Realtime 官方限制](https://supabase.com/docs/guides/realtime/postgres-changes)

- **匿名登入一般能支援三小時課堂，但錯誤與恢復流程不完整。**  
  [src/lib/supabase.ts:72](/Users/chinhsi/InterAct/src/lib/supabase.ts:72) 沒有關閉 SDK 的 `autoRefreshToken`／`persistSession`。目前安裝的 SDK 預設兩者為 true，刷新後也會更新 Realtime token。預設一小時 JWT 到期不等於一小時後必須重新匿名註冊；正常 refresh 保留相同 UID。[Supabase session 說明](https://supabase.com/docs/guides/auth/sessions)

  Electron `file://` renderer 仍具有 window/document，SDK 會視為瀏覽器，不會因 Origin 為 file 就自動停用刷新。但背景隱藏時會停止主動 refresh timer，重新顯示時恢復；仍需測試最小化超過一小時、休眠、斷線、多視窗與持久儲存。這次沒有執行三小時 Electron 實測。

  [supabase.ts:110](/Users/chinhsi/InterAct/src/lib/supabase.ts:110) 把 sign-in error 吞掉，[App.tsx:24](/Users/chinhsi/InterAct/src/App.tsx:24) 在 finally 後照樣渲染：直接 DB 讀取通常空集合／錯誤，join 回 401，**不會因此繞過 RLS**，但 UI 會進入不可用狀態。應顯示可重試錯誤並監聽後續失去登入狀態。

  另外，[JoinPage.tsx:47](/Users/chinhsi/InterAct/src/routes/JoinPage.tsx:47) 舊 participant token 的 heartbeat 成功就跳頁；若 Auth UID 已更換，heartbeat 成功不代表新 UID 已具有 membership。應走經 token 驗證的 membership 恢復流程。

  500/h 為每 IP 匿名註冊額度，共用校園出口仍可能耗盡；本機 `config.toml` 也不能證明 hosted project 已同步設定。[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

**其他 Edge Function 核對結果與小問題**

- 除 `claim_buzzer`、公開 lookup／join 外，heartbeat、自訂測驗、檔案上傳、錄音上傳／結果都使用 `verifyParticipant`；它把 token hash、participant ID 與 session 綁定。[participant-action/index.ts:30](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:30)  
  AI 分析、Exit Ticket 生成、縮網址、OpenAI／Gemini relay 則驗證 session 對應 presenter token。未找到另一個僅憑 participantId/sessionId 的同型入口。但 participant token 未綁目前 Auth UID，應明確定義其撤銷與 rebind 行為。

- INSERT 的業務限制仍有缺口：[hardening.sql:133](/Users/chinhsi/InterAct/supabase/hardening.sql:133) 不檢查 `danmaku_enabled`；Exit Ticket 只限制 `response_text`，未限制舊的自由文字欄位。這些可造成同課堂違反操作規則或資源濫用，並非跨課堂寫入。

- `hardening.sql` 自稱 idempotent，但只 drop 舊名稱，未 drop 自己建立的 `members read ...` policies；第二次執行會在 [第 60 行](/Users/chinhsi/InterAct/supabase/hardening.sql:60) 開始遇到重名錯誤。應讓 migration 可安全重跑並使用交易。

- 已結束課堂的 join 回傳虛構 participant/token，沒有建立 membership，因此首次加入的「唯讀」使用者無法讀取歷史資料：[participant-action/index.ts:93](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:93)。這是功能回歸，不能用放寬全表讀取解決。

- **18 checks 不足以證明這次安全目標。** [verify-hardening.mjs:104](/Users/chinhsi/InterAct/scripts/verify-hardening.mjs:104) 所謂另一課堂其實沒有建立 B；answers 也沒有預先放入應被隔離的測試資料。Realtime 只測 sessions UPDATE。應新增真正 A/B 資料、同班身分接管、兩個 RPC 入口、漏測表／Storage、owner key 缺失、重跑部署，以及 token refresh／DELETE 通知等回歸案例。
tokens used
78,861
**結論：這個變更改善了直接 SELECT 的跨課堂隔離，但目前不宜視為安全審查通過。** 仍有跨課堂寫入、學員身分劫持，以及部署時重新開放全庫讀取的問題。

以下依 HEAD `888d7ac`、完整 schema 與相關程式碼靜態審查；未重新執行會修改線上資料的驗證腳本。部署端若另有 ACL 或 gateway 設定，需再比對實際狀態。

**優先修正的漏洞**

1. **[高] `bump_participant_presence` 可繞過 RLS，修改任意課堂學員的出席資料。**

   [supabase/schema.sql:684](/Users/chinhsi/InterAct/supabase/schema.sql:684) 建立 `SECURITY DEFINER` RPC，更新條件只有 `where id = target_id`，沒有 `auth.uid()`、課堂 membership 或 participant token 檢查，也沒有撤銷函式 EXECUTE。

   攻擊者知道 B 課堂某個 participant UUID 後，可直接呼叫：

   ```js
   await client.rpc('bump_participant_presence', {
     target_id: victimId,
     unfocused_delta: 86400000,
     focus_streak: 86400000
   })
   ```

   即使未加入 B，也能竄改最後在線時間、分心時間與專注紀錄，且繞過 heartbeat 的數值上限。UUID 需事先取得，這不是直接列舉全部學員的漏洞。

   `schema.sql:524` 的 `revoke all on all tables` **不涵蓋函式**。PostgreSQL 預設給新函式 `PUBLIC EXECUTE`，因此依目前腳本與預設 ACL，此入口公開。[PostgreSQL 官方說明](https://www.postgresql.org/docs/current/sql-createfunction.html)

   **修正：**撤銷 `PUBLIC, anon, authenticated` 的 EXECUTE，只授予 `service_role`，讓已驗證 token 的 heartbeat 使用；可比照 [schema.sql:368](/Users/chinhsi/InterAct/supabase/schema.sql:368) 的 `claim_buzzer`。

2. **[高] `device_id` 可讀且由客戶端指定，可直接劫持同學身分。**

   [hardening.sql:63](/Users/chinhsi/InterAct/supabase/hardening.sql:63) 允許成員讀取同課堂所有 participants 欄位，包括 `device_id`。接著 [participant-action/index.ts:110](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:110) 只憑 `(session_id, device_id)` 找回身分；第 127 行把 `auth_uid` 改成攻擊者，第 140 行重新發 token 並覆寫舊 token hash。

   具體攻擊：

   - 正常加入課堂，SELECT 同學的 `id, device_id`。
   - 再呼叫 `join_session`，填入受害者的 `deviceId`，姓名可任填。
   - 取得受害者身分的新 participant token，並成為該 participant row 的 `auth_uid`。
   - 冒名發言、提交尚未送出的答案、取得受害者測驗／錄音結果；受害者原 token 同時失效。

   這不會直接改寫已有唯一約束保護的答案，但已構成完整身分接管。

   跨課堂也有延伸風險：[device.ts:1](/Users/chinhsi/InterAct/src/lib/device.ts:1) 使用全域 localStorage device ID，同一瀏覽器在 A、B 通常相同。在 A 得知某人的 device ID，再知道 B 的代碼或 UUID，即可嘗試接管其 B 身分。

   **修正：**換 UID 必須提供有效舊 participant token，並以交易／條件更新完成 rebind 與 token rotation。沒有憑證就建立新身分或由教師復原。單純隱藏 device ID 不足以修復授權邏輯。

3. **[高，條件式] 沒設定 owner key 時，任何匿名使用者都能取得全專案 presenter 讀取權。**

   [create-session/index.ts:43](/Users/chinhsi/InterAct/supabase/functions/create-session/index.ts:43) 是：

   ```ts
   if (ownerKeyConfigured() && !isOwner(input)) ...
   ```

   secret 不存在或為空白時會放行，之後第 57 行無條件 `registerPresenter`。攻擊者只需匿名登入、送出 `x-interact-client: windows-app`，並省略 Origin；[第 19 行](/Users/chinhsi/InterAct/supabase/functions/create-session/index.ts:19) 的桌面判斷可由普通 HTTP 客戶端偽造。

   結果不只是可自行開課，而是 UID 被登錄後，可以讀取**既有所有課堂**。

   **若 owner key 確實已設定，未找到無 key 的登錄繞過：**`callerUid` 透過 Auth 伺服器驗證 bearer，不信任 body 中的 UID；presenter table 也禁止前端寫入。問題是缺少 secret 時 fail-open。

   **修正：**未設定 secret 應拒絕建立場次與升權，不能沿用舊版開放模式。

4. **[高] 自動部署沒有套用 hardening，重跑 schema 更會恢復全公開讀取。**

   [src/lib/backendDeploy.ts:16](/Users/chinhsi/InterAct/src/lib/backendDeploy.ts:16) 只打包 `schema.sql`，[第 131 行](/Users/chinhsi/InterAct/src/lib/backendDeploy.ts:131) 也只執行該檔。CLI 部署腳本同樣如此：[deploy-supabase.ps1:19](/Users/chinhsi/InterAct/skills/interact-self-deploy/scripts/deploy-supabase.ps1:19)。

   對已 hardened 的專案重新執行 schema，會重新建立 [schema.sql:393](/Users/chinhsi/InterAct/supabase/schema.sql:393) 起的 `using (true)` policies。它們與 membership policies 並存時，permissive policies 以 OR 組合，於是重新開放全庫 SELECT；也重新授予 participants INSERT。

   此時學生直接呼叫 REST，即可重現原本的資料外洩。全新部署則另會缺少 `auth_uid`／`presenter_uids`，造成新版流程失敗。

   **修正：**把安全變更納入正式 migration／部署流程，並移除 base schema 的不安全定義。部署驗證應檢查有效 policies、函式 ACL 與匿名 Auth 設定，而不只檢查表是否存在。

5. **[中] `claim_buzzer` Edge Function 不驗證 participant token，可冒名跨課堂搶答並取得事件內容。**

   [participant-action/index.ts:546](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:546) 到第 584 行，只確認 session active、participant 屬於該 session，然後用 service role 呼叫 RPC。完全沒有呼叫 `verifyParticipant`。

   持有 B 的 `sessionId、participantId、eventId` 者，可以省略 participant token，冒用候選學員搶答。RPC 的候選名單與期限檢查限制了攻擊時機，**沒有證明呼叫者身分**。回傳的 event payload 也可能包含候選者／得獎者資訊；部分失敗回應同樣附帶 event。

   [config.toml:6](/Users/chinhsi/InterAct/supabase/config.toml:6) 又停用了該函式 gateway JWT 驗證，因此不能依賴 gateway 補足授權。

   **修正：**在查詢與 RPC 前呼叫 `verifyParticipant`，並以驗證後的 participant ID 操作。

6. **[中] Storage 公開 URL 不受課堂 membership 保護。**

   [schema.sql:705](/Users/chinhsi/InterAct/supabase/schema.sql:705) 明確設定：

   - `interact-screenshots`：公開。
   - `interact-files`：公開，包含學員上傳檔案。
   - `interact-recordings`：私人。

   攻擊者取得 B 的截圖或檔案 URL／完整路徑後，可在未加入 B、甚至未登入時下載。路徑中的 UUID 降低猜測機率，但分享或外洩 URL 後，資料表 RLS 無法阻止存取。[Supabase 公開 bucket 說明](https://supabase.com/docs/guides/storage/buckets/fundamentals)

   **這不是任意列舉 bucket 或任意寫入的證據。** 完整歷史 migration 已移除 screenshot listing／upload policies，signed upload 仍由 Edge Function 控制。

   **修正：**需要課堂隔離的 bucket 改私人，由驗證 membership／participant token 的端點發短效 signed URL。

**逐項核對 RLS 與 grants**

以下假設依序完整執行 `schema.sql → hardening.sql`，沒有其他殘留 permissive policies：

| 表／操作 | 結果 |
|---|---|
| `sessions` | `interact_member_of(id)`；A 成員無法直接 SELECT B。 |
| `participants`, `messages`, `screenshots`, `questions`, `answers`, `ai_summaries`, `exit_tickets` | 依 row 的 `session_id` 限制。 |
| `shared_contents`, `shared_files`, `caption_segments`, `session_events` | 同樣依 `session_id` 限制。 |
| `quizzes` | membership 加上對應 question／session 檢查。 |
| `quiz_items` | 經 quizzes、questions 與 membership 判斷；關聯表的 RLS 也生效。 |
| `quiz_item_keys`, `quiz_attempts`, `quiz_item_answers` | RLS 開啟，前端權限撤銷；沒有 SELECT policy 是拒絕存取，不是漏洞。 |
| `audio_responses`, `file_responses`, `participant_session_keys` | 同上，service role 端點負責授權。 |
| `presenter_session_keys` | RLS 開啟，schema 尾端撤銷前端權限，沒有公開 policy。 |
| `presenter_uids` | hardening 明確撤銷 `PUBLIC/anon/authenticated` 權限。 |
| `participants INSERT` | hardening 再撤銷權限並刪除 join policy，前端不能自行建立 membership。 |
| `messages/answers/exit_tickets INSERT` | 校驗 participant ID、session、姓名及 `auth.uid()`；answers 另檢查 question 所屬 session。不能以 A participant 寫入 B。 |
| 直接 UPDATE／DELETE | schema 尾端未授予前端權限；新 presenter UID 也不會因此獲得直接寫入權。 |

依據：[hardening.sql:59](/Users/chinhsi/InterAct/supabase/hardening.sql:59)、[hardening.sql:133](/Users/chinhsi/InterAct/supabase/hardening.sql:133)、[schema.sql:371](/Users/chinhsi/InterAct/supabase/schema.sql:371)、[schema.sql:524](/Users/chinhsi/InterAct/supabase/schema.sql:524)。

因此，**一般直接資料表操作的 A→B 隔離成立；整個系統的隔離仍被上述 RPC、Edge Function、Storage 與部署問題破壞。**

另須接受目前的信任邊界：知道 B 的有效代碼或 UUID，就可以自行加入 B，隨後讀取 B 所有 membership 可讀資料，沒有教師核准。匿名 Auth 只識別瀏覽器，不證明其為該班學生。

**後續強化建議**

- **縮小 `lookup_session` 回傳與加入憑證的用途。**  
  [participant-action/index.ts:61](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:61) 不要求 UID，支援 code **及 UUID**，且回傳整列，包含已結束場次。[sessions 定義](/Users/chinhsi/InterAct/supabase/schema.sql:3) 沒有 owner key、presenter token 或 AI secret，但有課堂標題、時間、current question UUID、Exit Ticket 題目、短網址及錄製／字幕設定。這些是未加入者不一定需要知道的課堂資訊；UUID 查詢還會回傳可供加入的 code。

  [create-session/index.ts:6](/Users/chinhsi/InterAct/supabase/functions/create-session/index.ts:6) 使用 32 字元、6 位密碼學亂數代碼，共 `2^30` 種，沒有 modulo bias，也不是順序碼。它不代表能輕易掃完整個空間，但目前有明確存在性 oracle、沒有應用層 lookup／join 限流；500/h 限制的是匿名帳號建立，**不限制這些查詢**。建議回傳明確 DTO，限制請求頻率、支援 join code 輪替／失效，若要求班級隱私則增加入班授權。

- **presenter 權限是永久、全專案的 bearer 身分，需要撤權機制。**  
  [auth.ts:22](/Users/chinhsi/InterAct/supabase/functions/_shared/auth.ts:22) 只 upsert，`last_seen_at` 沒有用於到期判斷。換 owner key 不會刪除已登錄 UID，舊瀏覽器仍可刷新 Auth session 並讀所有課堂。應提供明確撤權、到期或授權版本機制。

  call sites 已核對：`create-session`、`verify_owner_key`、`list_sessions` 三處。  
  [presenter-action/index.ts:218](/Users/chinhsi/InterAct/supabase/functions/presenter-action/index.ts:218) 的一般操作接受 owner key **或該課堂 presenter token**，但不執行 `registerPresenter`。因此 session token 能管理對應課堂是既有能力授權，不能據此取得全域 presenter UID；相反地，僅走一般 owner 操作的新 UID 可能仍讀不到資料。

- **同課堂成員仍能讀取具名答案、Exit Ticket 與匿名彈幕的作者。**  
  `participant_name` 和 `participant_id` 仍直接暴露在 messages／answers／exit_tickets；anonymous mode 是顯示匿名，並非對同學保密。這是目前 membership 設計的結果，不是跨 B 的 policy 漏洞。若產品承諾匿名，應提供去識別資料流，將個人回覆限制為本人／教師可讀。

- **Security definer 寫法基本合理，但應收窄環境與驗證成本。**  
  [hardening.sql:24](/Users/chinhsi/InterAct/supabase/hardening.sql:24) 的兩個 helper 都固定 `search_path = public`，表與 `auth.uid()` 使用 schema-qualified 名稱，沒有動態 SQL；未找到直接 search-path 注入途徑。建議改為空 search path 並維持完整限定名稱，確認不信任角色沒有 `CREATE ON SCHEMA public`，以及函式 owner 確實具備必要的 RLS bypass。

  `STABLE` 適合這種以同一 statement snapshot 讀 membership 的函式，**不是永久快取，也不代表每個 session 只執行一次**。presenter PK 與 auth_uid index 已有；建議補 `(auth_uid, session_id)` 複合索引，再以實際查詢計畫及課堂規模壓測。無參數 presenter 判斷可考慮 initPlan，但不能把依 row session 變化的 membership 判斷誤當全查詢常數。[RLS 效能建議](https://supabase.com/docs/guides/database/postgres/row-level-security)

  Realtime 每個變更會對每個訂閱者做授權；participants heartbeat 尤其容易放大負載。另 **DELETE 通知不能宣稱具有相同 row RLS 隔離**，可能暴露被刪除 row 的主鍵／存在性，應補測或改用有授權的 Broadcast。[Realtime 官方限制](https://supabase.com/docs/guides/realtime/postgres-changes)

- **匿名登入一般能支援三小時課堂，但錯誤與恢復流程不完整。**  
  [src/lib/supabase.ts:72](/Users/chinhsi/InterAct/src/lib/supabase.ts:72) 沒有關閉 SDK 的 `autoRefreshToken`／`persistSession`。目前安裝的 SDK 預設兩者為 true，刷新後也會更新 Realtime token。預設一小時 JWT 到期不等於一小時後必須重新匿名註冊；正常 refresh 保留相同 UID。[Supabase session 說明](https://supabase.com/docs/guides/auth/sessions)

  Electron `file://` renderer 仍具有 window/document，SDK 會視為瀏覽器，不會因 Origin 為 file 就自動停用刷新。但背景隱藏時會停止主動 refresh timer，重新顯示時恢復；仍需測試最小化超過一小時、休眠、斷線、多視窗與持久儲存。這次沒有執行三小時 Electron 實測。

  [supabase.ts:110](/Users/chinhsi/InterAct/src/lib/supabase.ts:110) 把 sign-in error 吞掉，[App.tsx:24](/Users/chinhsi/InterAct/src/App.tsx:24) 在 finally 後照樣渲染：直接 DB 讀取通常空集合／錯誤，join 回 401，**不會因此繞過 RLS**，但 UI 會進入不可用狀態。應顯示可重試錯誤並監聽後續失去登入狀態。

  另外，[JoinPage.tsx:47](/Users/chinhsi/InterAct/src/routes/JoinPage.tsx:47) 舊 participant token 的 heartbeat 成功就跳頁；若 Auth UID 已更換，heartbeat 成功不代表新 UID 已具有 membership。應走經 token 驗證的 membership 恢復流程。

  500/h 為每 IP 匿名註冊額度，共用校園出口仍可能耗盡；本機 `config.toml` 也不能證明 hosted project 已同步設定。[Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

**其他 Edge Function 核對結果與小問題**

- 除 `claim_buzzer`、公開 lookup／join 外，heartbeat、自訂測驗、檔案上傳、錄音上傳／結果都使用 `verifyParticipant`；它把 token hash、participant ID 與 session 綁定。[participant-action/index.ts:30](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:30)  
  AI 分析、Exit Ticket 生成、縮網址、OpenAI／Gemini relay 則驗證 session 對應 presenter token。未找到另一個僅憑 participantId/sessionId 的同型入口。但 participant token 未綁目前 Auth UID，應明確定義其撤銷與 rebind 行為。

- INSERT 的業務限制仍有缺口：[hardening.sql:133](/Users/chinhsi/InterAct/supabase/hardening.sql:133) 不檢查 `danmaku_enabled`；Exit Ticket 只限制 `response_text`，未限制舊的自由文字欄位。這些可造成同課堂違反操作規則或資源濫用，並非跨課堂寫入。

- `hardening.sql` 自稱 idempotent，但只 drop 舊名稱，未 drop 自己建立的 `members read ...` policies；第二次執行會在 [第 60 行](/Users/chinhsi/InterAct/supabase/hardening.sql:60) 開始遇到重名錯誤。應讓 migration 可安全重跑並使用交易。

- 已結束課堂的 join 回傳虛構 participant/token，沒有建立 membership，因此首次加入的「唯讀」使用者無法讀取歷史資料：[participant-action/index.ts:93](/Users/chinhsi/InterAct/supabase/functions/participant-action/index.ts:93)。這是功能回歸，不能用放寬全表讀取解決。

- **18 checks 不足以證明這次安全目標。** [verify-hardening.mjs:104](/Users/chinhsi/InterAct/scripts/verify-hardening.mjs:104) 所謂另一課堂其實沒有建立 B；answers 也沒有預先放入應被隔離的測試資料。Realtime 只測 sessions UPDATE。應新增真正 A/B 資料、同班身分接管、兩個 RPC 入口、漏測表／Storage、owner key 缺失、重跑部署，以及 token refresh／DELETE 通知等回歸案例。
