import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";

const IOSNOVA_API = "https://iosnovaapi.dansmatrix.org";
const SEARCH_API = "https://iosnova-search.dansmatrix.org";
const REPO_API = "https://iosnovarepo.dansmatrix.org";
const PURPLE = "#6D28F5";
const GREEN = "#24B36B";
const RED = "#E5484D";
const WEB_TOKEN_KEY = "iosnova.web.access-token";
const BOOTSTRAP_ACTIVE_KEY = "iosnova.web.bootstrap.active";
const BOOTSTRAP_DEVICE_ID_KEY = "iosnova.web.bootstrap.device-id";
const BOOTSTRAP_DEVICE_SECRET_KEY = "iosnova.web.bootstrap.device-secret";
const BOOTSTRAP_CLAIM_KEY = "iosnova.web.bootstrap.claim";
const BOOTSTRAP_REQUEST_KEY = "iosnova.web.bootstrap.sign-request";

function browserSession() {
  return typeof window !== "undefined" ? window.sessionStorage : null;
}

function browserLocal() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function randomHex(bytes = 32) {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const data = new Uint8Array(bytes);
    crypto.getRandomValues(data);
    return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  let value = "";
  while (value.length < bytes * 2) value += Math.random().toString(16).slice(2);
  return value.slice(0, bytes * 2);
}

function isIOSBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "");
  const platform = String(navigator.platform || "");
  return /iPhone|iPad|iPod/i.test(ua) || (platform === "MacIntel" && Number(navigator.maxTouchPoints || 0) > 1);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function rawRequest(url, { method = "GET", body, token } = {}) {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Cache-Control": "no-cache, no-store, max-age=0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || (typeof data === "string" ? data : null) || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function nova(token, path, options = {}) {
  return rawRequest(`${IOSNOVA_API}${path}`, { ...options, token });
}

function normalizeApps(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.results) ? payload.results : [];
  return items.filter((item) => !item?.type || item.type === "ipa");
}

function appName(app) {
  return app?.displayName || app?.appName || app?.name || "App";
}

function appBundle(app) {
  return String(app?.bundle_identifier || app?.bundleIdentifier || "");
}

function appIcon(app) {
  return app?.iconUrl || app?.icon_url || null;
}

function sourceUrl(app) {
  const value = String(app?.download_url || app?.downloadUrl || app?.url || "").trim();
  if (!value) return "";
  if (/^https:\/\//i.test(value)) return value;
  return `${REPO_API}${value.startsWith("/") ? "" : "/"}${value}`;
}

function browserOpen(url) {
  if (typeof window !== "undefined") window.location.href = url;
}

function rememberToken(token) {
  if (!token) return;
  browserSession()?.setItem(WEB_TOKEN_KEY, token);
}

function clearWebSession() {
  browserSession()?.removeItem(WEB_TOKEN_KEY);
}

function getBootstrapCredentials() {
  const storage = browserLocal();
  if (!storage) return null;
  let deviceId = storage.getItem(BOOTSTRAP_DEVICE_ID_KEY);
  let secret = storage.getItem(BOOTSTRAP_DEVICE_SECRET_KEY);
  if (!deviceId || !secret) {
    deviceId = `iosnova-web-${randomHex(16)}`;
    secret = randomHex(40);
    storage.setItem(BOOTSTRAP_DEVICE_ID_KEY, deviceId);
    storage.setItem(BOOTSTRAP_DEVICE_SECRET_KEY, secret);
  }
  return { deviceId, secret };
}

function Button({ title, onPress, secondary = false, disabled = false, busy = false, danger = false }) {
  return <Pressable disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, danger && styles.buttonDanger, (disabled || busy) && { opacity: 0.45 }, pressed && !disabled && !busy && { opacity: 0.76 }]}>{busy ? <ActivityIndicator color={secondary ? PURPLE : "#FFFFFF"} /> : <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>}</Pressable>;
}

function Brand() {
  return <View style={styles.brandRow}><Image source={require("./assets/icon.png")} style={styles.brandIcon} /><View><Text style={styles.brandTitle}>iOSNova</Text><Text style={styles.brandSubtitle}>Apps, anywhere.</Text></View></View>;
}

