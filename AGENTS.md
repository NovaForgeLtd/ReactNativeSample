# Agent guide — ReactNativeSample

Owner-development **template input**, not a backend or signing service.
Source lives under `React/`; the repo is now PUBLIC and the runner
fetches the latest `main` directly from GitHub when jobs are queued
and when they begin running.
Read [README](README.md), [React README](React/README.md), and the runner's
[Docker/orchestrator runbook](https://github.com/NovaForgeLtd/10erapp-runner/blob/main/docs/07-orchestrator-api.md).

The Nova Builder runner is hosted at **https://nova-builder.dansmatrix.org/**.
Its public API uses authenticated owner-development jobs only and advertises
`productionReady:false`. **Do not** put the admin token, orchestrator token,
provider API key, signing credentials or private Nova packages in sample source,
Expo JS, public app builds, or Git history.

The runner resolves the latest public `main` commit from GitHub and downloads
its React/ archive for each job, without Docker build-time pinning. GitHub
credentials are not needed anywhere in the runner or job container. No
GitHub Actions publisher, upload secret or callback endpoint is required.
Owner-development deployment ZIPs now include `.env` with a generated SQL
password, unique Compose project name and separate configurable web/API
host ports/public URLs. `hosting.json` is **required** by the external
deployment app, both standalone and in source/deployment ZIPs; no
generated-app tests are required. Do not copy `.env`
into React/ or Git. Protect the upstream `React/index.js` native
AppRegistry registration fix and SideForge bootstrap; generated client
work belongs in mobile/App.js and its UI components. Web and mobile must
share requested features and design; the runner checks both were updated,
plus a cross-platform app-parity.json manifest. Preserve managed
dependencies/lockfiles and use the
sample's existing test/build instructions rather than inventing build success.

The current shared customer MVP is React+TypeScript+Vite web-static-v1,
**not** this experimental Expo React Native profile. No IPA/APK is produced
here; VPS1 owns native builders and signing. Contract changes require
both @DeclanFrampton and @danhol86 approval (C008).
