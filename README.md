# ReactNativeSample — pinned Nova Builder owner-development seed

This is the **Expo / React Native sample source** consumed by the
[Nova Builder VPS2 runner](https://github.com/NovaForgeLtd/10erapp-runner)
for explicitly owner-authorised development jobs.

**Runner admin:** https://nova-builder.dansmatrix.org/

**Runner API spec:** https://nova-builder.dansmatrix.org/openapi/orchestrator-v1.json
**Owner:** @danhol86 (runner), coordinated with @DeclanFrampton (platform).

The Docker job image includes the **React/** tree from immutable seed commit
`a764dd7` via a local, named Docker BuildKit context at image-build time.
There is no GitHub token in the Docker job and no per-job GitHub checkout.
Documentation-only commits to this repository may advance main without
changing the pinned React/ seed; changes to React/ require a deliberate
template update, lockfile/tests, a new pin and runner qualification.

The runner wraps a plain-text owner-development request around this pinned
mobile starter **and** a React+TypeScript+Vite web + .NET 10 SQL Server API
starter. It builds and exports `source.zip`, `preview-bundle.zip`,
`deployment.zip`, `build-report.json` and `native-status.json`. The
**downloaded deployment ZIP** includes a ready-to-use `.env` with a unique
SQL password, alongside Compose, web/API Dockerfiles and source. Extract
and run `docker compose up -d`; no app tests or `hosting.json` are required.
Web and API default to **different host ports** (8080 and 8081), changeable
through `HOST_WEB_PORT` and `HOST_API_PORT` in `.env`.
The browser API address `API_PUBLIC_URL` and web/CORS origin `WEB_PUBLIC_URL`
are also configurable there, including separate HTTPS domain names.

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
