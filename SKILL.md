# SAKA TRACKER — Technical Specification (SKILL.md)
  
**App:** Saka Tracker — SE2026 SLS Progress Monitoring
**Version documented:** v5.8.0 (Build 20260711)
**Type:** Single-file client-side web app (HTML+CSS+JS, no backend, no build step) with a companion `manifest.json` + `sw.js` for PWA install/offline support
**Storage:** Browser `localStorage`, key `saka_tracker_v5_4` (referenced via the `STORAGE_KEY` constant since v5.5.0; the literal key itself is unchanged for backward compatibility)
**Author role documented for:** Saka_Omni (internal field-ops tooling)
**Scope:** Internal monitoring tool for Sensus Ekonomi 2026 (SE2026) field progress — **not** an official BPS product.

---

## 1. Purpose & Design Philosophy

Saka Tracker helps a PML/koordinator track SLS-level field progress (open/submit/reject/pending/approve counts) against two parallel targets — **Dashboard FASIH** (assessment count) and **Muatan** (contract volume) — and surfaces prioritization, forecasting, and AI-generated strategic insight.

Design constraints that shape every decision in this codebase:

- **Local-first, zero-backend.** Everything lives in the browser. No server, no accounts, no sync. This keeps the tool deployable as a single HTML file (email it, host it anywhere, open it offline) but means data never leaves the device unless the user explicitly exports it or triggers the AI Insight feature.
- **Single source of truth = SLS array.** Dashboard totals (`state.dashboard`) and target base numbers (`state.config.assessment`, `state.config.muatan`) are **derived**, never hand-edited. They're recomputed from `state.sls` every time data changes via `syncDashboardFromSLS()` / `syncConfigTargets()`. Never write directly to `state.dashboard.*` from a form.
- **No PII.** The app is scoped to store aggregate counts and SLS/RT-RW area labels only. It must never be extended to store respondent-level personal data (name, NIK, address, phone). This is enforced socially (Consent Gate copy, ToS/Privacy) not technically — see §10.
- **Graceful AI degradation.** The Multi-AI Orchestrator always has a deterministic, non-AI fallback (`deterministicFallback()`) so the app is fully functional with zero API keys configured.

---

## 2. Tech Stack

- Vanilla HTML/CSS/JS. No framework, no bundler, no npm dependencies.
- Only external resource: Bootstrap Icons via CDN (`bootstrap-icons@1.11.3`).
- Fonts: system font stack (`Inter, system-ui, sans-serif`).
- Browser APIs used: `localStorage`, `fetch`, `crypto.subtle` (SHA-256 hashing for PIN, added v5.4.5), `FileReader` (restore), Blob-less data-URI download (backup).
- Target runtime: mobile Safari/Chrome (this is a field tool, phone-first). Viewport is locked (`user-scalable=no`) and layout is single-column, bottom-tab navigation.

---

## 3. File Structure

Everything lives in **one HTML file**. Internal organization (by `<!-- comment -->` section markers in the `<script>` block):

```
<style>                      All CSS, custom-property design tokens under :root
<body>
  #page-dashboard            Main input + analysis page
  #page-data                 SLS master data CRUD (kode, open, muatan)
  #page-history              Daily snapshot history list
  #page-settings             API keys, backup/restore, security, legal
  #legal-modal               ToS / Privacy Policy modal (shared)
  #consent-gate              Full-screen gate, v5.4.5+
  #pin-lock-screen           Full-screen PIN pad, v5.4.5+
  <nav class="bottom-nav">   4-tab navigation
<script>
  VERSI APLIKASI             APP_VERSION, BUILD_DATE, LEGAL_VERSION
  CONFIG & STATE MANAGEMENT  CONFIG const, DEFAULT_SLS_DATA, state object, migration guards
  HELPER FUNCTIONS           getElapsedDays, getSisaHariKeClearance
  SYNC FUNCTIONS             syncConfigTargets, syncDashboardFromSLS
  INPUT LOGIC                toggleInputMode, updateSLS (with submit/open coupling)
  CORE LOGIC                 getProgress, getVelocity, prioritasSLS, performanceGrade, generateSLSDetail
  RENDER: TERMIN ALERT       renderTerminAlert (large — termin 1 status box variants)
  RENDER: FORECAST etc.      renderForecast, renderTargetsAndComparison, renderDifferenceAnalysis,
                              renderPriorityAccordions, renderPerformance
  HISTORY FUNCTIONS          renderHistory, deleteHistory, clearAllHistory
  MAIN ACTIONS                runAnalysis (orchestrates a full analysis + snapshot + AI call)
  NAVIGATION                 switchPage
  CRUD DATA SLS               renderDataSLSPage, updateDataSLS, addNewSLSRow, deleteDataSLS, saveDataSLS
  SETTINGS, BACKUP & RESTORE  saveSettings, loadApiKeys, updateApiStatusUI, testAllApis, backupData, restoreData
  LEGAL MODAL                 openModal(type), closeModal — ToS/Privacy content (HTML, Bahasa Indonesia)
  HYBRID AI ORCHESTRATOR      class HybridAIOrchestrator
  CONSENT GATE & PIN LOCK     v5.4.5+ — see §10
  INITIALIZATION              initForm, DOMContentLoaded handler
```

