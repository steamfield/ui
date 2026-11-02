# steamfield-ui

Instructions for coding agents working in this repository. Keep this file under about 200 lines: it is loaded at the start of every session. Put detail that matters only for one area in a doc and link it from Deeper context.

## Overview

`@steamfield/ui` is a tree-shakeable component library shared by the Steamfield-family sites (stacks-api, OpenData frontend, blog and shared package, decks, OpenChart examples, kelvo docs-site, Steamfield, rr site). It holds the pieces those sites had each copied: one agent/terminal demo (chat and terminal layouts), playback gating, copy buttons, tabs and install tabs, the scroll-reveal motion library, and markdown/docs helpers. TypeScript, ESM only, unbundled per-file output from tsdown, framework-free cores with React wrappers under `react/*` and a Vue binding under `vue/*`.

## Commands

Run these from the repo root. Tests and scripts run on Node (`.node-version`); Bun installs and runs scripts. If your shell's `node` is older, prefix with `mise exec node@26.13.0 --`.

| Command | What it does |
| --- | --- |
| `bun install` | Install dependencies (also installs the lefthook git hooks outside CI) |
| `bun run lint` | Biome check, including the boundary plugin in `biome-plugins/` |
| `bun run format` | Biome format and safe fixes |
| `bun run typecheck` | `tsc` over the library and tests, the tooling, and the playground |
| `bun run test` | Vitest once (projects: `library` in happy-dom, `tooling` in Node) |
| `bun run test src/copy/enhance.test.ts` | One test file |
| `bun run coverage` | Vitest with coverage thresholds (95/95/90/95) |
| `bun run build` | tsdown into `dist/`, one file per source file, CSS copied beside its module |
| `bun run lint:package` | publint, then Are the Types Wrong over every JS subpath (CSS subpaths excluded) |
| `bun run test:consumer` | Pack the tarball, install it with the React and markdown peers into a temp copy of `tests/consumer/`, typecheck and run it on Node |
| `bun run size` | size-limit budgets per entry (`.size-limit.json`, peers external) |
| `bun run test:tree-shake` | Build each app in `fixtures/tree-shake/` against `dist/` and grep for present/absent sentinels |
| `bun run playground` | Vite dev server for the playground on :5199 |
| `bun run test:a11y` | Build and preview the playground, then Playwright + axe in light/dark and reduced motion |
| `bun run check` | lint, typecheck, coverage, package lint, consumer |

`size`, `test:tree-shake` and `lint:package` read `dist/`: run `bun run build` first.

## Architecture map

```
src/
  script/         DemoScript types, validateScript, LibraryError (the only error the package throws)
  sequencer/      compile(script) -> timeline; pure stateAt(timeline, {ms}|{click}); finalState; presets
  playback/       createPlaybackGate: in-view + tab-visible + motion gating, rAF clock
  copy/ tabs/ reveal/ markdown/ docs/   framework-free cores (plain DOM or pure functions)
  agent-demo/     styles.css only: the data-part contract both renderers share
  react/          React wrappers: agent-demo, window, playback, copy, tabs, install-tabs
  vue/            Vue binding for the agent demo (decks)
  internal/       private helpers; never exported from an entry
tests/            tooling tests (export map, dependency graph, public API pins, boundaries, CSS contract)
tests/consumer/   the packed-tarball consumer fixture
tests/browser/    Playwright specs against the built playground
playground/       Vite app with one page per component
fixtures/tree-shake/  tree-shake apps and cases.json
docs/             SURVEY.md (why), API.md (design reference), MIGRATION.md (consumers)
```

Every `src/**/index.ts(x)` is an entry and maps to one `exports` key. Data flows one way: script -> sequencer -> renderer; the playback gate drives the clock that picks the position.

## Agent harness

Claude Code is the target agent. `CLAUDE.md` imports this file. Hooks live in `.claude/hooks/` and are wired in `.claude/settings.json` (per-hook detail in `.claude/README.md`; the why in `docs/harness.md`). Slash commands `/check`, `/test`, `/feature` live in `.claude/commands/`, the `add-export` skill in `.claude/skills/`, read-only `architect` and `reviewer` agents in `.claude/agents/`.

| Rule | Covers |
| --- | --- |
| `.claude/rules/typescript-library/library.md` | `src/**`, `package.json`, `tsdown.config.ts` |
| `.claude/rules/typescript-library/testing.md` | `src/**/*.test.ts`, `tests/**` |
| `.claude/rules/typescript-library/verification.md` | `src/**`, `tests/**`, `scripts/**`, `package.json` |

Shared guidance for those rules: [docs/guidance/typescript-library/index.md](docs/guidance/typescript-library/index.md).

## Conventions

- **Subpaths are the public API.** Each `src/<subpath>/index.ts` exports by name (no default, no `export *`, nothing from `src/internal/`). Adding or changing one updates `package.json` `exports`, `tests/public-api.test.ts`, `tests/consumer/`, the README section, `.size-limit.json`, and adds a changeset. The `add-export` skill walks through it.
- **The dependency graph is fixed** in `ALLOWED` in `tests/package-shape.test.ts`. Framework-free code imports no `react`/`vue`; React lives under `react/`. Share code by moving it down into `script`, `sequencer`, `playback` or `internal`, never by reaching sideways.
- **No runtime dependencies.** React, React DOM, Vue and the markdown packages (`satteri`, `github-slugger`, `shiki`) are optional peers.
- **Content is data.** No product copy, names or URLs. Every user-visible string is a prop or option with a neutral default; glyphs and timing too.
- **CSS** lives at `src/<subpath>/styles.css`, wrapped in `@layer sf`, selectors inside `:where()`, styled only through `--sf-*` custom properties with fallbacks. JS never imports CSS (a test enforces it). No Tailwind classes. Consumers theme by setting `--sf-*`.
- **`data-part` values and `--sf-*` names are public API**, like exports.
- **Accessibility baseline:** keyboard operable; no `aria-live` on content that is still playing; reduced motion renders the final state; every animated component has a deterministic final state for SSR and no-JS; nothing flashes more than 3 times a second.
- `src/` is platform neutral: no `node:*`, `process` or `console`. Every export has an explicit type (`isolatedDeclarations`).

