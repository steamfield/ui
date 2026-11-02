# Testing

Vitest runs two projects from `vitest.config.ts`. Never `bun test` or `--bun`.

- `library`: `src/**/*.test.ts(x)` in happy-dom, since the library targets browsers. A file that needs Node APIs the DOM shim lacks opts out with `// @vitest-environment node` (the markdown tests do, for shiki's wasm).
- `tooling`: `tests/**/*.test.ts` in Node. These check the repo and the package, not one component.

## Where each kind of test lives

- **Unit and component tests** beside the code: `src/<subpath>/*.test.ts` for the framework-free core, `src/react/<name>/*.test.tsx` with Testing Library, `src/vue/<name>/*.test.ts` with Vue Test Utils. Test behavior through the public functions and rendered markup (`data-part` hooks, roles, accessible names). Table-driven with `test.each` where inputs vary; assert errors with `expect.objectContaining({ code, field })`, never the message text.
- **Export map and dependency graph** in `tests/package-shape.test.ts`: every `src/**/index.ts(x)` has an `exports` entry (`{ types, default }`), every stylesheet is exported, `.size-limit.json` and both consumer fixtures cover every JS subpath, imports stay inside `ALLOWED` and each area's `PACKAGES` (type imports included), JSX only under `react/`, and the same rules over a fresh tsdown build of the JS and `.d.ts`.
- **Public API pins** in `tests/public-api.test.ts`: the runtime names and the type names of each entry. A new export adds its name there, which forces the release decision.
- **Boundary probes** in `tests/boundaries.test.ts`: each Grit rule in `biome-plugins/boundaries.grit` fires on a fixture file and stays quiet where the thing is allowed. A new rule adds a row to both tables.
- **CSS contract** in `tests/stylesheets.test.ts` (every `src/**/styles.css`: one `@layer sf`, `:where()` selectors, `--sf-*` properties with fallbacks) and `tests/reveal-styles.test.ts` (reveal's own hiding and backstop rules). Both parse with postcss.
- **Consumers** in `tests/consumer/` (every subpath, with every optional peer) and `tests/consumer-no-peers/` (the framework-free subpaths with nothing but the tarball), run by `bun run test:consumer`, not Vitest. A new subpath gets a block in `tests/consumer/index.ts`, and in the no-peers fixture too if its area imports no package.
- **Tree-shaking** in `fixtures/tree-shake/` (`bun run test:tree-shake`): each case lists sentinels that must be in its bundle and ones that must not. An absent sentinel has to exist somewhere in `dist/` or React, or the check fails as vacuous.
- **Browser** in `tests/browser/` (`bun run test:a11y`): Playwright and axe over the built playground, in light, dark and reduced motion.

## Habits

- `tests/helpers/library-setup.ts` runs for every library test: it unmounts React and Vue trees and restores real timers, and Vitest restores mocks and stubbed globals, so tests need no teardown of their own. Fake browser APIs with the shared helpers in `tests/helpers/dom.ts` (`stubIntersectionObserver`, `stubReducedMotion`, `setTabHidden`, `stubClipboard`, `stubExecCommand`, `stubAnimationFrame`) instead of writing a local copy.
- When you strengthen a guard, prove it can fail: add a reject row, or add the violating code, watch the guard fail, then remove it.
- Coverage thresholds (95/95/90/95) live in `vitest.config.ts` (`bun run coverage`). Cover a branch through the public function rather than lowering a threshold.
- Scope a run with `bun run test <file>` or `bun run test -t "<name>"`, and read the counts: a filter that matches nothing passes with every test skipped.
