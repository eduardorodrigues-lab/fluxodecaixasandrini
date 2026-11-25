<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- PVA KPIs and CSV reuse the full filtered comparable subset; pagination never limits their scope.
- Supplier report names and filter/group keys use `supplierIdentity.ts`, never financial links or fallback terms.
- Launch/report search and sorting use `reportTable.ts` on presentation rows with source references intact; exports and totals consume the same full result — avoids changing financial data or disconnecting parcel actions.
- Dashboard reports adapt source records from unchanged KPI/flow outputs; pagination and available-space measurement stay presentation-only — preserves financial scopes while fitting the application shell.
- Monthly inline drafts use `monthReport.ts`, apply atomically through the existing store, and resolve affected dates through `dailyEstimate`; name-only edits preserve source calculations — avoids premature autosave, silent base changes and guessed lag intervals.
- All editable civil dates use `DateInput` from `DateField` (also re-exported by kit); calendar conversion uses local year/month/day components, not UTC serialization — avoids timezone shifts and inconsistent masks.
- User decisions use the queued `src/lib/decisions.ts` service and the single root-mounted `DecisionDialog`; review panels use the centered SidePanel variant — avoids browser dialogs and duplicate decision layers.
- Flow warning presentation is grouped by code and affected period in `src/lib/pendencias.ts`; contextual links use validated search and focus without changing shared flow filters — keeps diagnostics separate from financial calculations.
- Single calculation engine in `src/lib/engine/engine.ts`; both flow views must render from the same `buildRows` output — keeps vertical/horizontal totals identical.
- Confirmed monthly financial settings use `MonthTarget.financial`; missing settings read source parameters without mutation, and defaults apply only to newly created months — prevents silent changes during financial configuration transition.
- `estimateMonth` is shared by drafts, monthly columns and delayed flow; reviewed financial projections keep exact precision and use the source month's divisor — prevents UI divergence, destination-month division and cumulative rounding loss while preserving untouched source calculations.
- Money is stored as integer cents; rounding via `roundCents`/`splitCents` (residual on last installment, always reported) — no hidden cent loss.
- Domain mutations (effectivate, pay, reverse, extend) are pure functions in `src/lib/engine/actions.ts` applied to a draft — keeps them testable and reviewable.
- Official data is one JSON document per organization in `official_data`; writes only via `commitOfficial` server fn → service-role RPC `commit_official` (version check, idempotent request_id, audit before/after) — never grant direct table writes to clients.
- Team access (invites, member removal, access log) goes only through service-role RPCs `team_*` that re-check owner role in SQL; invite tokens are stored as SHA-256 hashes only — keeps authorization in the database.
- Server fns take an explicit `orgId`; org resolution never picks an arbitrary membership — prevents cross-org writes for invited users.
- `pickOrg` prioritizes existing shared-company membership over stale defaults in store/server — grants no new access.
- XLSX adapters use the verified CEO layout (header row 3, fixed columns) and block reconciliation when essential rows are missing — never report healthy numbers from guessed rows.
- `update()` changes are auto-flushed as per-request packages (`operation:<scope>:<requestId>` in IndexedDB, rules in `operationQueue.ts`): changes touching an in-flight/uncertain record or dependency wait, independent ones proceed, uncertain packages are only consulted read-only with backoff, and ACK rebases pending edits so older responses never overwrite newer intent; forms use isolated `saveOperation` → `commitOps` with one click. Simulations stay local; no cross-org data.
- Business rules are documented in `docs/regras-fluxo.md` and covered by `src/lib/**/*.test.ts`; update both when a rule changes.
- XLSX/XLSM is read by the selective reader `src/lib/xlsxFast.ts` (only source columns per sheet, never VBA/calcChain) and rows are applied via `applyImportRows` in `src/lib/importApply.ts`, shared by the UI and `scripts/validate-ceo-xlsm.ts` — full reads of the real 31 MB file need ~2.8 GB.
- Real financial files are never copied into the project, assets or bundle; reports with real aggregates stay outside the repo.
- New notes go through pure helpers in `src/lib/notas.ts` (generate/validate/apply, per-parcel edit/extension); planned notes store `installments`, committed notes one title per parcel sharing `noteId` — keeps per-parcel edits from touching sibling parcels.
- Banking (accounts, cards, platform default-account periods, multi-account payment batches, transfers, balances, opening-balance transition) lives in pure functions in `src/lib/engine/banco.ts`, stored in the same org document; accounts are stamped on records at write time, never recomputed — keeps history stable when defaults change.
- Supplier aliases/status/deletion rules live in pure helpers in `src/lib/fornecedores.ts`; supplier IDs are stable and links are never cascade-deleted — preserves history and prevents silent merges.
- Supplier condition edits/cancellations live in `src/lib/condicoes.ts`; retain prior versions and cancelled periods, require explicit replacement/no-default, and freeze legacy planned terms before changing defaults — prevents recalculating existing obligations.

- Manual effectivation/replanning lives in pure helpers in `src/lib/efetivacao.ts`; remaining planned parcels are stored as `remainingOverride.items` with stable IDs and before/after snapshots on the effectivation — avoids FIFO abatement on the wrong parcel.
- Source-imported records keep `origin.raw`, `sourceSupplier` (no supplier link) and exact values (fractional cents); imported receipts use `legacyZeroEstimate` and imported months `sourceExact` — reproduces Excel rules without rounding or changing manual-entry rules.
- `service_role` statement_timeout is 120s because the single org document (~11 MB after the real load) exceeds the 8s default on commit — revisit if the document keeps growing.
- Granular persistence (`db/granular/*.sql`, `src/lib/granular/`) keeps one row per record with full body, per-record version, `ord` and `changed_seq`, using the same Change protocol; it is tested only in isolated PGlite and not wired to the app until the cutover is approved — avoids monolithic rewrites without risking the active base.
