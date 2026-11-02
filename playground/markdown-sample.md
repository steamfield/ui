## Install

Add the package, then check the setup.

```sh title="Terminal" group="install"
npm install example-package
```

```text title="Output" group="install"
added 1 package in 2s
```

> [!NOTE]
> Run **verify** before the first deploy.

## Configure

| Flag | Meaning |
| --- | --- |
| `--json` | One result per line |
| `--quiet` | Errors only |

```ts title="app.config.ts"
export default { retries: 3, backoffMs: 200 };
```

> [!WARNING]
> Changing the retry count resets the backoff.

## Deploy

```sh
npm run deploy
```
