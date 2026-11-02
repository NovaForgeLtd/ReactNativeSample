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
The current Runner contract produces exactly one `deployment.zip` with the
authoritative `deployment.json`, private root `.env`, service files and native
source. Standalone `hosting.json`, `source.zip` and compatibility sidecars are
retired. The Orchestrator assigns final public URLs, a project-stable native
application identity, and distinct native release/build versions using trusted
declarative mappings. Do not copy `.env`
into React/ or Git. Protect the upstream `React/index.js` native
AppRegistry registration fix and SideForge bootstrap; generated client
work belongs in mobile/App.js and its UI components. Web and mobile must
share requested features and design; the runner checks both were updated,
plus a cross-platform app-parity.json manifest. Preserve managed
dependencies/lockfiles and use the
sample's existing test/build instructions rather than inventing build success.
Preserve the Expo `app.json` fields `expo.version`,
`expo.ios.bundleIdentifier`, `expo.ios.buildNumber`,
`expo.android.package`, `expo.android.versionCode` so Orchestrator can replace
their values in the **derived public-only compiler ZIP** without a Builder API
override. The checked-in template placeholders are not approved release
identities or versions. See Runner PR #101 and Platform #87 for activation.

The current shared customer MVP is React+TypeScript+Vite web-static-v1,
**not** this experimental Expo React Native profile. No IPA/APK is produced
here; VPS1 owns native builders and signing. Contract changes require
both @DeclanFrampton and @danhol86 approval (C008).