---

## 4. Data Model

### 4.1 `state` object (persisted whole, JSON, to `localStorage['saka_tracker_v5_4']`)

```js
state = {
  config: {
    assessment: Number,   // derived: sum of (open+submit+approve) across all SLS
    muatan: Number        // derived: sum of muatan across all SLS
  },
  dashboard: {
    open: Number, draft: Number, submit: Number,
    reject: Number, pending: Number, approve: Number
  },                       // derived from state.sls except draft (manually input)
  sls: [ SLSRow, ... ],     // the single source of truth
  history: [ SnapshotRow, ... ],
  apiKeys: { openai: String, gemini: String, mistral: String },
  isAccumulationMode: Boolean,
  consent: { accepted: Boolean, version: String|null, date: ISOString|null },   // v5.4.5+
  security: {                                                                   // v5.4.5+
    pinEnabled: Boolean,
    pinHash: String|null,       // SHA-256 hex of the 4-digit PIN
    recoveryHash: String|null,  // SHA-256 hex of lowercased recovery answer
    failedAttempts: Number,
    lockUntil: EpochMillis|null // soft lockout after 5 failed attempts, 30s
  }
}
```

### 4.2 `SLSRow`

```js
{ kode: "0012", nama: "RT 004 RW 03 DUSUN KARANG KOMIS",
  open: Number, submit: Number, reject: Number, pending: Number, approve: Number,
  muatan: Number }
```

### 4.3 `SnapshotRow` (one per calendar day, keyed by `date` — re-running analysis same day overwrites, not appends)

```js
{ date: "7/9/2026",     // toLocaleDateString('id-ID') — NOTE: locale-dependent string, not sortable as ISO
  progress: Number,      // submit+approve total at time of snapshot
  dashP: Number,         // % of assessment
  velocity: Number,      // data/day at time of snapshot
  grade: "A+"|"A"|"B"|"C"|"D"|"E" }
```

**Known fragility:** `date` is stored via `toLocaleDateString('id-ID')`, which is locale/timezone dependent and not lexicographically sortable. `Forecast`/`Trend` math (`getVelocity()`) relies on **array order**, not date parsing, so this works today but is a landmine if history entries are ever reordered or merged from multiple exports. Prefer ISO date strings (`YYYY-MM-DD`) if this is refactored.

---

## 5. Core Business Logic

### 5.1 Progress definition

```
progress = dashboard.submit + dashboard.approve
```

Draft, reject, and pending are **excluded** from progress. This is a locked business decision from earlier iterations of this app — do not change without explicit confirmation.

### 5.2 Percentages

```
dashP    = progress / config.assessment * 100     // "Dashboard FASIH"
muatanP  = progress / config.muatan * 100          // "Muatan Kontrak"
```

### 5.3 Open/Submit coupling (`updateSLS`)

When a user edits `submit` for a row, `open` is decremented by the same delta (clamped at 0) — the assumption being that submitting an item moves it out of the open pool. `approve` is **not** coupled to `open` or `submit` at all, because approvals can come from newly-discovered field findings that were never in the original `open` count. This asymmetry is intentional; see the code comment block above `updateSLS`.

Validation: `submit` cannot exceed `open + previousSubmit` for that row (alerts and reverts otherwise). `approve` has no upper bound validation.

### 5.4 Velocity (`getVelocity`)

```
if history.length >= 7:
    rate = (progress[last of last 7] - progress[first of last 7]) / 6   // per-day average
else:
    rate = currentProgress / elapsedDaysSinceCONFIG.startDate
```

Returns 0 if no positive delta — this is the trigger for "BELUM ADA RITME" (no rhythm yet) states throughout the UI.

### 5.5 Prioritization (`prioritasSLS`)

