# iOSNova React Native

The iOSNova React Native application is shared across the native iOS build and Expo web.

## Native entrypoint compatibility

`index.js` registers `main` via React Native's `AppRegistry` on iOS/Android.
The NovaForge Windows iOS shell does not link `ExpoModulesCore`; importing and
calling Expo's `registerRootComponent` on the native path causes an early
`EventEmitter` runtime exception and a black screen. The Expo registration is
therefore only invoked for the web entrypoint. Keep this distinction when
changing the entry file or regenerating deployment ZIPs.

## Native iOS build on Windows

```powershell
dotnet run --project SideForge.Build.Native\SideForge.Build.Native.csproj -- build --project SideForgeRNShowcase --output SideForgeRNShowcase\NativeBuild
```

## Docker web app

The root `docker-compose.yml` contains an `iosnova-web` service. It runs the same application with `npm run web` inside a Node container and publishes Expo port `8081` to a random free localhost port.

Start only the web app:

```powershell
docker compose up -d --build iosnova-web
```

Find the allocated host address:

```powershell
docker compose port iosnova-web 8081
```

Open it directly from PowerShell:

```powershell
$address=(docker compose port iosnova-web 8081).Trim(); Start-Process "http://$address"
```

To rebuild the complete local stack, including iOSNova.Api and the web application:

```powershell
docker compose up -d --build --force-recreate
```

The web container installs Expo's web-only runtime packages during the image build, so the native package manifest does not need to carry browser-only dependencies.
