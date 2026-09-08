/Users/chinhsi/.npm-global/bin/codex
codex-cli 0.153.4
| [main.cjs:195](/Users/chinhsi/InterAct/electron/main.cjs:195)、[main.cjs:214](/Users/chinhsi/InterAct/electron/main.cjs:214)：`moveTop()` | **API 正常**；不是聚焦，也不是跨 Space | 保留在使用者要求置前時；不要拿它修補全螢幕問題 |
| [main.cjs:222](/Users/chinhsi/InterAct/electron/main.cjs:222)：每 750 ms show／置頂 | **體驗與耗電風險** | macOS 優先以視窗／顯示器事件更新；暫停於隱藏、最小化及退出過程。若系統修正 bounds，現有嚴格比較也可能每次都重設 |
| [main.cjs:277](/Users/chinhsi/InterAct/electron/main.cjs:277)：`visibleOnFullScreen` | **正確方向**；可能短暫造成 Dock／視窗閃動 | 不要週期性重設。`skipTransformProcessType: true` 只適用已是 UIElement 的情況；不要為消除閃動盲目加上 |
| [main.cjs:261](/Users/chinhsi/InterAct/electron/main.cjs:261)：`skipTaskbar` | **正常但語義不同**；不能當成完整 Mission Control 策略 | 非互動 overlay 可加 `hiddenInMissionControl: true`；保留主要 app 的 Dock 入口 |
| [main.cjs:583](/Users/chinhsi/InterAct/electron/main.cjs:583)：`setBounds(bounds, true)` | **macOS 特有動畫／競態風險**，動畫參數在 Windows 不生效 | 框選切換使用 `false`，不要以固定 30／60 ms 假設動畫完成 |
| [main.cjs:48](/Users/chinhsi/InterAct/electron/main.cjs:48)、[main.cjs:572](/Users/chinhsi/InterAct/electron/main.cjs:572)：固定 760 高面板 | **小工作區體驗缺陷**，非 macOS 專屬 | 尺寸先限制在 `workArea`，內部捲動，再 clamp 位置；目前工作區不足時 clamp 上下界會反轉 |
| [main.cjs:588](/Users/chinhsi/InterAct/electron/main.cjs:588)：`size × scaleFactor` | **正常**，已有 Retina 考量 | renderer 使用實際 image 尺寸也是對的；需補的是原點，不是再乘一次 `devicePixelRatio` |
| [main.cjs:752](/Users/chinhsi/InterAct/electron/main.cjs:752)：依索引／`screen:${displayIndex}:` fallback | **多螢幕可靠性缺陷** | 優先 `display_id` 正確；沒有對應時提供選擇或報錯，不能保證兩個 API 的陣列順序及 ID 編碼一致 |
| [main.cjs:561](/Users/chinhsi/InterAct/electron/main.cjs:561)：以控制面板 bounds 選螢幕 | **正常但有限制** | 彈幕跟隨面板，不一定跟隨投影幕；可新增目標顯示器選擇 |
| `screen.getCursorScreenPoint()` | **本版沒有呼叫** | 若未來使用，macOS 支援、回傳 DIP；單純讀游標位置不應要求 Screen Recording／Accessibility。[screen 文件](https://www.electronjs.org/docs/latest/api/screen#screengetcursorscreenpoint) |
| [main.cjs:39](/Users/chinhsi/InterAct/electron/main.cjs:39)：`CalculateNativeWinOcclusion` | **macOS 無實質用途** | 加 `win32` guard；它不會停用 macOS 的背景節流 |
| [main.cjs:59](/Users/chinhsi/InterAct/electron/main.cjs:59)：`setAppUserModelId` | **Windows 專用設定；目前不是已證實啟動阻擋** | 同樣加 `win32` guard，清楚表達平台用途 |
| [main.cjs:137](/Users/chinhsi/InterAct/electron/main.cjs:137) 及 325、403、457、527：`setAppDetails` | **diff 修正正確** | 五處均已 guard，沒有漏掉另一處呼叫 |
| [main.cjs:43](/Users/chinhsi/InterAct/electron/main.cjs:43)：`icon.ico` | **圖示冗餘／可能無效，不是啟動 bug** | macOS 不依 Windows window icon 設定 Dock 圖示；略過該 option，依 app bundle icon。ICO extraResource 限 Windows |
| [main.cjs:46](/Users/chinhsi/InterAct/electron/main.cjs:46)：`PORTABLE_EXECUTABLE_FILE` | **正常 fallback**；macOS 未設定時用 `process.execPath`，且 relaunch 內容已在 Windows guard 內 | 將常數移入 Windows 專用設定即可 |
| [main.cjs:9](/Users/chinhsi/InterAct/electron/main.cjs:9)、[main.cjs:108](/Users/chinhsi/InterAct/electron/main.cjs:108)、[main.cjs:74](/Users/chinhsi/InterAct/electron/main.cjs:74)：userData、loadFile、openExternal | **正常跨平台** | 路徑基於 userData／resources／`__dirname`，沒有 Windows 磁碟機假設；一般 HTTPS 開啟不需 Automation 權限 |

置頂層級、mouse forwarding 與視窗 API 的判定依據為 [Electron BaseWindow 文件](https://www.electronjs.org/docs/latest/api/base-window)；其中明確提醒避免超過 `screen-saver + 1`。

**生命週期：基本骨架正確，關閉與重新啟用的語義需一致**

- [main.cjs:806](/Users/chinhsi/InterAct/electron/main.cjs:806)：`window-all-closed` 在 macOS 不 quit，**正常**。
- [main.cjs:789](/Users/chinhsi/InterAct/electron/main.cjs:789)：`activate` 能重建主視窗，**正常**；但測驗檢視期間主視窗被刻意隱藏，Dock activate 卻會重新顯示主視窗。**修正：**優先恢復現有 `quizReviewWindow`，也對最小化的 report 先 `restore()`。
- [main.cjs:801](/Users/chinhsi/InterAct/electron/main.cjs:801)：`before-quit` 設旗標並停 timer，**正確**；但 [main.cjs:475](/Users/chinhsi/InterAct/electron/main.cjs:475)、[main.cjs:542](/Users/chinhsi/InterAct/electron/main.cjs:542) 的 `closed` handler 仍嘗試恢復其他視窗。**修正：**清理 reference 後遇到 `isQuitting` 直接返回，避免退出時閃現或碰觸已銷毀視窗。
- [main.cjs:691](/Users/chinhsi/InterAct/electron/main.cjs:691)：自訂主視窗關閉按鈕直接 `app.quit()`；[main.cjs:339](/Users/chinhsi/InterAct/electron/main.cjs:339) 關報告也會退出整個 app。**屬產品行為／Mac 體驗差異，不是生命週期 API 壞掉。** 若保留，按鈕應明示「結束並離開」；若採 Mac 慣例，關窗與 Cmd-Q 分開處理。原生關窗路徑與自訂 X 也應一致。

**mac 打包設定與權限**

| 設定 | 評語 |
|---|---|
| [builder:63](/Users/chinhsi/InterAct/electron-builder.cjs:63)：PNG icon | **可用。** 現成 bundle 的 `CFBundleIconFile` 已是 `icon.icns`，所以不應誤判必須手動提供 ICNS 才能打包 |
| [builder:67](/Users/chinhsi/InterAct/electron-builder.cjs:67)：`hardenedRuntime: false` | **本機 ad-hoc 測試合理**；正式公證版本需開啟，並驗證 Electron JIT 與媒體相關 entitlements |
| [builder:68](/Users/chinhsi/InterAct/electron-builder.cjs:68)：`gatekeeperAssess: false` | **本機測試合理**；不會授予信任，也不能取代簽署／公證 |
| [builder:69](/Users/chinhsi/InterAct/electron-builder.cjs:69)：`extendInfo` | **用法正確**，兩個中文 usage description 已寫入產物 |
| [builder:70](/Users/chinhsi/InterAct/electron-builder.cjs:70)：Microphone | 必要且理由對應字幕／口譯；仍須使用者同意 |
| [builder:71](/Users/chinhsi/InterAct/electron-builder.cjs:71)：Camera | 未發現講師端 `getUserMedia({ video: ... })`；目前非必要。字串本身不會觸發提示，但不應用它解釋螢幕截圖 |
| 缺 `NSScreenCaptureUsageDescription` | 建議補「擷取教師選取的桌面區域並派送給學員」。Apple 現行 ScreenCaptureKit 文件要求說明；**不能據此直接斷言此 Electron／macOS 15 組合因缺鍵必然 crash**，仍須驗證實際擷取路徑。[Apple 文件](https://developer.apple.com/documentation/screencapturekit?changes=lat__4&language=objc) |
| 系統音訊說明 | 現有流程擷取螢幕 thumbnail 與麥克風，沒有桌面音訊 loopback；不應把系統音訊限制套到麥克風。產物已含預設 `NSAudioCaptureUsageDescription`，未來啟用 loopback 時需改為實際用途。[Electron 擷取文件](https://www.electronjs.org/docs/latest/api/desktop-capturer) |
| [builder:74](/Users/chinhsi/InterAct/electron-builder.cjs:74)：dir＋zip arm64 | **有效**；dir 是解包產物，ZIP 可供分發。Intel Mac 不能執行 arm64-only，Rosetta 不能反向解決；若承諾 Intel 支援，新增 x64 或 universal |
| [builder:11](/Users/chinhsi/InterAct/electron-builder.cjs:11)：`${productName}.${ext}` | **新增 mac ZIP 後產生跨平台撞名**：Windows 與 macOS 都叫 `InterAct.zip`。改成 `${productName}-${version}-${os}-${arch}.${ext}` 或至少覆寫 mac artifactName |

**不要混淆兩種 sandbox：**[main.cjs:130](/Users/chinhsi/InterAct/electron/main.cjs:130) 的 `webPreferences.sandbox: true` 是 Chromium renderer sandbox，並未啟用 Apple App Sandbox。

目前非 App Sandbox、未啟用 Hardened Runtime 的測試版，不能僅因沒有 entitlements 檔就判定麥克風不可用。正式 Hardened Runtime 版本應確認 `com.apple.security.device.audio-input`、Electron 所需的 `com.apple.security.cs.allow-jit`，以及 helper 的實際簽署權限；本機 `@electron/osx-sign` 預設檔已有這些項目，但須驗證最終產物。若另做 MAS／App Sandbox 版本，還要配置 app-sandbox、音訊輸入、network.client、helper inheritance 等。一般螢幕擷取仍需 TCC 同意，**不存在加一個通用 `com.apple.security.screen-capture` 就能免授權的修法**。[Apple 音訊 entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)、[Electron MAS 指引](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)

**Renderer 與指定 libraries**

| 檔案 | 結果與修正 |
|---|---|
| [device.ts:3](/Users/chinhsi/InterAct/src/lib/device.ts:3) | **正常**。只是 localStorage＋`crypto.randomUUID()`，沒有 Windows 硬體識別或路徑假設 |
| [audio.ts:21](/Users/chinhsi/InterAct/src/lib/audio.ts:21) | **正常**。Web Audio 解碼、依實際 sample rate 降採樣、PCM WAV；不是 Windows codec API |
| [liveCaptions.ts:77](/Users/chinhsi/InterAct/src/lib/liveCaptions.ts:77) | **無 macOS 專屬阻擋**。WebRTC 使用傳入的音軌；權限取得在 PresenterPage。分析器也有 `resume()` |
| [AudioRecorder.tsx:62](/Users/chinhsi/InterAct/src/components/AudioRecorder.tsx:62) | **正常且已有能力偵測**：使用 `MediaRecorder.isTypeSupported()`，沒有強制 Windows 格式 |
| [PresenterPage.tsx:378](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:378)、[PresenterPage.tsx:505](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:505) | **需要 Microphone 權限**。第一次 `getUserMedia` 可觸發提示；拒絕後需設定引導，不能只重試。裝置失效已有 fallback |
| [PresenterPage.tsx:39](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:39) | **錯誤文案確定不適用 Mac**。改「系統或程式未允許使用麥克風」，並利用 preload 的 `platform` 提供平台設定說明；`NotReadableError` 也不一定代表其他程式獨占 |
| [PresenterSettingsModal.tsx:86](/Users/chinhsi/InterAct/src/components/PresenterSettingsModal.tsx:86) | **一般健壯性改善**。預覽分析器沒有顯式 `resume()`；檢查 context state 並恢复，避免顯示假性零音量 |
| [PresenterNewPage.tsx:60](/Users/chinhsi/InterAct/src/routes/PresenterNewPage.tsx:60) | `'windows-app'` **目前不阻擋 Mac**，因為後端 [create-session:19](/Users/chinhsi/InterAct/supabase/functions/create-session/index.ts:19) 要求同一個 literal。改成 `'desktop-app'` 時必須後端同步兼容，否則會新增 403 |
| [PresenterPage.tsx:842](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:842)、[PresenterPage.tsx:892](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:892) | `captureWindowsScreen`、`windows-selection-...` **只是名稱**，沒有平台 guard；改名即可 |
| [preload.cjs:5](/Users/chinhsi/InterAct/electron/preload.cjs:5) | **正常**：sandboxed preload 可取得 `process.platform`，已安全橋接；renderer 未利用它分平台 |
| [README.md:28](/Users/chinhsi/InterAct/README.md:28) | **文件缺口**：仍只教下載 ZIP 後開 EXE。補 macOS 架構、安裝、測試版簽署狀態及權限流程 |

**合併前最小驗收範圍：**首次允許／拒絕截圖及麥克風；Retina 與外接螢幕框選位置；全螢幕簡報上的控制面板與彈幕；抽籤退出後方向鍵；Cmd-H／Cmd-M／Cmd-W／Cmd-Q／Dock activate；以及從下載 ZIP 解壓後的啟動。這些通過後，才足以把目前的啟動成功提升為可用的 macOS 課堂版本。
tokens used
95,812
**結論：這個 diff 足以做 macOS 啟動驗證，尚不足以視為課堂功能移植完成。** 優先處理截圖權限與座標、全螢幕 Space、抽籤焦點，以及可重現的簽署流程。

已完整閱讀 `electron/main.cjs` 808 行、preload、打包設定、diff、指定的三個 library，並搜尋 renderer 與相關後端的平台假設。另檢查現成 `.app`：arm64、`Signature=adhoc`，通過 `codesign --verify --deep --strict`；以下未宣稱已實測上課、錄音或多螢幕操作。

**優先修正：核心功能與發佈阻擋**

1. **[P1／權限處理缺陷] 螢幕錄製未授權時，截圖會失敗或取得受限內容，畫面卻沒有可操作的說明。**

   位置：[electron/main.cjs:590](/Users/chinhsi/InterAct/electron/main.cjs:590)、[electron/main.cjs:740](/Users/chinhsi/InterAct/electron/main.cjs:740)、[PresenterPage.tsx:857](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:857)。

   `desktopCapturer.getSources()` 需要 macOS 的螢幕錄製同意。現在先隱藏控制面板，再擷取；renderer 的 `catch` 只退出框選，完全吞掉錯誤。也沒有檢查空 thumbnail，因此不能把「取得 source」當成擷取成功。

   **修正：**在隱藏視窗前，用 `systemPreferences.getMediaAccessStatus('screen')` 檢查狀態；首次擷取由使用者操作觸發，拒絕時顯示前往「系統設定 → 隱私權與安全性 → 螢幕與系統音訊錄製」的引導，必要時提示重新啟動。檢查 thumbnail 是否為空，並把可辨識的錯誤傳回 renderer。**不要呼叫 `askForMediaAccess('screen')`**，該 API 只接受 microphone／camera。[Electron 權限 API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesgetmediaaccessstatusmediatype-windows-macos)

2. **[P1／macOS 座標缺陷] 框選假設視窗原點等於整個螢幕原點。**

   位置：[electron/main.cjs:758](/Users/chinhsi/InterAct/electron/main.cjs:758)、[PresenterPage.tsx:870](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:870)。

   程式把普通主視窗設成 `targetDisplay.bounds`，再以 `image.naturalHeight / window.innerHeight` 換算框選位置。macOS 可能因選單列限制調整實際視窗位置；目前 renderer 沒有收到實際 content origin。因框選層透明、沒有顯示擷取影像，使用者對準的是背後桌面，結果可能裁到不同位置。這是可由程式與 API 契約推導的缺陷，仍需在本機量測偏移。[Electron 視窗座標限制](https://www.electronjs.org/docs/latest/api/base-window#winsetboundsbounds-animate)

   **修正：**擷取後讀取 `getContentBounds()`，連同 display bounds 傳給 renderer，換算：

   ```text
   sourceX = (contentBounds.x - displayBounds.x + rect.x) × pixelsPerDIP
   sourceY = (contentBounds.y - displayBounds.y + rect.y) × pixelsPerDIP
   ```

   若要框選包含選單列的整個畫面，另做經驗證的 macOS 擷取視窗；更容易保證一致的方法是顯示凍結截圖，讓使用者直接在影像上裁切。

3. **[P1／功能缺口] 只有彈幕跨 Space，控制面板及輔助視窗沒有。**

   位置：[electron/main.cjs:183](/Users/chinhsi/InterAct/electron/main.cjs:183)、[electron/main.cjs:277](/Users/chinhsi/InterAct/electron/main.cjs:277)、[electron/main.cjs:411](/Users/chinhsi/InterAct/electron/main.cjs:411)、[electron/main.cjs:465](/Users/chinhsi/InterAct/electron/main.cjs:465)、[electron/main.cjs:535](/Users/chinhsi/InterAct/electron/main.cjs:535)。

   Keynote／PowerPoint 進入獨立全螢幕 Space 後，彈幕具備跨 Space 設定，控制面板卻可能留在原桌面；開啟名單、文字雲、測驗也可能切離簡報。提高 window level 不會補上 Space 屬性。

   **修正：**在 presenter 模式對需要伴隨簡報的視窗設定 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`；結束模式後還原。可評估 macOS `type: 'panel'`，但需一起驗證輸入焦點。報告視窗是否跨 Space 應另行決定。[Electron 全工作區設定](https://www.electronjs.org/docs/latest/api/base-window#winsetvisibleonallworkspacesvisible-options-macos-linux)

4. **[P1／發佈設定錯誤] `identity: null` 不等於要求 ad-hoc 簽署。**

   位置：[electron-builder.cjs:65](/Users/chinhsi/InterAct/electron-builder.cjs:65)。

   註解寫「ad-hoc signature」，但 `null` 的語義是跳過簽署。現成 bundle 確實有有效 ad-hoc 簽章；這不能證明只執行新增 script 就能重現相同結果。

   **修正：**本機測試設定明確使用 `identity: '-'`，保留 `hardenedRuntime: false`，並對**解壓後的 ZIP 內容**驗證簽章。正式對外發佈另用 Developer ID、Hardened Runtime、notarization 與 stapling。`gatekeeperAssess: false` 只跳過建置階段評估，不能關閉使用者機器的 Gatekeeper；本機能啟動不代表從網路下載後能正常開啟。[electron-builder 簽署設定](https://www.electron.build/v26/docs/mac/#identity)、[公證流程](https://www.electron.build/docs/notarization/)

5. **[P2／確定的 macOS bug] 抽籤結束後仍可能保留透明 overlay 的鍵盤焦點。**

   位置：[electron/main.cjs:664](/Users/chinhsi/InterAct/electron/main.cjs:664)。

   抽籤互動時呼叫 `focus()`，退出時只有 `setFocusable(false)`；macOS 上這不會移除既有焦點。後續 `bringControlToFront()` 預設也不 focus，可能導致簡報方向鍵仍送往 overlay。

   **修正：**退出互動時明確 `overlayWindow.blur()`；若流程要返回控制面板，使用 `bringControlToFront(true)`。恢復先前外部簡報焦點則需另外設計，不能假設 `showInactive()` 會完成。[Electron 焦點行為](https://www.electronjs.org/docs/latest/api/base-window#winsetfocusablefocusable-macos-windows)

6. **[P2／既存跨平台 bug] `capture:list` 的 IPC handler 參數錯接。**

   位置：[electron/main.cjs:587](/Users/chinhsi/InterAct/electron/main.cjs:587)、[electron/main.cjs:738](/Users/chinhsi/InterAct/electron/main.cjs:738)、[electron/preload.cjs:23](/Users/chinhsi/InterAct/electron/preload.cjs:23)。

   `ipcMain.handle()` 第一個參數是 event；直接傳 `listCaptureSources`，就會把 event 當成 display，讀取 `targetDisplay.size.width` 時失敗。

   **修正：**

   ```js
   ipcMain.handle('capture:list', () => listCaptureSources())
   ```

   搜尋未發現目前 renderer 使用這個方法；主要框選走另一個 handler，所以不應把它列成現行截圖按鈕必然失效的原因。

**其餘主程序 API／行為逐項判定**

| 位置與行為 | 判定 | 具體處理 |
|---|---|---|
| [main.cjs:252](/Users/chinhsi/InterAct/electron/main.cjs:252)：透明、無框、無陰影、不可聚焦 overlay | **基本正常**，不是 Windows 專屬，也不因此需要輔助使用權限 | 保留硬體加速與 overlay 的 `backgroundThrottling: false`；測試全螢幕與多螢幕 |
| [main.cjs:275](/Users/chinhsi/InterAct/electron/main.cjs:275)：`setIgnoreMouseEvents(true, { forward: true })` | **正常**；macOS 支援 forwarding。它不是全域輸入監聽 | 保留；互動模式關閉 click-through 時，透明區也會攔截點擊，應保證能退出 |
| [main.cjs:52](/Users/chinhsi/InterAct/electron/main.cjs:52)：`screen-saver` 與相對層級 2、4、5、6 | **高風險體驗退化**，不代表一定 crash。`relativeLevel` 在 macOS 才真正生效 | macOS 改用較低 level 或至多 `screen-saver + 1`，重新安排視窗順序；目前可能壓住 Dock、選單與其他操作介面 |
| [main.cjs:195](/Users/chinhsi/InterAct/electron/main.cjs:195)、[main.cjs:214](/Users/chinhsi/InterAct/electron/main.cjs:214)：`moveTop()` | **API 正常**；不是聚焦，也不是跨 Space | 保留在使用者要求置前時；不要拿它修補全螢幕問題 |
| [main.cjs:222](/Users/chinhsi/InterAct/electron/main.cjs:222)：每 750 ms show／置頂 | **體驗與耗電風險** | macOS 優先以視窗／顯示器事件更新；暫停於隱藏、最小化及退出過程。若系統修正 bounds，現有嚴格比較也可能每次都重設 |
| [main.cjs:277](/Users/chinhsi/InterAct/electron/main.cjs:277)：`visibleOnFullScreen` | **正確方向**；可能短暫造成 Dock／視窗閃動 | 不要週期性重設。`skipTransformProcessType: true` 只適用已是 UIElement 的情況；不要為消除閃動盲目加上 |
| [main.cjs:261](/Users/chinhsi/InterAct/electron/main.cjs:261)：`skipTaskbar` | **正常但語義不同**；不能當成完整 Mission Control 策略 | 非互動 overlay 可加 `hiddenInMissionControl: true`；保留主要 app 的 Dock 入口 |
| [main.cjs:583](/Users/chinhsi/InterAct/electron/main.cjs:583)：`setBounds(bounds, true)` | **macOS 特有動畫／競態風險**，動畫參數在 Windows 不生效 | 框選切換使用 `false`，不要以固定 30／60 ms 假設動畫完成 |
| [main.cjs:48](/Users/chinhsi/InterAct/electron/main.cjs:48)、[main.cjs:572](/Users/chinhsi/InterAct/electron/main.cjs:572)：固定 760 高面板 | **小工作區體驗缺陷**，非 macOS 專屬 | 尺寸先限制在 `workArea`，內部捲動，再 clamp 位置；目前工作區不足時 clamp 上下界會反轉 |
| [main.cjs:588](/Users/chinhsi/InterAct/electron/main.cjs:588)：`size × scaleFactor` | **正常**，已有 Retina 考量 | renderer 使用實際 image 尺寸也是對的；需補的是原點，不是再乘一次 `devicePixelRatio` |
| [main.cjs:752](/Users/chinhsi/InterAct/electron/main.cjs:752)：依索引／`screen:${displayIndex}:` fallback | **多螢幕可靠性缺陷** | 優先 `display_id` 正確；沒有對應時提供選擇或報錯，不能保證兩個 API 的陣列順序及 ID 編碼一致 |
| [main.cjs:561](/Users/chinhsi/InterAct/electron/main.cjs:561)：以控制面板 bounds 選螢幕 | **正常但有限制** | 彈幕跟隨面板，不一定跟隨投影幕；可新增目標顯示器選擇 |
| `screen.getCursorScreenPoint()` | **本版沒有呼叫** | 若未來使用，macOS 支援、回傳 DIP；單純讀游標位置不應要求 Screen Recording／Accessibility。[screen 文件](https://www.electronjs.org/docs/latest/api/screen#screengetcursorscreenpoint) |
| [main.cjs:39](/Users/chinhsi/InterAct/electron/main.cjs:39)：`CalculateNativeWinOcclusion` | **macOS 無實質用途** | 加 `win32` guard；它不會停用 macOS 的背景節流 |
| [main.cjs:59](/Users/chinhsi/InterAct/electron/main.cjs:59)：`setAppUserModelId` | **Windows 專用設定；目前不是已證實啟動阻擋** | 同樣加 `win32` guard，清楚表達平台用途 |
| [main.cjs:137](/Users/chinhsi/InterAct/electron/main.cjs:137) 及 325、403、457、527：`setAppDetails` | **diff 修正正確** | 五處均已 guard，沒有漏掉另一處呼叫 |
| [main.cjs:43](/Users/chinhsi/InterAct/electron/main.cjs:43)：`icon.ico` | **圖示冗餘／可能無效，不是啟動 bug** | macOS 不依 Windows window icon 設定 Dock 圖示；略過該 option，依 app bundle icon。ICO extraResource 限 Windows |
| [main.cjs:46](/Users/chinhsi/InterAct/electron/main.cjs:46)：`PORTABLE_EXECUTABLE_FILE` | **正常 fallback**；macOS 未設定時用 `process.execPath`，且 relaunch 內容已在 Windows guard 內 | 將常數移入 Windows 專用設定即可 |
| [main.cjs:9](/Users/chinhsi/InterAct/electron/main.cjs:9)、[main.cjs:108](/Users/chinhsi/InterAct/electron/main.cjs:108)、[main.cjs:74](/Users/chinhsi/InterAct/electron/main.cjs:74)：userData、loadFile、openExternal | **正常跨平台** | 路徑基於 userData／resources／`__dirname`，沒有 Windows 磁碟機假設；一般 HTTPS 開啟不需 Automation 權限 |

置頂層級、mouse forwarding 與視窗 API 的判定依據為 [Electron BaseWindow 文件](https://www.electronjs.org/docs/latest/api/base-window)；其中明確提醒避免超過 `screen-saver + 1`。

**生命週期：基本骨架正確，關閉與重新啟用的語義需一致**

- [main.cjs:806](/Users/chinhsi/InterAct/electron/main.cjs:806)：`window-all-closed` 在 macOS 不 quit，**正常**。
- [main.cjs:789](/Users/chinhsi/InterAct/electron/main.cjs:789)：`activate` 能重建主視窗，**正常**；但測驗檢視期間主視窗被刻意隱藏，Dock activate 卻會重新顯示主視窗。**修正：**優先恢復現有 `quizReviewWindow`，也對最小化的 report 先 `restore()`。
- [main.cjs:801](/Users/chinhsi/InterAct/electron/main.cjs:801)：`before-quit` 設旗標並停 timer，**正確**；但 [main.cjs:475](/Users/chinhsi/InterAct/electron/main.cjs:475)、[main.cjs:542](/Users/chinhsi/InterAct/electron/main.cjs:542) 的 `closed` handler 仍嘗試恢復其他視窗。**修正：**清理 reference 後遇到 `isQuitting` 直接返回，避免退出時閃現或碰觸已銷毀視窗。
- [main.cjs:691](/Users/chinhsi/InterAct/electron/main.cjs:691)：自訂主視窗關閉按鈕直接 `app.quit()`；[main.cjs:339](/Users/chinhsi/InterAct/electron/main.cjs:339) 關報告也會退出整個 app。**屬產品行為／Mac 體驗差異，不是生命週期 API 壞掉。** 若保留，按鈕應明示「結束並離開」；若採 Mac 慣例，關窗與 Cmd-Q 分開處理。原生關窗路徑與自訂 X 也應一致。

**mac 打包設定與權限**

| 設定 | 評語 |
|---|---|
| [builder:63](/Users/chinhsi/InterAct/electron-builder.cjs:63)：PNG icon | **可用。** 現成 bundle 的 `CFBundleIconFile` 已是 `icon.icns`，所以不應誤判必須手動提供 ICNS 才能打包 |
| [builder:67](/Users/chinhsi/InterAct/electron-builder.cjs:67)：`hardenedRuntime: false` | **本機 ad-hoc 測試合理**；正式公證版本需開啟，並驗證 Electron JIT 與媒體相關 entitlements |
| [builder:68](/Users/chinhsi/InterAct/electron-builder.cjs:68)：`gatekeeperAssess: false` | **本機測試合理**；不會授予信任，也不能取代簽署／公證 |
| [builder:69](/Users/chinhsi/InterAct/electron-builder.cjs:69)：`extendInfo` | **用法正確**，兩個中文 usage description 已寫入產物 |
| [builder:70](/Users/chinhsi/InterAct/electron-builder.cjs:70)：Microphone | 必要且理由對應字幕／口譯；仍須使用者同意 |
| [builder:71](/Users/chinhsi/InterAct/electron-builder.cjs:71)：Camera | 未發現講師端 `getUserMedia({ video: ... })`；目前非必要。字串本身不會觸發提示，但不應用它解釋螢幕截圖 |
| 缺 `NSScreenCaptureUsageDescription` | 建議補「擷取教師選取的桌面區域並派送給學員」。Apple 現行 ScreenCaptureKit 文件要求說明；**不能據此直接斷言此 Electron／macOS 15 組合因缺鍵必然 crash**，仍須驗證實際擷取路徑。[Apple 文件](https://developer.apple.com/documentation/screencapturekit?changes=lat__4&language=objc) |
| 系統音訊說明 | 現有流程擷取螢幕 thumbnail 與麥克風，沒有桌面音訊 loopback；不應把系統音訊限制套到麥克風。產物已含預設 `NSAudioCaptureUsageDescription`，未來啟用 loopback 時需改為實際用途。[Electron 擷取文件](https://www.electronjs.org/docs/latest/api/desktop-capturer) |
| [builder:74](/Users/chinhsi/InterAct/electron-builder.cjs:74)：dir＋zip arm64 | **有效**；dir 是解包產物，ZIP 可供分發。Intel Mac 不能執行 arm64-only，Rosetta 不能反向解決；若承諾 Intel 支援，新增 x64 或 universal |
| [builder:11](/Users/chinhsi/InterAct/electron-builder.cjs:11)：`${productName}.${ext}` | **新增 mac ZIP 後產生跨平台撞名**：Windows 與 macOS 都叫 `InterAct.zip`。改成 `${productName}-${version}-${os}-${arch}.${ext}` 或至少覆寫 mac artifactName |

**不要混淆兩種 sandbox：**[main.cjs:130](/Users/chinhsi/InterAct/electron/main.cjs:130) 的 `webPreferences.sandbox: true` 是 Chromium renderer sandbox，並未啟用 Apple App Sandbox。

目前非 App Sandbox、未啟用 Hardened Runtime 的測試版，不能僅因沒有 entitlements 檔就判定麥克風不可用。正式 Hardened Runtime 版本應確認 `com.apple.security.device.audio-input`、Electron 所需的 `com.apple.security.cs.allow-jit`，以及 helper 的實際簽署權限；本機 `@electron/osx-sign` 預設檔已有這些項目，但須驗證最終產物。若另做 MAS／App Sandbox 版本，還要配置 app-sandbox、音訊輸入、network.client、helper inheritance 等。一般螢幕擷取仍需 TCC 同意，**不存在加一個通用 `com.apple.security.screen-capture` 就能免授權的修法**。[Apple 音訊 entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)、[Electron MAS 指引](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)

**Renderer 與指定 libraries**

| 檔案 | 結果與修正 |
|---|---|
| [device.ts:3](/Users/chinhsi/InterAct/src/lib/device.ts:3) | **正常**。只是 localStorage＋`crypto.randomUUID()`，沒有 Windows 硬體識別或路徑假設 |
| [audio.ts:21](/Users/chinhsi/InterAct/src/lib/audio.ts:21) | **正常**。Web Audio 解碼、依實際 sample rate 降採樣、PCM WAV；不是 Windows codec API |
| [liveCaptions.ts:77](/Users/chinhsi/InterAct/src/lib/liveCaptions.ts:77) | **無 macOS 專屬阻擋**。WebRTC 使用傳入的音軌；權限取得在 PresenterPage。分析器也有 `resume()` |
| [AudioRecorder.tsx:62](/Users/chinhsi/InterAct/src/components/AudioRecorder.tsx:62) | **正常且已有能力偵測**：使用 `MediaRecorder.isTypeSupported()`，沒有強制 Windows 格式 |
| [PresenterPage.tsx:378](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:378)、[PresenterPage.tsx:505](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:505) | **需要 Microphone 權限**。第一次 `getUserMedia` 可觸發提示；拒絕後需設定引導，不能只重試。裝置失效已有 fallback |
| [PresenterPage.tsx:39](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:39) | **錯誤文案確定不適用 Mac**。改「系統或程式未允許使用麥克風」，並利用 preload 的 `platform` 提供平台設定說明；`NotReadableError` 也不一定代表其他程式獨占 |
| [PresenterSettingsModal.tsx:86](/Users/chinhsi/InterAct/src/components/PresenterSettingsModal.tsx:86) | **一般健壯性改善**。預覽分析器沒有顯式 `resume()`；檢查 context state 並恢复，避免顯示假性零音量 |
| [PresenterNewPage.tsx:60](/Users/chinhsi/InterAct/src/routes/PresenterNewPage.tsx:60) | `'windows-app'` **目前不阻擋 Mac**，因為後端 [create-session:19](/Users/chinhsi/InterAct/supabase/functions/create-session/index.ts:19) 要求同一個 literal。改成 `'desktop-app'` 時必須後端同步兼容，否則會新增 403 |
| [PresenterPage.tsx:842](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:842)、[PresenterPage.tsx:892](/Users/chinhsi/InterAct/src/routes/PresenterPage.tsx:892) | `captureWindowsScreen`、`windows-selection-...` **只是名稱**，沒有平台 guard；改名即可 |
| [preload.cjs:5](/Users/chinhsi/InterAct/electron/preload.cjs:5) | **正常**：sandboxed preload 可取得 `process.platform`，已安全橋接；renderer 未利用它分平台 |
| [README.md:28](/Users/chinhsi/InterAct/README.md:28) | **文件缺口**：仍只教下載 ZIP 後開 EXE。補 macOS 架構、安裝、測試版簽署狀態及權限流程 |

**合併前最小驗收範圍：**首次允許／拒絕截圖及麥克風；Retina 與外接螢幕框選位置；全螢幕簡報上的控制面板與彈幕；抽籤退出後方向鍵；Cmd-H／Cmd-M／Cmd-W／Cmd-Q／Dock activate；以及從下載 ZIP 解壓後的啟動。這些通過後，才足以把目前的啟動成功提升為可用的 macOS 課堂版本。
