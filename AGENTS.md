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
- Money is stored as integer cents; rounding only via `roundCents` — avoids float drift and silent cent redistribution.
- Persistence goes through `StorageAdapter` in `src/lib/store.tsx` (currently localStorage) — allows swapping to an authenticated backend with org-level RLS.
- Business rules are documented in `docs/regras-fluxo.md` and covered by `src/lib/engine/engine.test.ts`; update both when a rule changes.