```
openScore    = min(open * 0.8, 40)     // capped contribution
approveScore = approve * 0.3
submitScore  = submit * 0.1
muatanFactor = muatan ? muatan/100 : 1
score = (openScore + approveScore + submitScore) * muatanFactor
```

Sorted descending by `score`. Action label thresholds (as of v5.5.0 each also carries an `actionIcon` Bootstrap Icons class, rendered as `<i class="bi ${actionIcon}">` next to the label — no emoji):

| Condition | Action | Icon (`bi-*`) | Class |
|---|---|---|---|
| `persen >= 100` | Selesai | `check-circle-fill` | `action-done` |
| `open > 50 && persen < 30` | URGENT! | `exclamation-triangle-fill` | `action-urgent` |
| `open > 30 && persen < 50` | Prioritas Tinggi | `flag-fill` | `action-urgent` |
| `persen > 0` (else) | Lanjutkan | `arrow-right-circle-fill` | `action-lanjut` |
| `persen == 0` | Mulai | `play-circle-fill` | `action-mulai` |

### 5.6 Performance grade (`performanceGrade`)

Compares actual `dashP` against a **linear expected-progress line** from `CONFIG.startDate` to `CONFIG.absoluteDeadline`:

```
expectedProgress = elapsedDays / totalDays * 100
delta = dashP - expectedProgress
```

Grade thresholds (both an absolute `dashP` floor AND a `delta` floor must be met). As of v5.5.0 each grade also carries an `icon` Bootstrap Icons class rendered next to the label in `#perf-desc` — no emoji:

| Grade | dashP ≥ | delta ≥ | Label | Icon (`bi-*`) |
|---|---|---|---|---|
| A+ | 80 | +10 | Excellent | `trophy-fill` |
| A | 70 | +5 | Luar Biasa | `star-fill` |
| B | 60 | 0 | Baik & On Track | `check-circle-fill` |
| C | 50 | −5 | Sedang, Perlu Percepatan | `exclamation-triangle-fill` |
| D | 40 | −10 | Di Bawah Target | `graph-down` |
| E | else | else | Kritis! Butuh Aksi Cepat | `exclamation-octagon-fill` |

### 5.7 Termin 1 tracking (`renderTerminAlert`)

Hardcoded single milestone: `CONFIG.termin1TargetDate = 2026-07-13`, target = 40% of `dashP`. Renders one of 5 visual states depending on `daysLeft` and `currentProgress`: past-deadline-failed, ≤3 days & <30% (critical), ≤7 days (warning), >7 days (info), or target-already-met (success). Each state independently computes gap-to-40%, gap-to-100%, required daily rate, and ETA — **this logic is duplicated per branch**, not factored out. If a second termin is added (see §13), factor this into a parameterized `renderTerminStatus(terminConfig)` first.

### 5.8 Forecast engine (`renderForecast`)

Single target: `clearanceDate = absoluteDeadline - safetyBufferDays` (currently `2026-08-30 - 3 = 2026-08-27`). Compares `getVelocity()` against the required daily rate to hit 100% by that date; three states (critical / warning / on-track), each showing estimated completion date and buffer/shortfall in days.

---

## 6. AI Layer — `HybridAIOrchestrator`

### 6.1 Provider chain

```
OpenAI (gpt-4o-mini) → Gemini (gemini-2.0-flash) → Mistral (mistral-small-latest) → Deterministic Fallback
```

`generateInsight(prompt)` iterates providers in order, **skips any with no key configured**, calls with a 12s `AbortController` timeout, and on success returns markdown-lite-cleaned HTML (`**bold**` → `<span class="ai-highlight">`, `*italic*` → `<em>`, paragraphs wrapped). On failure of all configured (or zero configured) providers, falls through to `deterministicFallback()`, which synthesizes an on-track/at-risk verdict purely from `getProgress()`, `getVelocity()`, and `prioritasSLS().slice(0,3)` — no network call.

### 6.2 Prompt construction

Built fresh each `runAnalysis()` call in-line (not a separate function) — includes mode (harian/akumulasi), `dashP`, velocity, termin-1 status, and top-3 prioritized SLS codes with open counts. Kept intentionally aggregate-only — **never include `nama` (RT/RW/Dusun labels) or any respondent-adjacent detail in this prompt**, to keep the data sent to third-party providers minimal per the Privacy Policy.

### 6.3 Key storage & transmission

Keys live in `state.apiKeys` (plaintext in localStorage — see §11 limitations). Calls go **directly from the browser to the provider's API** (OpenAI/Google/Mistral endpoints) — Saka Tracker has no backend to proxy through. This is why the Privacy Policy explicitly says pihak ketiga data transmission bypasses any Saka Tracker server.

