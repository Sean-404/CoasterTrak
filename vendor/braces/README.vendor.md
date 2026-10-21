# Vendored `braces@3.0.4`

Patched copy of `micromatch/braces` with nesting-depth guards from
https://github.com/micromatch/braces/pull/72 (CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm).

Upstream 3.0.3 is still the latest npm release and is flagged by `npm audit`.
Remove this folder and the `overrides.braces` entry once an official fixed
release is published.

## How it is wired in

`package.json` lists it as a root devDependency (`"braces": "file:vendor/braces"`)
and the override points at that entry (`"braces": "$braces"`). Putting the
`file:` path directly in `overrides` makes npm link the folder without
installing its own dependency (`fill-range`), so anything loading braces
crashed. The upstream `scripts` and `devDependencies` were dropped from the
vendored `package.json`, since a root-level link installs them too and the
vendored copy ships no tests or benchmarks.

When removing the vendored copy, drop both the devDependency and the override.