function LoginScreen({ ios, onAuthenticated, onSetup }) {
  const [challenge, setChallenge] = useState(null);
  const [status, setStatus] = useState("Creating secure sign-in…");
  const [error, setError] = useState("");
  const polling = useRef(null);

  const start = useCallback(async () => {
    setError("");
    setStatus("Creating secure sign-in…");
    try {
      const next = await rawRequest(`${IOSNOVA_API}/api/v1/web-auth/start`, { method: "POST" });
      setChallenge(next);
      setStatus(ios ? "Ready to continue on this iPhone." : "Waiting for approval on your iPhone…");
    } catch (requestError) {
      setError(String(requestError?.message || requestError));
      setStatus("Could not start sign-in.");
    }
  }, [ios]);

  useEffect(() => { start(); }, [start]);
  useEffect(() => {
    if (!challenge?.loginId || !challenge?.browserSecret) return undefined;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await rawRequest(`${IOSNOVA_API}/api/v1/web-auth/${challenge.loginId}/status`, {
          method: "POST",
          body: { browserSecret: challenge.browserSecret },
        });
        if (result?.status === "approved" && result?.accessToken) {
          rememberToken(result.accessToken);
          setStatus("Approved. Opening iOSNova Web…");
          onAuthenticated(result.accessToken);
          return;
        }
      } catch (pollError) {
        if (pollError?.status === 404) {
          setStatus("Sign-in expired. Create a new one to continue.");
          return;
        }
      }
      polling.current = setTimeout(poll, 1200);
    };
    poll();
    return () => { cancelled = true; if (polling.current) clearTimeout(polling.current); };
  }, [challenge, onAuthenticated]);

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.centerPage}><View style={styles.authCard}><Brand />{ios ? <><Text style={styles.authTitle}>Continue on this iPhone</Text><Text style={styles.authBody}>If iOSNova is already installed, open it to approve this Safari session. If it is not installed yet, set up this iPhone once and iOSNova will prepare itself for this device.</Text><Button title="Open iOSNova" disabled={!challenge?.approvalUrl} onPress={() => challenge?.approvalUrl && browserOpen(challenge.approvalUrl)} /><View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>or</Text><View style={styles.orLine} /></View><Button title="Set up this iPhone" secondary onPress={onSetup} /><Text style={styles.smallText}>Setup uses Apple’s one-time configuration-profile flow to verify this iPhone’s UDID before anything is signed.</Text></> : <><Text style={styles.authTitle}>Sign in with iOSNova</Text><Text style={styles.authBody}>Scan this QR code with your iPhone. If iOSNova is installed, approve the browser in the app.</Text>{challenge?.qrImageUrl ? <View style={styles.qrFrame}><Image source={{ uri: challenge.qrImageUrl }} style={styles.qrImage} resizeMode="contain" /></View> : <ActivityIndicator color={PURPLE} size="large" />}<Text style={styles.waiting}>{status}</Text><Button title="New QR code" secondary onPress={start} /></>}{error ? <Text style={styles.error}>{error}</Text> : null}</View></ScrollView></SafeAreaView>;
}

function SetupProgress({ done, active, title, detail }) {
  return <View style={styles.setupStep}><View style={[styles.stepDot, done && styles.stepDone, active && !done && styles.stepActive]}>{done ? <Text style={styles.stepTick}>✓</Text> : active ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}</View><View style={{ flex: 1 }}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDetail}>{detail}</Text></View></View>;
}