### 6.4 Status indicator

`updateStatus(name, status)` writes into `#ai-provider-status` in the footer of the AI Insight card with a small colored `<i class="bi bi-circle-fill">` (green = idle/active) or `<i class="bi bi-arrow-repeat">` (calling) indicator — as of v5.5.0 these are Bootstrap Icons, not emoji glyphs — this is the only live "which provider answered" indicator in the UI.

---

## 7. Pages

| Page id | Purpose | Key functions |
|---|---|---|
| `page-dashboard` | Daily input grid (per-SLS open/submit/reject/pending/approve + global draft), triggers full analysis | `initForm`, `runAnalysis`, `updateSLS` |
| `page-data` | Master data CRUD: SLS kode, open FASIH, muatan (not day-to-day counts) | `renderDataSLSPage`, `updateDataSLS`, `addNewSLSRow`, `deleteDataSLS`, `saveDataSLS` |
| `page-history` | List of daily snapshots with delete/clear-all | `renderHistory`, `deleteHistory`, `clearAllHistory` |
| `page-settings` | API keys, connection test, backup/restore, **security (v5.4.5)**, legal links | `saveSettings`, `testAllApis`, `backupData`, `restoreData`, PIN functions (§10) |

Navigation is a simple `display:none/active` toggle (`switchPage`), no routing/hash, no history API — a full page reload always lands back on the dashboard tab.

---

## 8. Rendering Pipeline (`runAnalysis`)

`runAnalysis()` is the single "commit" action, triggered by the primary button on the dashboard. Sequence:

1. `syncDashboardFromSLS()` + `syncConfigTargets()` — recompute all derived totals from the SLS array.
2. Read `global-draft` input into `state.dashboard.draft`.
3. `getProgress()`, `performanceGrade()`.
4. Upsert today's `SnapshotRow` into `state.history` (find-by-date-string; overwrite if exists, else push).
5. Persist to `localStorage`.
6. Call all render functions in sequence: `renderTerminAlert`, `renderForecast`, `renderTargetsAndComparison`, `renderDifferenceAnalysis`, `renderPriorityAccordions`, `renderPerformance`.
7. Build AI prompt, instantiate `HybridAIOrchestrator`, `await generateInsight()`, inject into `#ai-insights`.
8. Reveal `#analysis-container`, smooth-scroll into view.
9. If History tab happens to be active, re-render it too.

This function is `async` because of step 7; every other render call in the sequence is synchronous.

---

## 9. Backup & Restore

- **Backup**: `JSON.stringify(state)` as a `data:` URI download, filename `saka_tracker_backup_YYYY-MM-DD.json`. Includes **everything** — SLS data, history, API keys (plaintext), and as of v5.4.5, `consent` and `security` (PIN hash + recovery hash, not plaintext PIN).
- **Restore**: `FileReader` → `JSON.parse` → sanity check (`restoredState.sls && restoredState.apiKeys` must exist) → replace `state` wholesale → `location.reload()`. As of v5.4.5, restore also back-fills `consent`/`security` defaults if the imported file predates those fields, so old backups don't crash the migration guard.
- **No merge logic exists** — restore is destructive/total, not a diff. Warn users of this in-product if this is ever exposed more prominently.

---

## 10. Security Layer (v5.4.5) — Consent Gate & PIN Lock

### 10.1 Consent Gate

- Constant `LEGAL_VERSION` (currently `"5.4.5"`) is compared against `state.consent.version` on every load (`checkConsentGate()`, called from `DOMContentLoaded`).
- If missing/mismatched/not accepted → full-screen `#consent-gate` overlay blocks the entire app (z-index 999999, solid background, no click-through). Contains a condensed summary of the ToS/Privacy essentials plus buttons to open the full modals (`openModal('tos'|'privacy')`, reused from Settings).
- "Setuju & Lanjutkan" is disabled until the checkbox is checked (`consent-checkbox` onchange toggles `btn-consent-agree.disabled`).
- On accept: `state.consent = {accepted:true, version:LEGAL_VERSION, date:ISOString}`, persisted, gate hidden, falls through to PIN check.
- **Operational rule: bump `LEGAL_VERSION` (and the visible date/version line inside the ToS/Privacy HTML in `openModal()`) every time the legal text changes materially.** This is the only mechanism that re-prompts existing users.

### 10.2 PIN Lock (optional, off by default)

