# Before calling work done

Run `bun run check` and read the output, then `stacks verify`. `check` is the same chain CI's `checks` job runs: lint, typecheck, coverage, build, package lint (publint and attw), both consumer fixtures, size budgets and the tree-shake fixture. Run `bun run test:a11y` too after touching a component, its CSS or the playground.

- A clean exit code isn't a pass. A `-t` filter that matches nothing exits 0 with every test skipped; read the counts.
- Tests import `src/`, so they can pass while the published package is broken. `bun run lint:package` and `bun run test:consumer` check the packed tarball; both run inside `check`, and are worth running on their own after touching `package.json`, `tsdown.config.ts`, an entry (`src/**/index.ts(x)`) or a public type.
- After changing a subpath's API, read `dist/<subpath>/index.d.ts` from `bun run build`: it is what TypeScript users see. Check each new export is there with the type you meant, and that framework-free subpaths' declarations import no peer.
- `size`, `test:tree-shake` and `lint:package` read `dist/`. `check` builds first; when you run one alone, run `bun run build` before it.
- Never publish, bump the version or push tags to check something; `bun pm pack --dry-run` lists what would ship.
- After a commit that ran hooks, check `git status` for files a hook rewrote and left unstaged.
- Don't report a cause you didn't observe. Quote the output you're basing it on.
