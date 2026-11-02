#!/usr/bin/env bun
// `bun run test:consumer`: proves the package the way npm would ship it. Packs it (prepack builds
// dist/ first), installs the tarball into temporary copies of two fixtures, then typechecks each
// against the installed declarations and runs it with Node. tests/consumer/ gets every optional
// peer; tests/consumer-no-peers/ gets nothing but the tarball, which proves the framework-free
// subpaths import, typecheck and run without React, Vue or the markdown packages. Tests that
// import src/ can't catch a wrong "exports" map, a missing file or declarations that don't match
// the build.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const { name, devDependencies, peerDependencies } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  name: string;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};
// Optional peers the fixture exercises, installed at the versions this repo develops against.
const CONSUMER_PEERS = [
  "react",
  "react-dom",
  "@types/react",
  "@types/react-dom",
  "satteri",
  "github-slugger",
  "shiki",
  "vue",
  "@types/node",
];
const peers = Object.fromEntries(
  CONSUMER_PEERS.map((peer) => [peer, devDependencies[peer] ?? "latest"]),
);

function run(command: string, args: string[], cwd: string): void {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? result.signal}`);
  }
}

/**
 * Installs the tarball (plus `deps`) into a copy of `fixture`, then typechecks and runs `files`.
 */
function consume(
  tarball: string,
  fixture: string,
  deps: Record<string, string>,
  files: string[],
): string {
  const app = join(work, fixture);
  cpSync(join(root, "tests", fixture), app, { recursive: true });
  const manifest = {
    name: fixture,
    private: true,
    type: "module",
    dependencies: { [name]: `file:${join(work, tarball)}`, ...deps },
  };
  writeFileSync(join(app, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  run("bun", ["install", "--no-save"], app);
  run(join(root, "node_modules/.bin/tsc"), ["-p", "tsconfig.json"], app);
  for (const file of files) run("node", [file], app);
  return app;
}

const work = mkdtempSync(join(tmpdir(), "consumer-"));
try {
  run("bun", ["pm", "pack", "--destination", work, "--quiet"], root);
  const tarball = readdirSync(work).find((file) => file.endsWith(".tgz"));
  if (!tarball) throw new Error(`bun pm pack wrote no tarball into ${work}`);

  consume(tarball, "consumer", peers, ["index.mjs", "index.ts"]);

  const bare = consume(tarball, "consumer-no-peers", {}, ["index.ts"]);
  const leaked = [...Object.keys(peerDependencies), "@types/node"].filter((peer) =>
    existsSync(join(bare, "node_modules", peer)),
  );
  if (leaked.length > 0) {
    throw new Error(`consumer-no-peers was meant to have no peers, but has ${leaked.join(", ")}`);
  }
  console.log(`consumer: ${tarball} installs, typechecks and runs, with and without peers`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