## Guardrails

- Destructive commands, credential-shaped writes and real `.env` writes are guarded by native hooks when this project targets Claude Code, Codex, OpenCode or Cursor. A block means ask the user; never rephrase a command or use another tool to bypass it.
- Store credentials in environment variables or a secrets manager. Write variable names and placeholders in `.env.example`; ask the user to set real values.
- Load the selected agent's applicable project skills or rules before changing their area.
- Treat lint diagnostics as work to resolve. Run the project check command before finishing; instructions and hooks do not replace tests.
- Publishing, `npm version`, tags and dist-tags are the maintainer's steps; the guard hook denies them.

## Testing

- Unit tests sit beside the code (`*.test.ts(x)`) and run in happy-dom. React tests use Testing Library; Vitest globals are off, so call `cleanup()` in `afterEach`. Timers and rAF are faked the way `src/react/playback/playback.test.tsx` does. Markdown tests run on Node (`// @vitest-environment node`) through the real Sätteri processor.
- `tests/*.test.ts` are tooling tests on Node: the export map, the dependency graph, public API pins, the Grit boundary rules, and the reveal CSS contract.
- `test:consumer` is the only test of what users install. `test:tree-shake` proves subpaths stay out of each other's bundles. `test:a11y` runs axe over every playground page; add a page and its name to `tests/browser/pages.ts` for each new component.
- Behavior-focused tests against real dependencies where practical. Fake only what crosses the network to third parties.
- A bug fix starts with a test that reproduces the bug.
- Weakening or skipping a test to get green is a failure, not a fix.

## Error handling

- The package throws only `LibraryError` (`src/script/errors.ts`) with a code (`invalid_script`, `unsupported_step`, `invalid_option`) and a `field` naming the argument, never its value. `isLibraryError` works across two installed copies.
- DOM helpers never throw for runtime conditions: `copyText` resolves to a boolean, a missing target is a no-op, and a missing `IntersectionObserver` counts as in view.
- Never swallow an error. Handle it, or add context and pass it on.
- Log an error once, at the boundary that handles it.

## Debugging

- If a fix hasn't worked after two attempts with no new diagnostic step in between, stop. Write down what you learned, list two or three other root-cause hypotheses, and ask which to pursue. Running a new diagnostic between attempts resets the count.
- Read logs and error output before guessing.
- Playwright traces land in `test-results/` on failure; `bun run playground` serves the pages for manual QA.

## Build workarounds

| Where | What and why | Remove when |
| --- | --- | --- |
| `scripts/lint-package.ts` | attw runs with `--exclude-entrypoints` for every CSS subpath, which has no types to resolve | attw skips non-JS exports on its own |
| `tests/consumer/tsconfig.json` | `lib` includes `ESNext.Disposable` because shiki's public types use `Symbol.dispose` | shiki's types stop needing it |
| `biome.json` overrides | `usePlaywrightValidDescribeCallback` is off outside `tests/browser/` because it misreads Vitest's `describe(name, options, fn)` | Biome scopes Playwright rules to Playwright files |
| `src/markdown/markdown.test.ts` | runs in the Node environment: shiki's inlined wasm needs `Response.bytes`, which happy-dom lacks | happy-dom implements `Response.bytes` |

## CI

`.github/workflows/ci.yml` runs on pushes to `main`, pull requests and manual dispatch. The `checks` job runs lint, typecheck, coverage, build, package lint, the consumer check, size budgets and the tree-shake fixture; `browser` runs the Playwright/axe suite; `ci-ok` requires both. Actions are pinned by SHA with the tag in a comment; Dependabot (`.github/dependabot.yml`) proposes weekly grouped updates for npm and actions.

## Git hooks

lefthook (`lefthook.yml`): pre-commit runs Biome with fixes on staged files; pre-push runs `bun run coverage`; commit-msg enforces Conventional Commits (`.lefthook/commit-msg/conventional-commits.sh`). `bun install` installs the hooks. Never use `--no-verify`: fix the cause or the hook.

## Deferred

- A release workflow (Changesets version PRs, npm provenance publishing).
- A CommonJS build: ESM only until a named consumer needs `require`.
- Docs chrome React components (DocsShell, sidebar, TOC, pager): they stay per site, since they differ only in styling (see `docs/SURVEY.md` section 6).
- An interactive shell driver for the agent demo: Steamfield's `StacksDemo` shell stays bespoke.

## Pending user actions

- Create the GitHub repository and add it as `origin`; then require the `ci-ok` check in the branch ruleset.
- npm: confirm access to the `@steamfield` scope, remove `"private": true`, and publish (`changeset version`, then `npm publish --provenance` from CI or your machine).

## Deeper context

| Need | Read |
| --- | --- |
| Using a subpath (props, CSS variables, no-JS behavior) | [README.md](README.md) |
| Why each component looks the way it does, and the source copies | [docs/SURVEY.md](docs/SURVEY.md) |
| Design-level API reference | [docs/API.md](docs/API.md) |
| Migrating a consumer site | [docs/MIGRATION.md](docs/MIGRATION.md) |
| Why the harness is built this way | [docs/harness.md](docs/harness.md) |
| Library, testing and verification guidance | [docs/guidance/typescript-library/index.md](docs/guidance/typescript-library/index.md) |