- 4-digit numeric PIN only (fixed length by design, to allow auto-submit on the 4th digit — see `pinPress`).
- Hashing: `sha256Hex()` via `crypto.subtle.digest('SHA-256', ...)`, hex-encoded. Both the PIN and a lowercased recovery answer are hashed the same way and stored as `state.security.pinHash` / `recoveryHash`. **Plaintext PIN/answer are never persisted.**
- Setup happens in Settings → Keamanan Aplikasi (`setupPin()`): requires PIN, confirm-PIN match, and a recovery answer ≥3 chars (mandatory — you cannot enable PIN lock without setting a recovery path).
- Lock screen (`#pin-lock-screen`) is shown whenever `state.security.pinEnabled` is true, checked right after the consent gate clears (`checkPinLock()`), and can also be triggered manually via "Kunci Aplikasi Sekarang" in Settings (`lockAppNow()`).
- Entry via on-screen keypad (`pinPress(digit)` / `pinBackspace()`), 4-dot progress indicator, auto-verifies at 4 digits (`verifyPin()`).
- **Brute-force throttle**: 5 wrong attempts → 30-second soft lockout (`state.security.lockUntil`), reset on success. This is client-side and trivially bypassable via devtools — it is a friction layer, not a security boundary (documented explicitly in-product and in the Privacy Policy).
- **Recovery flow**: "Lupa PIN?" reveals a text input checked against `recoveryHash`. On match, PIN lock is fully disabled (`pinEnabled:false`) and the user is dropped into Settings to set a new one. If the user also forgets the recovery answer, the **only** remaining path is clearing browser data, which wipes all app data (destructive, last resort — no UI shortcut is provided for this on purpose).
- **Explicitly out of scope**: this PIN does **not** encrypt `localStorage`. Anyone with devtools access to the device can read `state` (including SLS numbers and API keys) regardless of PIN lock status. This limitation is stated in the in-app disclaimer text under the PIN setup form and in the Privacy Policy §7.

### 10.3 Load-order contract

```
DOMContentLoaded
  → initForm(), loadApiKeys(), renderHistory(), updatePinSecurityUI()   // app renders normally underneath
  → checkConsentGate()
      → if consent missing/stale: show #consent-gate, STOP (waits for acceptConsent())
      → else: hide gate, call checkPinLock()
          → if pinEnabled: show #pin-lock-screen, STOP (waits for correct PIN)
          → else: hide lock screen, app fully visible
```

Note the app's data layer and DOM are **already initialized underneath** both overlays — they are purely visual blockers (full-viewport, opaque, high z-index), not execution gates. This was a deliberate simplicity trade-off: no need to defer/re-run `initForm()` after unlock, at the cost of the security caveat in §10.2.

---

## 11. Known Limitations (carry these into any future work)

1. **Plaintext API keys** in `localStorage` and in backup JSON exports. Acceptable for a personal single-user field tool; would need real secret storage before any multi-user/shared-device deployment.
2. **PIN Lock is a UX gate, not encryption** (§10.2). Do not represent it to users as protecting sensitive data from a determined technical actor.
3. **Snapshot dates are locale strings**, not ISO — fragile for cross-timezone or cross-device history merges (§4.3).
4. **No merge on restore** — restoring a backup always fully overwrites current state (§9).
5. **Termin logic is hardcoded to a single milestone** (`termin1TargetDate`), with 5 near-duplicated render branches (§5.7) — needs refactoring before adding Termin 2+.
6. **PWA shell exists but is manually versioned.** `manifest.json` and `sw.js` ship alongside `index.html` (see §12) and give install-to-home-screen + offline caching. There is still no build step, so the three files' version strings must be kept in sync by hand; a runtime check (§12) flags drift via `console.warn` but cannot fix it automatically.
7. **`alert()`/`confirm()`** used throughout for all user feedback and destructive-action confirmations — inconsistent with the rest of the dark, custom-styled UI. (Note: as of v5.5.0 these are plain text only — no emoji/icons — since native `alert()`/`confirm()` dialogs cannot render HTML or icon fonts; all in-page UI, by contrast, uses Bootstrap Icons exclusively, see §12.)

---

## 12. Versioning Convention

**Semantic Versioning (semver.org)** is used across the whole app: `MAJOR.MINOR.PATCH`.
- `MAJOR`: breaking changes (e.g. `state` schema change requiring a migration).
- `MINOR`: new features, backward-compatible (e.g. this v5.5.0 release: icon standardization + version-sync system).
- `PATCH`: bug fixes only, no behavior/feature change.

