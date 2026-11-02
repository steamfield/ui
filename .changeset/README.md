# Changesets

Every change to a subpath's public API (its exports, props, options, `--sf-*` variables or
`data-part` values) adds a changeset: `bunx changeset`, pick the bump, describe the change for
consumers. While the package is on 0.x a breaking change is a minor bump and anything else is a
patch; consumers pin `~0.x`. Releasing (`changeset version`, publishing) is the maintainer's step.