function BootstrapScreen({ token, onToken, onContinue }) {
  const [device, setDevice] = useState(null);
  const [profile, setProfile] = useState(null);
  const [claim, setClaim] = useState(() => browserSession()?.getItem(BOOTSTRAP_CLAIM_KEY) || "");
  const [request, setRequest] = useState(null);
  const [libraryItem, setLibraryItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestTimer = useRef(null);

  const refreshDevice = useCallback(async () => {
    try {
      const current = await nova(token, "/api/v1/devices/me");
      setDevice(current);
      return current;
    } catch (requestError) {
      if (requestError?.status === 401) {
        const credentials = getBootstrapCredentials();
        if (!credentials) throw requestError;
        const auth = await rawRequest(`${IOSNOVA_API}/api/v1/auth/device`, {
          method: "POST",
          body: {
            deviceId: credentials.deviceId,
            deviceSecret: credentials.secret,
            name: "Safari iPhone",
            platform: "ios-web",
            osVersion: String(navigator?.userAgent || "").slice(0, 120),
          },
        });
        rememberToken(auth.accessToken);
        onToken(auth.accessToken);
        const current = await nova(auth.accessToken, "/api/v1/devices/me");
        setDevice(current);
        return current;
      }
      throw requestError;
    }
  }, [token, onToken]);

  useEffect(() => {
    refreshDevice().catch((value) => setError(String(value?.message || value)));
    const timer = setInterval(() => refreshDevice().catch(() => {}), 2500);
    const focus = () => refreshDevice().catch(() => {});
    if (typeof window !== "undefined") {
      window.addEventListener("focus", focus);
      document.addEventListener("visibilitychange", focus);
    }
    return () => {
      clearInterval(timer);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", focus);
        document.removeEventListener("visibilitychange", focus);
      }
    };
  }, [refreshDevice]);

  const downloadProfile = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const result = await nova(token, "/api/v1/devices/me/profile", { method: "POST" });
      setProfile(result);
      if (result?.url) browserOpen(result.url);
    } catch (requestError) { setError(String(requestError?.message || requestError)); }
    finally { setBusy(false); }
  }, [token]);

  const issueClaim = useCallback(async () => {
    if (claim || !device?.udid) return claim;
    const result = await nova(token, "/api/v1/web-bootstrap/issue", { method: "POST" });
    browserSession()?.setItem(BOOTSTRAP_CLAIM_KEY, result.claim);
    setClaim(result.claim);
    return result.claim;
  }, [claim, device?.udid, token]);

  const findClient = useCallback(async () => {
    const response = await rawRequest(`${SEARCH_API}/apps/search?name=${encodeURIComponent("iOSNova")}&type=ipa`);
    const apps = normalizeApps(response);
    return apps.find((app) => appBundle(app).toLowerCase() === "com.iosnova") || null;
  }, []);

  const prepareClient = useCallback(async () => {
    if (!device?.udid || request || libraryItem) return;
    setError("");
    try {
      await issueClaim();
      const storedRequestId = browserSession()?.getItem(BOOTSTRAP_REQUEST_KEY);
      if (storedRequestId) {
        try {
          const existing = await nova(token, `/api/v1/sign-requests/${storedRequestId}`);
          if (existing && String(existing.status || "").toLowerCase() !== "failed") {
            setRequest(existing);
            return;
          }
        } catch {}
      }

      const client = await findClient();
      if (!client) throw new Error("The current iOSNova client release could not be found in NovaRepo.");
      const source = sourceUrl(client);
      if (!source) throw new Error("The current iOSNova release does not expose an IPA source URL.");
      const created = await nova(token, "/api/v1/sign-requests", {
        method: "POST",
        body: {
          appName: "iOSNova",
          sourceIpaUrl: source,
          bundleIdentifier: "com.iosnova",
          version: client.version || null,
          displayName: "iOSNova",
        },
      });
      browserSession()?.setItem(BOOTSTRAP_REQUEST_KEY, created.id);
      setRequest(created);
    } catch (requestError) { setError(String(requestError?.message || requestError)); }
  }, [device?.udid, request, libraryItem, issueClaim, findClient, token]);

  useEffect(() => { if (device?.udid) prepareClient(); }, [device?.udid, prepareClient]);

  useEffect(() => {
    if (!request?.id || libraryItem) return undefined;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const next = await nova(token, `/api/v1/sign-requests/${request.id}`);
        setRequest(next);
        const status = String(next?.status || "").toLowerCase();
        if (status === "ready") {
          const library = await nova(token, "/api/v1/library");
          const match = Array.isArray(library) ? library.find((item) => String(item.id) === String(next.libraryAppId)) : null;
          if (match) setLibraryItem(match);
          return;
        }
        if (status === "failed") {
          setError(next.error || "iOSNova could not prepare the client for this iPhone.");
          return;
        }
      } catch (requestError) { setError(String(requestError?.message || requestError)); }
      requestTimer.current = setTimeout(poll, 1800);
    };
    poll();
    return () => { cancelled = true; if (requestTimer.current) clearTimeout(requestTimer.current); };
  }, [request, libraryItem, token]);

  const verified = !!device?.udid;
  const signingStatus = String(request?.status || "").toLowerCase();
  const prepared = !!libraryItem;
  const openNative = () => {
    if (!claim) return;
    browserOpen(`iosnova://bootstrap?claim=${encodeURIComponent(claim)}`);
  };

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.centerPage}><View style={styles.setupCard}><Brand /><Text style={styles.authTitle}>Set up iOSNova on this iPhone</Text><Text style={styles.authBody}>Safari will verify this iPhone once. iOSNova then prepares a device-specific copy of the app and connects the installed app back to this same account.</Text><View style={styles.steps}><SetupProgress done={verified} active={!verified} title="Verify this iPhone" detail={verified ? `UDID verified · ${device.udid}` : "Install the iOSNova registration profile from Settings."} /><SetupProgress done={verified && !!claim} active={verified && !claim} title="Create secure handoff" detail={claim ? "A single-use native registration claim is ready." : "The claim is created only after Apple’s profile callback verifies the UDID."} /><SetupProgress done={prepared} active={verified && !!claim && !prepared} title="Prepare iOSNova" detail={prepared ? "The signed iOSNova client is ready for OTA installation." : signingStatus === "signing" ? "Signing iOSNova specifically for this iPhone…" : signingStatus === "queued" ? "Your iOSNova build is queued…" : "iOSNova will prepare the latest client automatically."} /><SetupProgress done={false} active={prepared} title="Install and connect" detail="Install iOSNova, then open it from this page once so the single-use claim can finish registration." /></View>{!verified ? <><Button title={profile ? "Download Profile Again" : "Download Registration Profile"} busy={busy} onPress={downloadProfile} /><Text style={styles.notice}>After downloading: open Settings → Profile Downloaded → Install. Return to Safari afterwards; this page detects completion automatically.</Text></> : null}{verified && !prepared ? <View style={styles.inlineStatus}><ActivityIndicator color={PURPLE} /><Text style={styles.inlineStatusText}>{signingStatus === "failed" ? "Preparation failed" : "Preparing iOSNova for this iPhone…"}</Text></View> : null}{prepared ? <><Button title="Install iOSNova" onPress={() => browserOpen(libraryItem.installUrl)} /><Button title="Open iOSNova & Finish Setup" secondary disabled={!claim} onPress={openNative} /><Text style={styles.notice}>Wait for the app to finish installing on the Home Screen before tapping “Open iOSNova & Finish Setup”. The claim can only be used once.</Text><Button title="Continue on the web" secondary onPress={() => { browserLocal()?.removeItem(BOOTSTRAP_ACTIVE_KEY); onContinue(); }} /></> : null}{error ? <Text style={styles.error}>{error}</Text> : null}</View></ScrollView></SafeAreaView>;
}