**Files that must carry the identical version number on every release:**

| File | Where the version lives |
|---|---|
| `index.html` | `APP_VERSION` constant (single source of truth for this file — `<title>`, header badge, and Settings app-info box are all set from it at `DOMContentLoaded`, not hardcoded in markup) |
| `sw.js` | `SW_VERSION` constant and `CACHE_NAME` suffix |
| `manifest.json` | top-level `"version"` field (custom field, ignored by browsers but used for sync-checking) and the `"description"` string |
| `SKILL.md` | `Version documented` in the header block |
| `README.md` | version badge/heading |

**Runtime cross-file communication (how the "apps" verify each other):**
- On `activate`, `sw.js` posts `{type:'SW_ACTIVATED', version: SW_VERSION}` to every open client. `index.html` compares this against its own `APP_VERSION` in `checkVersionSync()` and logs a `console.warn` on mismatch.
- On load, `index.html` fetches `manifest.json` and compares its `"version"` field against `APP_VERSION` in `checkManifestVersionSync()`, again warning on mismatch.
- When a new Service Worker finishes installing while an old one still controls the page, `index.html` shows a dismissible "Versi baru tersedia" banner (`#update-banner`) with a reload action that posts `{type:'SKIP_WAITING'}` to the waiting worker, then reloads once the new worker takes control (`controllerchange`).
- None of this requires a build step — it's plain `postMessage`/`fetch` coordination between three independently-editable static files, so a human still has to bump all three numbers together; the runtime checks exist to catch it when that's forgotten, not to make bumping automatic.

`LEGAL_VERSION`: **independent** of `APP_VERSION` — only bump when ToS/Privacy Policy text changes in a way that should re-surface the Consent Gate to existing users. It's fine for `APP_VERSION` to advance without `LEGAL_VERSION` changing (this happened in v5.5.0).

**Iconography standard:** No emoji/emoticon characters anywhere in the codebase, including console logs and offline fallback markup. All in-page visual indicators use Bootstrap Icons (`<i class="bi bi-...">`) exclusively. The one exception is native `alert()`/`confirm()` dialogs, which cannot render HTML — those use plain, unadorned text.

Changelog entries live as a small inline note block inside the Settings `.app-info-box` (not a separate changelog page yet — see §13).

---

## 13. Extension Points (not yet built, ordered roughly by leverage)

- **Chart visualization**: `state.history` already has everything needed for a daily progress line chart (Chart.js via CDN) — currently only surfaced as text/cards.
- **Generalized Termin system**: replace the single hardcoded `termin1TargetDate` with an array of `{label, targetDate, targetPercent}` and a parameterized render function (prerequisite: refactor §5.7 first).
- **Per-SLS PIC / medan (terrain) fields**: extend `SLSRow` with `pic` and `medan` (Mudah/Sedang/Sulit) to feed a composite recommendation score (progress × medan-weight × ROI) — this was scoped conceptually in an earlier design pass but not yet wired into this codebase's `prioritasSLS()`.
- **Toast/modal system** to replace `alert()`/`confirm()` calls app-wide, matching the existing dark UI kit (would also let those messages carry Bootstrap Icons, closing the one exception noted in §12).
- **In-app changelog page** rather than the current inline note block.
- **WhatsApp/PDF export** of the daily analysis card stack for sharing with supervisors.
- **Build-time version injection**: a small script (Node or otherwise) that reads one `VERSION` file and writes it into `index.html`/`sw.js`/`manifest.json` automatically, removing the manual-sync requirement described in §12 — currently out of scope since the project is explicitly no-build-step.

---

## 14. Change Log for This Document

| Version | Change |
|---|---|
| v5.8.0 | Added independent Semantic Versioning for FormGear, see §15.5: `FORMGEAR_ENGINE_VERSION` (templating engine), `schemaVersion` (form-definition data shape), and a per-form `templateVersion` that auto-bumps PATCH on every save. Older forms are auto-migrated to the new fields on load via `migrateFormDefinition()`. This does not change `APP_VERSION`/`LEGAL_VERSION` of the Saka Tracker app itself. |
| v5.7.0 (addendum) | Documented new FormGear advanced field types (`autonumber`, `customjs`) and their AI helper, see §15. This addendum does not change `APP_VERSION`/`LEGAL_VERSION` of the Saka Tracker app itself — it only documents the FormGear sub-module shipped alongside it (`assets/formgear/*`). |
| v5.5.0 | Removed all emoji/emoticon usage app-wide in favor of Bootstrap Icons; documented the new cross-file Semantic Versioning policy and runtime version-sync mechanism between `index.html`, `sw.js`, and `manifest.json` (§12); updated §11 to reflect that the PWA shell (`manifest.json` + `sw.js`) now exists; removed the now-completed "PWA shell" item from §13. |
| v5.4.5 | Initial SKILL.md written, covering full v5.4.5 architecture. Documents new Consent Gate + PIN Lock security layer, all core formulas, AI orchestrator, and known limitations/extension points. |

