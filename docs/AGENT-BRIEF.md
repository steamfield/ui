# Shared brief for implementation agents

You are implementing one area of `@steamfield/ui` in the worktree at
`/Users/riley/Projects/steamfield-ui/.claude/worktrees/build`. Other agents are working in other
`src/` directories of the same worktree at the same time.

Read first: `docs/SURVEY.md` (your component's section), `docs/API.md` (your subpath), and the
finished reference module `src/copy/` + `src/react/copy/` for the house style (file layout, doc
comments, how tests are written, `data-part` hooks, `@layer sf` + `:where()` CSS).

## Rules

- Touch only the directories your task names. Do NOT edit `package.json`, `bun.lock`,
  `tests/public-api.test.ts`, `tests/package-shape.test.ts`, `tests/consumer/*`, `README.md`,
  `AGENTS.md` or any config file. Instead, end your report with: the exports entries your subpaths
  need (JS and CSS), the exact runtime export names per entry for the public-api pin, and a short
  consumer-fixture snippet per subpath.
- Do not commit, stash, branch, merge or push. The orchestrator commits.
- Run plain single commands from the worktree root, no `cd` chains, loops or `$(...)`. Use Node
  26 via mise: `mise exec node@26.13.0 -- <command>`.
  - Scoped tests: `mise exec node@26.13.0 -- node node_modules/vitest/vitest.mjs run src/<dir>`
  - Typecheck: `mise exec node@26.13.0 -- bun run typecheck`
  - Lint: `mise exec node@26.13.0 -- node_modules/.bin/biome check src/<dir>` (apply fixes with
    `--write`).
  - Never `bun test` or `--bun`.
- TypeScript is strict with `isolatedDeclarations`, `exactOptionalPropertyTypes` and
  `noUncheckedIndexedAccess`: every export needs an explicit type, including return types of
  components and hooks.
- `src/` is platform neutral: no `node:*`, no `process`, no `console`. Throw only `LibraryError`
  from `src/script/errors.ts` (re-exported by `@steamfield/ui/script`); add a code there only if
  you truly need one and say so in your report.
- Export by name from each `index.ts`; no default exports, no `export *`, nothing from
  `src/internal/`. Shared private helpers go in `src/internal/` (create it if needed).
- Framework-free code lives at the top-level subpath (`src/<name>/`), React wrappers at
  `src/react/<name>/`. Framework-free code imports no `react`/`vue`. The allowed import graph is
  in `tests/package-shape.test.ts` (`ALLOWED`); stay inside it.
- No new runtime dependencies. `react`, `react-dom`, `vue` are optional peers; markdown may use
  `satteri`, `shiki`, `github-slugger`, `hast` types (optional peers, already installed as dev).
- CSS: each stylesheet sits at `src/<subpath>/styles.css`, wrapped in `@layer sf { ... }`, every
  selector inside `:where(...)`, styled only through `--sf-*` custom properties with fallbacks.
  JS never imports CSS. No Tailwind classes anywhere.
- Content is data: no product copy (OpenData, stacks, rr, Steamfield names) in the library. Every
  user-visible string is a prop or option with a neutral default.
- Accessibility baseline: keyboard operable, no `aria-live` on content that is still playing,
  `prefers-reduced-motion` renders the final state, deterministic final state for SSR/no-JS,
  nothing flashes more than 3 times a second.
- Tests: Vitest + happy-dom for `src/`, Testing Library for React (call `cleanup()` in
  `afterEach`; globals are off). Port the behavior tests from the source repos named in your task
  and adapt them to the shared API. Test behavior, not implementation. Keep coverage of your files
  at or above 95% statements/lines/functions and 90% branches.
- Fix the bugs SURVEY.md lists for your component rather than porting them.
- Source repos are read-only for you. Do not change anything outside this worktree.

## Report

Keep it short: what you built (files), which source each behavior came from, the bugs you fixed,
deviations from `docs/API.md` and why, test command output summary, and the integration snippets
listed above.
