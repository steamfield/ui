---
"@steamfield/ui": patch
---

Every JS subpath in `exports` now uses `{ types, default }` instead of `{ types, import }`. The package is still ESM only, but `require("@steamfield/ui/<subpath>")` now resolves and loads through Node's require(esm) instead of failing with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `engines.node` is now `>=22.18`, the first 22.x that runs TypeScript files without a flag, which is what CI's floor check uses.

The package checks are stricter. Imports are parsed rather than pattern-matched and checked again in the built JS and `.d.ts`. A consumer with no React, Vue or markdown peers installed now typechecks and runs every framework-free subpath. Exported type names are pinned. Every stylesheet's `@layer sf`, `:where()` and `--sf-*` rules are checked, and the boundary lint catches more ways to throw, log or import a runtime module.
