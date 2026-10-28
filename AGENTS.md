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
- Single calculation engine in `src/lib/engine/engine.ts`; both flow views must render from the same `buildRows` output — keeps vertical/horizontal totals identical.
- Money is stored as integer cents; rounding via `roundCents`/`splitCents` (residual on last installment, always reported) — no hidden cent loss.
- Domain mutations (effectivate, pay, reverse, extend) are pure functions in `src/lib/engine/actions.ts` applied to a draft — keeps them testable and reviewable.
- Official data is one JSON document per organization in `official_data`; writes only via `commitOfficial` server fn → service-role RPC `commit_official` (version check, idempotent request_id, audit before/after) — never grant direct table writes to clients.
- Every base mutation goes through `update()` in `src/lib/store.tsx` into a draft confirmed via the review dialog; simulations and the demo space stay local and are never promoted to the official base.
- Business rules are documented in `docs/regras-fluxo.md` and covered by `src/lib/**/*.test.ts`; update both when a rule changes.