function AppTile({ app, onGet, busy }) {
  const icon = appBundle(app).toLowerCase() === "com.iosnova" ? require("./assets/icon.png") : appIcon(app) ? { uri: appIcon(app) } : require("./assets/brand-mark.png");
  return <View style={styles.appTile}><Image source={icon} style={styles.appIcon} /><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.appTitle} numberOfLines={1}>{appName(app)}</Text><Text style={styles.appMeta} numberOfLines={1}>{app?.repository || appBundle(app) || "iOSNova Repository"}</Text><Text style={styles.appMeta}>{app?.version ? `v${app.version}` : "Latest release"}</Text></View><Pressable onPress={onGet} disabled={busy} style={styles.getButton}>{busy ? <ActivityIndicator size="small" color={PURPLE} /> : <Text style={styles.getText}>GET</Text>}</Pressable></View>;
}

function WebDashboard({ token, ios, onSignOut }) {
  const [tab, setTab] = useState("home");
  const [device, setDevice] = useState(null);
  const [apps, setApps] = useState([]);
  const [library, setLibrary] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [currentDevice, currentLibrary, currentRequests, catalogue] = await Promise.all([
        nova(token, "/api/v1/devices/me"),
        nova(token, "/api/v1/library"),
        nova(token, "/api/v1/sign-requests"),
        rawRequest(`${SEARCH_API}/apps/search?type=ipa`),
      ]);
      setDevice(currentDevice);
      setLibrary(Array.isArray(currentLibrary) ? currentLibrary : []);
      setRequests(Array.isArray(currentRequests) ? currentRequests : []);
      setApps(normalizeApps(catalogue));
    } catch (requestError) { setError(String(requestError?.message || requestError)); }
  }, [token]);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);

  const getApp = async (app) => {
    if (!device?.udid) {
      setError("The iPhone linked to this web session does not have a registered UDID yet.");
      return;
    }
    const source = sourceUrl(app);
    if (!source) { setError("This release does not expose an installable IPA source."); return; }
    setBusyId(String(app?.id || appName(app))); setError("");
    try {
      await nova(token, "/api/v1/sign-requests", {
        method: "POST",
        body: {
          appName: app?.name || appName(app),
          sourceIpaUrl: source,
          bundleIdentifier: appBundle(app) || null,
          version: app?.version || null,
          displayName: appName(app),
        },
      });
      setMessage(`${appName(app)} is being prepared for your iPhone.`);
      await refresh();
    } catch (requestError) { setError(String(requestError?.message || requestError)); }
    finally { setBusyId(""); }
  };

  const visibleApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((app) => `${appName(app)} ${appBundle(app)} ${app?.repository || ""}`.toLowerCase().includes(q));
  }, [apps, query]);
  const pending = requests.filter((request) => !["ready", "failed"].includes(String(request.status || "").toLowerCase()));

  return <SafeAreaView style={styles.dashboardPage}><View style={styles.webHeader}><Brand /><View style={styles.webNav}>{["home", "apps", "search", "library"].map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.navItem, tab === item && styles.navItemActive]}><Text style={[styles.navText, tab === item && styles.navTextActive]}>{item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}</View><Pressable onPress={onSignOut}><Text style={styles.signOut}>Sign out</Text></Pressable></View><ScrollView contentContainerStyle={styles.dashboardContent}>{error ? <Text style={styles.error}>{error}</Text> : null}{message ? <Text style={styles.success}>{message}</Text> : null}{tab === "home" ? <><Text style={styles.heroTitle}>Your iOSNova, on the web.</Text><Text style={styles.heroBody}>Browse the catalogue and prepare apps for the iPhone linked to this session.</Text><View style={styles.metricGrid}><View style={styles.metric}><Text style={styles.metricNumber}>{library.length}</Text><Text style={styles.metricLabel}>Ready in Library</Text></View><View style={styles.metric}><Text style={styles.metricNumber}>{pending.length}</Text><Text style={styles.metricLabel}>Preparing</Text></View><View style={styles.metric}><Text style={styles.metricNumber}>{device?.udid ? "✓" : "—"}</Text><Text style={styles.metricLabel}>{device?.udid ? "iPhone verified" : "UDID required"}</Text></View></View><Text style={styles.sectionTitle}>Recently updated</Text><View style={styles.appList}>{apps.slice(0, 8).map((app, index) => <AppTile key={String(app?.id || index)} app={app} busy={busyId === String(app?.id || appName(app))} onGet={() => getApp(app)} />)}</View></> : null}{tab === "apps" ? <><Text style={styles.sectionTitle}>Apps</Text><View style={styles.appList}>{apps.map((app, index) => <AppTile key={String(app?.id || index)} app={app} busy={busyId === String(app?.id || appName(app))} onGet={() => getApp(app)} />)}</View></> : null}{tab === "search" ? <><Text style={styles.sectionTitle}>Search</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search iOSNova" placeholderTextColor="#8E8E93" style={styles.searchInput} /><View style={styles.appList}>{visibleApps.map((app, index) => <AppTile key={String(app?.id || index)} app={app} busy={busyId === String(app?.id || appName(app))} onGet={() => getApp(app)} />)}</View></> : null}{tab === "library" ? <><Text style={styles.sectionTitle}>Library</Text>{pending.length ? <View style={styles.panel}><Text style={styles.panelTitle}>Preparing</Text>{pending.map((item) => <View key={item.id} style={styles.libraryRow}><ActivityIndicator color={PURPLE} /><View style={{ marginLeft: 12 }}><Text style={styles.appTitle}>{item.appName}</Text><Text style={styles.appMeta}>{String(item.status || "preparing")}</Text></View></View>)}</View> : null}<View style={styles.panel}><Text style={styles.panelTitle}>Ready to install</Text>{library.length ? library.map((item) => <View key={item.id} style={styles.libraryRow}><Image source={(String(item.bundleIdentifier || "").toLowerCase() === "com.iosnova") ? require("./assets/icon.png") : require("./assets/brand-mark.png")} style={styles.libraryIcon} /><View style={{ flex: 1, marginLeft: 12 }}><Text style={styles.appTitle}>{item.displayName || item.appName}</Text><Text style={styles.appMeta}>{item.version ? `Version ${item.version}` : item.bundleIdentifier}</Text></View>{ios ? <Pressable onPress={() => browserOpen(item.installUrl)} style={styles.installButton}><Text style={styles.installText}>INSTALL</Text></Pressable> : <Text style={styles.readyText}>Ready on iPhone</Text>}</View>) : <Text style={styles.emptyText}>Nothing has been prepared yet.</Text>}</View></> : null}</ScrollView></SafeAreaView>;
}

