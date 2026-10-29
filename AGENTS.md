# Agent guide — ReactNativeSample

Owner-development **template input**, not a backend or signing service.
Source lives under `React/`, with pinned seed commit `a764dd7`.
Read [README](README.md), [React README](React/README.md), and the runner's
[Docker/orchestrator runbook](https://github.com/NovaForgeLtd/10erapp-runner/blob/main/docs/07-orchestrator-api.md).

The Nova Builder runner is hosted at **https://nova-builder.dansmatrix.org/**.
Its public API uses authenticated owner-development jobs only and advertises
`productionReady:false`. **Do not** put the admin token, orchestrator token,
provider API key, signing credentials or private Nova packages in sample source,
Expo JS, public app builds, or Git history.

The runner Docker build consumes the local `React/` seed from commit a764dd7.
Owner-development deployment ZIPs now include `.env` with a generated SQL
password and separate configurable web/API host ports and public URLs. No
generated-app tests or `hosting.json` are required. Do not copy `.env`
into React/ or Git. Source code and mobile seed at React/ remain pinned.
Changing that tree requires a reviewed new pin and coordinated runner
template and tests; documentation-only root commits are allowed without
changing seed bytes. Preserve managed dependencies/lockfiles and use the
sample's existing test/build instructions rather than inventing build success.

The current shared customer MVP is React+TypeScript+Vite web-static-v1,
**not** this experimental Expo React Native profile. No IPA/APK is produced
here; VPS1 owns native builders and signing. Contract changes require
both @DeclanFrampton and @danhol86 approval (C008).
