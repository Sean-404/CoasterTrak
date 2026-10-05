# Vendored `braces@3.0.4`

Patched copy of `micromatch/braces` with nesting-depth guards from
https://github.com/micromatch/braces/pull/72 (CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm).

Upstream 3.0.3 is still the latest npm release and is flagged by `npm audit`.
Remove this folder and the `overrides.braces` entry once an official fixed
release is published.