export default function WebApp() {
  useColorScheme();
  const ios = useMemo(() => isIOSBrowser(), []);
  const [token, setToken] = useState(() => browserSession()?.getItem(WEB_TOKEN_KEY) || "");
  const [bootstrapActive, setBootstrapActive] = useState(() => browserLocal()?.getItem(BOOTSTRAP_ACTIVE_KEY) === "1");
  const [restoring, setRestoring] = useState(ios && bootstrapActive && !token);

  const authenticateBootstrapBrowser = useCallback(async () => {
    const credentials = getBootstrapCredentials();
    if (!credentials) throw new Error("Browser storage is unavailable.");
    const auth = await rawRequest(`${IOSNOVA_API}/api/v1/auth/device`, {
      method: "POST",
      body: {
        deviceId: credentials.deviceId,
        deviceSecret: credentials.secret,
        name: "Safari iPhone",
        platform: "ios-web",
        osVersion: typeof navigator !== "undefined" ? String(navigator.userAgent || "").slice(0, 120) : "ios-web",
      },
    });
    rememberToken(auth.accessToken);
    setToken(auth.accessToken);
    return auth.accessToken;
  }, []);

  useEffect(() => {
    if (!ios || !bootstrapActive || token) { setRestoring(false); return; }
    authenticateBootstrapBrowser().catch(() => {}).finally(() => setRestoring(false));
  }, [ios, bootstrapActive, token, authenticateBootstrapBrowser]);

  const startSetup = async () => {
    browserLocal()?.setItem(BOOTSTRAP_ACTIVE_KEY, "1");
    browserSession()?.removeItem(BOOTSTRAP_CLAIM_KEY);
    browserSession()?.removeItem(BOOTSTRAP_REQUEST_KEY);
    setBootstrapActive(true);
    try { await authenticateBootstrapBrowser(); } catch {}
  };

  const signOut = () => {
    clearWebSession();
    setToken("");
  };

  if (restoring) return <SafeAreaView style={styles.page}><View style={styles.loadingPage}><ActivityIndicator color={PURPLE} size="large" /><Text style={styles.waiting}>Restoring iPhone setup…</Text></View></SafeAreaView>;
  if (!token) return <LoginScreen ios={ios} onAuthenticated={setToken} onSetup={startSetup} />;
  if (ios && bootstrapActive) return <BootstrapScreen token={token} onToken={setToken} onContinue={() => setBootstrapActive(false)} />;
  return <WebDashboard token={token} ios={ios} onSignOut={signOut} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: "100vh", backgroundColor: "#F5F5FA" },
  dashboardPage: { flex: 1, minHeight: "100vh", backgroundColor: "#F5F5FA" },
  centerPage: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingPage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  authCard: { width: "100%", maxWidth: 540, backgroundColor: "#FFFFFF", borderRadius: 30, padding: 32, boxShadow: "0 22px 70px rgba(20,18,30,0.10)" },
  setupCard: { width: "100%", maxWidth: 620, backgroundColor: "#FFFFFF", borderRadius: 30, padding: 32, boxShadow: "0 22px 70px rgba(20,18,30,0.10)" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  brandIcon: { width: 54, height: 54, borderRadius: 14 },
  brandTitle: { color: "#111114", fontSize: 23, fontWeight: "850", letterSpacing: -0.5 },
  brandSubtitle: { color: "#7B7B83", fontSize: 12, marginTop: 2 },
  authTitle: { color: "#111114", fontSize: 31, lineHeight: 36, fontWeight: "850", letterSpacing: -0.8, marginTop: 30 },
  authBody: { color: "#686870", fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 24 },
  button: { minHeight: 50, borderRadius: 16, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, marginTop: 10 },
  buttonSecondary: { backgroundColor: "#F0E9FF" },
  buttonDanger: { backgroundColor: RED },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  buttonSecondaryText: { color: PURPLE },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 14 },
  orLine: { flex: 1, height: 1, backgroundColor: "#ECECF0" },
  orText: { color: "#9999A0", fontSize: 12 },
  smallText: { color: "#8A8A92", fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 16 },
  qrFrame: { width: 292, height: 292, alignSelf: "center", padding: 14, borderRadius: 22, borderWidth: 1, borderColor: "#ECECF0", backgroundColor: "#FFFFFF" },
  qrImage: { width: "100%", height: "100%" },
  waiting: { color: PURPLE, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 16 },
  error: { color: RED, backgroundColor: "#FFF0F1", borderRadius: 12, padding: 12, marginTop: 14, fontSize: 12.5, lineHeight: 18 },
  success: { color: "#087A46", backgroundColor: "#E9F8EF", borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 12.5 },
  steps: { marginTop: 8, marginBottom: 16 },
  setupStep: { flexDirection: "row", alignItems: "flex-start", minHeight: 72 },
  stepDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#E1E1E7", alignItems: "center", justifyContent: "center", marginRight: 13, backgroundColor: "#FFFFFF" },
  stepDone: { backgroundColor: GREEN, borderColor: GREEN },
  stepActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  stepTick: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  stepTitle: { color: "#17171A", fontSize: 14, fontWeight: "800" },
  stepDetail: { color: "#777780", fontSize: 12, lineHeight: 17, marginTop: 4 },
  notice: { color: "#7B7B83", fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 13 },
  inlineStatus: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#F6F2FF", borderRadius: 16, marginTop: 10 },
  inlineStatusText: { color: PURPLE, fontWeight: "700", fontSize: 13 },
  webHeader: { minHeight: 78, backgroundColor: "rgba(255,255,255,0.92)", flexDirection: "row", alignItems: "center", paddingHorizontal: 28, borderBottomWidth: 1, borderBottomColor: "#ECECF0", gap: 28, position: "sticky", top: 0, zIndex: 20 },
  webNav: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  navItem: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 14 },
  navItemActive: { backgroundColor: "#F0E9FF" },
  navText: { color: "#717179", fontSize: 13, fontWeight: "700" },
  navTextActive: { color: PURPLE },
  signOut: { color: "#D93D45", fontSize: 13, fontWeight: "750" },
  dashboardContent: { width: "100%", maxWidth: 1040, alignSelf: "center", padding: 28, paddingBottom: 80 },
  heroTitle: { color: "#111114", fontSize: 42, lineHeight: 48, fontWeight: "880", letterSpacing: -1.3, marginTop: 20 },
  heroBody: { color: "#6F6F77", fontSize: 16, marginTop: 7, marginBottom: 28 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  metric: { flexGrow: 1, minWidth: 180, backgroundColor: "#FFFFFF", borderRadius: 22, padding: 22 },
  metricNumber: { color: "#111114", fontSize: 30, fontWeight: "850" },
  metricLabel: { color: "#777780", fontSize: 12, marginTop: 5 },
  sectionTitle: { color: "#111114", fontSize: 27, fontWeight: "850", letterSpacing: -0.6, marginTop: 30, marginBottom: 14 },
  appList: { backgroundColor: "#FFFFFF", borderRadius: 24, overflow: "hidden" },
  appTile: { minHeight: 86, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EFEFF3", gap: 13 },
  appIcon: { width: 58, height: 58, borderRadius: 14 },
  appTitle: { color: "#151518", fontSize: 15, fontWeight: "800" },
  appMeta: { color: "#808088", fontSize: 11.5, marginTop: 3 },
  getButton: { minWidth: 72, height: 34, borderRadius: 17, backgroundColor: "#F0E9FF", alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  getText: { color: PURPLE, fontSize: 12, fontWeight: "850" },
  searchInput: { height: 52, borderRadius: 17, backgroundColor: "#FFFFFF", paddingHorizontal: 16, color: "#111114", fontSize: 15, marginBottom: 14, outlineStyle: "none" },
  panel: { backgroundColor: "#FFFFFF", borderRadius: 22, paddingHorizontal: 16, marginBottom: 16 },
  panelTitle: { color: "#111114", fontSize: 16, fontWeight: "800", paddingTop: 16, paddingBottom: 8 },
  libraryRow: { minHeight: 76, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "#EFEFF3" },
  libraryIcon: { width: 48, height: 48, borderRadius: 12 },
  installButton: { height: 34, borderRadius: 17, backgroundColor: "#F0E9FF", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  installText: { color: PURPLE, fontSize: 11.5, fontWeight: "850" },
  readyText: { color: GREEN, fontSize: 11.5, fontWeight: "750" },
  emptyText: { color: "#83838B", paddingVertical: 24, textAlign: "center" },
});
