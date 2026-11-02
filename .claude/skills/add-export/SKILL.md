---
name: add-export
description: Add a function, class, type, option or whole subpath to this library's public API end to end, with its error codes, tests, README entry, consumer checks, size budget and changeset. Use when asked for a new export, a new option, a new subpath or a change to an exported signature.
---

# Add an export

The public API is each subpath's `src/<subpath>/index.ts` (framework-free cores at the top level, React under `react/`, Vue under `vue/`), plus every `--sf-*` variable and `data-part` value. Read `AGENTS.md` (Conventions) and `docs/guidance/typescript-library/library.md` first; `src/copy/` with `src/react/copy/` is the smallest complete model.

Before any code, write down: the subpath it belongs to, the name and full signature with explicit types, each `LibraryError` code it can raise, and the release kind. On 0.x a breaking change (a removed or renamed export, a changed default, a new required parameter, a renamed `--sf-*` or `data-part`) is a minor bump; ask before making one.

1. **Failing tests** beside the module (`src/<subpath>/<name>.test.ts(x)`), using the shared fakes in `tests/helpers/dom.ts`. Run them and watch them fail.
2. **Errors**: a new failure adds a code and message in `src/internal/errors.ts` (re-exported from `src/script/errors.ts`). Throw `new LibraryError(code, { field })`; never a plain `Error`.
3. **Code** with explicit return types. Shared private helpers go in `src/internal/`; agent-demo shared code goes in `src/agent-demo/core.ts`. Stay inside the dependency graph in `tests/package-shape.test.ts` (`ALLOWED`); framework-free code imports no `react`/`vue`, and `.tsx` lives only under `react/`.
4. **Export** it by name from the subpath's `index.ts` (types with `type`). Pin the runtime and type names in `tests/public-api.test.ts`.
5. **New subpath only**: add the `{ types, default }` entry (and any `styles.css`) to `package.json` `exports`, its node in `ALLOWED`, a `.size-limit.json` budget, and a tree-shake case if it renders a sentinel.
6. **Consumers**: use it with its types in `tests/consumer/index.ts`; if the subpath is framework-free, also in `tests/consumer-no-peers/index.ts`; check a JavaScript misuse in `tests/consumer/index.mjs` if it takes input.
7. **CSS**, if any: `@layer sf`, selectors in `:where()`, only `--sf-*` variables with fallbacks (`tests/stylesheets.test.ts` checks this). Add a playground page or section, and its route in `playground/routes.ts`.
8. **README** section (import, usage, props table, CSS variables, no-JS behavior) and a changeset (`bunx changeset`).
9. `bun run check`, `bun run test:a11y`, then `stacks verify`. Read the new export in `dist/<subpath>/index.d.ts`. Name the release kind in your summary; never bump the version or publish.

Keep it thin: no options, overloads or aliases the request didn't ask for.