---

## 15. FormGear Form Builder — Advanced Fields & AI (`assets/formgear/`)

FormGear is a SurveyJS-style form builder sub-module bundled in the same app (`assets/formgear/form-builder.js` + `formgear-v2.css`, loaded by `index.html` after the main inline script). It has its own field-type registry, preview/functional renderers, and local storage keys (`formgear_form_definitions`, `formgear_submissions`) — independent of Saka Tracker's `state`/`STORAGE_KEY`.

### 15.1 Advanced field types

| Type | Purpose | Config fields |
|---|---|---|
| `autonumber` | Auto-increment sequence number, read-only, assigned once per rendered form instance based on how many submissions already exist locally for that `formId` (`formgear_submissions`). | `autoStart`, `autoStep`, `autoPadding` (zero-pad digits), `autoPrefix` |
| `customjs` | "Custom JS Column" — a computed, read-only field whose value is produced by running user-authored JavaScript (`field.jsCode`) via `new Function('data','utils', jsCode)` every time any other field on the form changes. | `jsCode` (must `return` a value). Receives `data` (all other field values, keyed by field `name`) and `utils` (`toNumber`, `sum`, `avg`, `today`). |

Both types are treated as non-required, placeholder-less "computed" fields in the builder UI (`isComputedType()` / the extended `isStatic` check in `renderBuilderField`).

**Recalculation engine** (`FormGearBuilder`):
- `collectAllFieldValues(container, formDef)` — reads every field's current DOM value regardless of visibility (unlike `collectSubmissionData`, which only includes currently-visible fields).
- `runCustomJsField(field, data)` — executes `field.jsCode`, returns `{value}` or `{error}`. **Not sandboxed** — runs in page context via `new Function`, consistent with this app's existing "local-first, zero-backend, no build step" design trade-offs (see §1, §10.2's similar disclaimer for PIN lock). Do not treat this as a security boundary.
- `recalculateComputedFields(container, formDef)` — writes fresh `autonumber`/`customjs` values into their DOM inputs.
- `refreshFormState(container, formDef)` = `recalculateComputedFields()` + `updateConditionalVisibility()`, called from every interaction handler in `wireFormFieldEvents` (click, change, and `input` events) so computed columns behave as live business-logic outputs, not one-shot defaults.

### 15.2 AI helper — `FormGearAI`

