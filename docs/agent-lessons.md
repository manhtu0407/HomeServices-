# Home Services Agent Lessons

## 2026-05-15 - Prototype Runtime Cleanup

- Prototype code should live only until the approved production slice absorbs its useful decisions.
- Production React Native routes must not import prototype components, prototype routes, public mockups, or reference-code files.
- After cleanup, tests should assert prototype runtime artifacts are absent instead of asserting that review routes still exist.
- Durable design lineage belongs in product/design contracts and memory docs, not in throwaway runtime files.
- Expo store-bound apps should not ship `/prototype` routes or `apps/mobile/public` mockup artifacts.
- Keep lessons in this file when they should survive cleanup; do not preserve deleted prototype files just to retain context.
- Remotion visual explorations, `.superpowers/` brainstorm servers, and standalone design manuals should not stay in the production worktree unless Tu explicitly approves them as durable project assets.
- Root `design.md` is now an approved durable design operating system, not a scratch design manual. Do not delete it during prototype/runtime cleanup unless Tu explicitly asks.
