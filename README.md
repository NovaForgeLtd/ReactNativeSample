# ReactNativeSample — live Nova Builder native starter

This is the **Expo / React Native sample source** consumed by the
[Nova Builder VPS2 runner](https://github.com/NovaForgeLtd/10erapp-runner)
for explicitly owner-authorised development jobs.

**Runner admin:** https://nova-builder.dansmatrix.org/

**Runner API spec:** https://nova-builder.dansmatrix.org/openapi/orchestrator-v1.json
**Owner:** @danhol86 (runner), coordinated with @DeclanFrampton (platform).

**Latest-version delivery:** this repository is **public**. Nova Builder's
trusted controller resolves `main` from the public GitHub API on **every
new job** (and checks again at execution), then downloads the exact commit
ZIP from `codeload.github.com`. It validates the archive, extracts only
`React/`, and injects that version into the job container without rebuilding
Docker or relying on an outdated embedded snapshot. **No GitHub API key,
Actions secret or template-publishing workflow is required.** If GitHub is
unreachable, the runner fails closed rather than silently using stale code.
For strict freshness, the orchestrator can pass `mobileTemplateCommit` in
POST /api/v1/jobs; the runner rejects any revision mismatch.
Status and exact commit: GET /api/v1/templates/mobile with the existing
orchestrator Bearer token. Every job and `build-report.json` records its
actual source SHA.

The upstream `React/index.js` iOS black-screen fix from commit `9e4d272`
uses native `AppRegistry.registerComponent('main', () => App)` instead of
trying to register Expo on native. The runner preserves this entrypoint and
native SideForge integration; Codex customises `mobile/App.js`.

The runner wraps a plain-text owner-development request around the latest
GitHub mobile starter **and** a React+TypeScript+Vite web + .NET 10 SQL Server API
starter. It builds and exports `source.zip`, `preview-bundle.zip`,
`deployment.zip`, **`hosting.json`**, `build-report.json` and
`native-status.json`. The standalone `hosting.json` is also inside
both ZIPs and describes web/API/SQL service names, internal/host port
variables, public URLs and reverse proxy targets for the deployment app.
The **downloaded deployment ZIP** includes `.env` with a unique SQL
password and unique Compose project name to avoid old SQL volume collisions,
alongside Compose, web/API Dockerfiles and source. Extract and run
`docker compose up -d`; no generated-app tests are required.
Web and API default to **different host ports** (8080 and 8081), changeable
through `HOST_WEB_PORT` and `HOST_API_PORT` in `.env`.
The browser API address `API_PUBLIC_URL` and web/CORS origin `WEB_PUBLIC_URL`
are also configurable there, including separate HTTPS domain names.
The browser resolves API_PUBLIC_URL at container startup (which by default
uses HOST_API_PORT) via runtime-config.json. Nginx's internal proxy uses
`api:8080`; the API uses `db:1433` for SQL. Plain Compose up rebuilds
web/API images to avoid stale runtime-config support. Do not put credentials
in `hosting.json` or the source archive.

For **every** request, web and mobile must implement matching features,
navigation, content and a coherent visual design. The runner rejects
jobs that do not edit both `web/src/` and `mobile/App.js` and requires
`app-parity.json` demonstrating matching visible title, brand color and
screens/flows. The app-parity manifest is included in both ZIPs.

**No IPA/APK is generated or signed by VPS2.** Platform-native builds and
signing are VPS1-owned through NovaBuilder/Nova Sign, pending a reviewed
cross-system contract. This Expo seed is an *experimental* addition and does
not override [shared ADR-011](https://github.com/NovaForgeLtd/10erapp-contracts/blob/main/docs/11-react-vite-baseline.md)
requiring React+TypeScript+Vite and an admitted WebView payload for MVP.

The public HTTPS endpoint is **not approved for unknown customer workloads**.
Its `productionReady:false` capability is a hard production stop because
gVisor, isolation, budget and customer entitlement acceptance have not passed.
The admin API key and orchestrator Bearer token stay on their trusted hosts;
never embed them in Expo/React clients or this repository.

See [runner setup / API handoff](https://github.com/NovaForgeLtd/10erapp-runner/blob/main/docs/07-orchestrator-api.md)
and [shared hosted-runner guidance](https://github.com/NovaForgeLtd/10erapp-contracts/blob/main/docs/12-hosted-runner-integration.md).
For developing this example independently, see [React README](React/README.md).