A small, self-contained object (not a class instance tied to Saka Tracker's DOM) that:
- Reads API keys from the **same** `localStorage` key as Saka Tracker (`saka_tracker_v5_4` → `state.apiKeys.{openai,gemini,mistral}`) so users configure keys once in Settings and both subsystems use them. It does **not** import or depend on Saka Tracker's `HybridAIOrchestrator` class (which is tightly coupled to `#ai-provider-status` DOM and tracker-specific fallback logic) — this keeps FormGear a self-contained, independently-editable file per the project's no-build-step philosophy (§2).
- `generateJsCode({label, name, instruction, context})` — prompts the provider chain (OpenAI → Gemini → Mistral, first configured+successful wins) to return **JS code only** (no prose, no markdown fences — enforced by prompt + `stripCodeFences()` defensive post-processing) for a `customjs` field, given the field's label/name and the list of other available field names/labels/types in the current form (so generated code references real `data.<name>` keys).
- `suggestTemplate({...})` — summarizes the current form (sections, fields, types) and asks the same provider chain for short UI/template/business-logic recommendations in Bahasa Indonesia.
- `deterministicTemplateSuggestion(...)` — non-AI, rule-based fallback used automatically when no API key is configured, so the feature degrades gracefully like the rest of the app's AI layer (§1, "Graceful AI degradation").

### 15.3 UI entry points

- **Per-field AI code badge**: an "AI" pill next to the Label input (only shown when `field.type === "customjs"`), plus a fuller instruction box + "Generate dengan AI" button inside the field's type editor. Both call `FormGearBuilderInstance.generateCustomJsCode(sectionIndex, path, depth)`. Generated code overwrites `field.jsCode` — the user should review it before relying on it, same caveat as any AI-generated code.
- **Form-level AI template suggestion**: "Saran Template AI" button in the builder toolbar calls `requestAiTemplateSuggestion()`, rendering results (or the deterministic fallback) in a panel above the section editor.

### 15.4 Known limitations (carry into future work)

1. `customjs` code execution is **not sandboxed** — it can access anything the page's JS context can access. Acceptable for this single-user, local-first tool; would need a real sandbox (iframe + postMessage, or a JS interpreter like `Function` with a frozen/limited scope) before any multi-user or untrusted-form-author deployment.
2. `autonumber` sequence is derived from `formgear_submissions` count at render time and "locked" per rendered DOM instance (`data-auto-assigned`) — it is **not** guaranteed globally unique across multiple browser tabs/devices (same local-first trade-off as the rest of the app, §1).
3. AI-generated `customjs` code is inserted directly into the textarea without any static validation beyond the existing runtime try/catch in `runCustomJsField` — a confidently-wrong AI response will surface as a red "customjs-error" input with a hover tooltip, not a build-time error.
4. `FormGearAI` prompts do not currently strip potentially sensitive values out of the "other fields" context list (labels/names only, not values, are sent — no submitted data values are sent to the AI provider for code generation; template suggestions send aggregate field type/label lists only, no respondent data), consistent with §6.2's "aggregate-only, never send `nama`/respondent data" rule for Saka Tracker's own AI prompts.

### 15.5 FormGear versioning contract (independent of `APP_VERSION`)

**Prior to v5.8.0, FormGear had no version identity of its own** — the templating engine and every form/template it produced were implicitly tied to whatever `APP_VERSION` Saka Tracker happened to be on, with no way to tell whether the *engine* had changed, whether a form's *data shape* had changed, or whether a specific *form* had been edited since it was created. As of v5.8.0, `assets/formgear/form-builder.js` defines three version identifiers, all Semantic Versioning (`MAJOR.MINOR.PATCH`), and all deliberately decoupled from each other and from `APP_VERSION`:

| Identifier | Where it lives | What it tracks | When it changes |
|---|---|---|---|
| `FORMGEAR_ENGINE_VERSION` | Constant in `form-builder.js`, exposed as `window.FormGearEngineVersion` | The templating engine/renderer code itself (field-type registry, recalculation engine, AI helper) | Bumped by hand whenever the engine code changes, regardless of `APP_VERSION` or any individual form |
| `FORMGEAR_SCHEMA_VERSION` | Constant in `form-builder.js`, exposed as `window.FormGearSchemaVersion` | The **shape** of a stored form-definition object (`{id, name, sections[], fields[], ...}`) | Bumped by hand only when the schema changes incompatibly; each bump should be paired with a new branch in `migrateFormDefinition()` |
| `templateVersion` | Field on each individual form-definition object (`formgear_form_definitions`) | The revision history of **that one form/template** | Auto-initialized to `"1.0.0"` on creation; auto-bumped **PATCH** every time that specific form is re-saved via `saveBuilderDefinition()` — no manual step required |

Each form-definition object also carries its own `schemaVersion` (stamped at creation/save time from `FORMGEAR_SCHEMA_VERSION`) and `createdAt`/`updatedAt` timestamps. `loadLocalDefinitions()` runs every locally-stored form through `migrateFormDefinition()` on load, so forms created before this system existed are automatically stamped with a `"0.9.0"` baseline `schemaVersion` and a `"1.0.0"` `templateVersion` instead of failing to load.

This mirrors, at a smaller scale, the same "runtime drift detection, no build step" philosophy as §12: there is intentionally **no automatic sync** between `APP_VERSION`, `FORMGEAR_ENGINE_VERSION`, `FORMGEAR_SCHEMA_VERSION`, and any given `templateVersion` — they are allowed to advance independently. The engine version and current template's version/schema are surfaced as a small badge in the Form Builder toolbar (`renderBuilderPage()`), and each form's `templateVersion` is shown on its card in the "Pilih Form" catalog view in `index.html`.

**Operational rule:** bump `FORMGEAR_ENGINE_VERSION` (MINOR for new capabilities, PATCH for bug fixes, MAJOR for breaking changes to the builder API surface itself) whenever `form-builder.js` changes; bump `FORMGEAR_SCHEMA_VERSION` (and add a migration branch) only when the stored form-definition shape changes incompatibly. Do **not** conflate either with `APP_VERSION` — a Saka Tracker release can ship with no FormGear changes at all, and vice versa.

---
