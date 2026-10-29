import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Appearance,
  AppState,
  DynamicColorIOS,
  Image,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  requireNativeComponent,
  useColorScheme,
} from "react-native";
import { useBreakpoint } from "./src/hooks/useBreakpoint";

const PURPLE = "#6D28F5";
const GREEN = "#24B36B";
const RED = "#FF453A";
const ORANGE = "#FF9F0A";
const dynamicColor = (light, dark) => Platform.OS === "ios" ? DynamicColorIOS({ light, dark }) : light;
const INK = dynamicColor("#111114", "#F7F7FA");
const MUTED = dynamicColor("#6E6E73", "#A1A1AA");
const SECONDARY = dynamicColor("#8E8E93", "#8E8E93");
const BG = dynamicColor("#F7F7FB", "#05070A");
const SAFE_BG = dynamicColor("#FBFBFD", "#05070A");
const CARD = dynamicColor("#FFFFFF", "#101419");
const CARD_2 = dynamicColor("#F1F1F6", "#171C22");
const LINE = dynamicColor("rgba(17,17,20,0.08)", "rgba(255,255,255,0.09)");
const FIELD_BG = dynamicColor("#EEEFF4", "#171C22");
const GLASS_FALLBACK = dynamicColor("rgba(248,248,252,0.91)", "rgba(18,22,28,0.91)");
const PURPLE_SOFT = dynamicColor("#F0E9FF", "#26184A");
const GREEN_SOFT = dynamicColor("#E9F8EF", "#102C1E");
const ORANGE_SOFT = dynamicColor("#FFF3E1", "#352510");
const RED_SOFT = dynamicColor("#FFF0F0", "#391719");

const webPointer = Platform.OS === 'web' ? { cursor: 'pointer' } : {};

const IOSNOVA_API = "https://iosnovaapi.dansmatrix.org";
const SEARCH_API = "https://iosnova-search.dansmatrix.org";
const REPO_API = "https://iosnovarepo.dansmatrix.org";
const storage = NativeModules.SideForgeStorage;
const saved = {
  get: async (key) => storage?.getItem ? await storage.getItem(key) : null,
  set: async (key, value) => { if (storage?.setItem) await storage.setItem(key, String(value)); },
  remove: async (key) => { if (storage?.removeItem) await storage.removeItem(key); },
};

let cachedNovaToken = null;
let sessionPromise = null;

function randomSecret(length = 48) {
  let value = "";
  while (value.length < length) value += Math.random().toString(36).slice(2);
  return value.slice(0, length);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function getDeviceCredentials() {
  if (storage?.getDeviceCredentials) {
    try {
      const native = await storage.getDeviceCredentials();
      if (native?.deviceId) {
        let secret = native.secret ? String(native.secret) : null;
        if (!secret) {
          secret = await saved.get("iosnova.device.secret");
          if (!secret) {
            secret = randomSecret(64);
            await saved.set("iosnova.device.secret", secret);
          }
        }
        return { deviceId: String(native.deviceId), secret };
      }
    } catch {}
  }
  let deviceId = await saved.get("iosnova.device.id");
  let secret = await saved.get("iosnova.device.secret");
  if (!deviceId) {
    deviceId = `NOVA-${randomSecret(8)}-${randomSecret(8)}`.toUpperCase();
    await saved.set("iosnova.device.id", deviceId);
  }
  if (!secret) {
    secret = randomSecret(64);
    await saved.set("iosnova.device.secret", secret);
  }
  return { deviceId, secret };
}

async function getNovaToken() {
  if (cachedNovaToken) return cachedNovaToken;
  const stored = await saved.get("iosnova.auth.token");
  if (stored) cachedNovaToken = String(stored);
  return cachedNovaToken;
}

async function saveNovaToken(token) {
  cachedNovaToken = String(token);
  await saved.set("iosnova.auth.token", cachedNovaToken);
  await saved.remove("dans.auth.token");
  await saved.remove("sideforge.device.token");
  await saved.remove("sideforge.device.udid");
}

async function clearNovaToken() {
  cachedNovaToken = null;
  await saved.remove("iosnova.auth.token");
}

async function novaRequest(path, { method = "GET", body, token, anonymous = false } = {}) {
  const bearer = anonymous ? null : token || await getNovaToken();
  const response = await fetch(`${IOSNOVA_API}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401 && !anonymous) await clearNovaToken();
    const message = data?.error || data?.message || data?.title || (typeof data === "string" ? data : null);
    const error = new Error(message || `iOSNova returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function ensureNovaSession({ force = false } = {}) {
  if (!force) {
    const token = await getNovaToken();
    if (token) {
      try {
        const device = await novaRequest("/api/v1/devices/me", { token });
        return { accessToken: token, device };
      } catch {}
    }
  }
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const credentials = await getDeviceCredentials();
    const auth = await novaRequest("/api/v1/auth/device", {
      method: "POST",
      anonymous: true,
      body: {
        deviceId: credentials.deviceId,
        deviceSecret: credentials.secret,
        name: Platform.OS === "ios" ? "iPhone" : "Device",
        platform: Platform.OS,
        osVersion: String(Platform.Version || ""),
      },
    });
    if (!auth?.accessToken) throw new Error("iOSNova did not return a device access token.");
    await saveNovaToken(auth.accessToken);
    const device = await novaRequest("/api/v1/devices/me", { token: auth.accessToken });
    return { ...auth, device };
  })().finally(() => { sessionPromise = null; });
  return sessionPromise;
}

function resolveRepoUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:/i.test(url)) return url;
  return `${REPO_API}${url.startsWith("/") ? "" : "/"}${url}`;
}
function normalizeSearchResults(data) {
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : Array.isArray(data?.results) ? data.results : [];
  return items.filter((item) => !item?.type || item.type === "ipa");
}
function appIconUrl(app) { return app?.iconUrl || app?.icon_url || null; }
function appName(app) { return app?.displayName || app?.appName || app?.name || "App"; }
function appKey(app, index = 0) { return String(app?.id || app?.bundle_identifier || app?.bundleIdentifier || `${appName(app)}-${index}`); }
function signingKey(app) { return String(app?.__signingKey || app?.id || `${appName(app)}-${app?.version || "latest"}`); }
function categoryFor(app) { return String(app?.category || app?.genre || app?.repository || "Utilities").trim() || "Utilities"; }
function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}
function formatVersionDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}
function versionEntries(app) {
  const latestUrl = app?.download_url || app?.downloadUrl || app?.url || "";
  const latest = {
    version: app?.version || "Latest",
    date: app?.versionDate || app?.version_date || app?.date || "",
    repository: app?.repository || "",
    localized_description: app?.localized_description || app?.description || "",
    download_url: latestUrl,
    size: app?.size,
    latest: true,
  };
  const archived = Array.isArray(app?.versions) ? app.versions : [];
  const seen = new Set();
  return [latest, ...archived].filter((entry) => {
    const version = String(entry?.version || "").trim();
    const url = String(entry?.download_url || entry?.downloadUrl || entry?.url || "").trim();
    if (!version && !url) return false;
    const key = `${version.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function versionSigningApp(app, entry, index) {
  const version = entry?.version || app?.version || null;
  const source = entry?.download_url || entry?.downloadUrl || entry?.url || (entry?.latest ? app?.download_url || app?.downloadUrl || app?.url : null);
  return {
    ...app,
    id: `${appKey(app)}-version-${String(version || index)}-${index}`,
    __signingKey: `${appKey(app)}-version-${String(version || index)}-${index}`,
    name: app?.name || app?.displayName || "App",
    displayName: appName(app),
    version,
    repository: entry?.repository || app?.repository,
    description: entry?.localized_description || entry?.description || app?.description,
    download_url: source,
  };
}

const TABS = [
  { id: "home", label: "Home", icon: require("./assets/tabs/today.png") },
  { id: "apps", label: "Apps", icon: require("./assets/tabs/apps.png") },
  { id: "search", label: "Search", icon: require("./assets/tabs/lab.png") },
  { id: "library", label: "Library", icon: require("./assets/tabs/updates.png") },
];
const IOSGlassTabBar = Platform.OS === "ios" ? requireNativeComponent("SideForgeGlassTabBar") : null;

function AppIcon({ app, size = 58 }) {
  const uri = appIconUrl(app);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }} />;
  return <View style={[s.fallbackIcon, { width: size, height: size, borderRadius: Math.round(size * 0.22) }]}><Text style={[s.fallbackLetter, { fontSize: Math.round(size * 0.34) }]}>{appName(app).slice(0, 1).toUpperCase()}</Text></View>;
}
function Pill({ children, active = false, tone = "purple", onPress }) {
  const backgroundColor = active ? PURPLE : tone === "green" ? GREEN_SOFT : tone === "orange" ? ORANGE_SOFT : CARD_2;
  const color = active ? "#FFFFFF" : tone === "green" ? GREEN : tone === "orange" ? ORANGE : INK;
  const body = <View style={[s.pill, { backgroundColor }]}><Text style={[s.pillText, { color }]}>{children}</Text></View>;
  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        hovered && Platform.OS === 'web' && { opacity: 0.85 },
        pressed && { opacity: 0.62 },
        webPointer,
      ]}
    >
      {body}
    </Pressable>
  ) : body;
}
function ActionButton({ title, onPress, busy = false, disabled = false, compact = false, secondary = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed, hovered }) => [
        compact ? s.actionCompact : s.actionButton,
        secondary && s.actionSecondary,
        hovered && Platform.OS === 'web' && (secondary ? s.actionSecondaryHover : s.actionButtonHover),
        (disabled || busy) && { opacity: 0.45 },
        pressed && !disabled && !busy && { opacity: 0.7, transform: [{ scale: 0.98 }] },
        webPointer,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? PURPLE : "#FFFFFF"} size="small" />
      ) : (
        <Text style={[compact ? s.actionCompactText : s.actionButtonText, secondary && { color: PURPLE }]}>{title}</Text>
      )}
    </Pressable>
  );
}
function Page({ children, refreshing, onRefresh, style }) {
  const { isDesktop } = useBreakpoint();
  return (
    <ScrollView
      contentContainerStyle={[s.page, isDesktop && s.pageDesktop, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={PURPLE} /> : undefined}
    >
      <View style={[s.pageInner, isDesktop && s.pageInnerDesktop]}>
        {children}
      </View>
    </ScrollView>
  );
}
function TopHeader({ title, onProfile, trailing }) {
  const { isDesktop } = useBreakpoint();
  return (
    <View style={[s.topHeader, isDesktop && s.topHeaderDesktop]}>
      <Text style={[s.headerTitle, isDesktop && s.headerTitleDesktop]}>{title}</Text>
      {trailing || (onProfile ? (
        <Pressable
          onPress={onProfile}
          style={({ pressed, hovered }) => [
            s.profileButton,
            hovered && Platform.OS === 'web' && { opacity: 0.8 },
            pressed && { opacity: 0.65 },
            webPointer,
          ]}
        >
          <Image source={require("./assets/tabs/account.png")} style={s.profileIcon} />
        </Pressable>
      ) : null)}
    </View>
  );
}
function SectionHeader({ title, action, onAction }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} style={({ hovered }) => [hovered && Platform.OS === 'web' && { opacity: 0.75 }, webPointer]}>
          <Text style={s.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
function SearchField({ value, onChangeText, placeholder = "Search apps, games...", autoFocus = false }) {
  return (
    <View style={s.searchField}>
      <Text style={s.searchGlyph}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={SECONDARY}
        style={s.searchInput}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} style={webPointer}>
          <Text style={s.searchClear}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
function AppRow({ app, onOpen, onGet, busy, community = false, actionTitle, style }) {
  const developer = community ? `Shared by ${app?.sharedBy || "iOSNova User"}` : app?.developer_name || app?.repository || categoryFor(app);
  const meta = [app?.version ? `v${app.version}` : null, categoryFor(app)].filter(Boolean).join(" · ");
  return (
    <View style={[s.appRow, style]}>
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        style={({ pressed, hovered }) => [
          s.appRowMain,
          hovered && Platform.OS === 'web' && s.appRowMainHover,
          pressed && onOpen && { opacity: 0.62 },
          onOpen && webPointer,
        ]}
      >
        <AppIcon app={app} />
        <View style={s.appRowText}>
          <Text style={s.appRowTitle} numberOfLines={1}>{appName(app)}</Text>
          <Text style={s.appRowDeveloper} numberOfLines={1}>{developer}</Text>
          <Text style={s.appRowMeta} numberOfLines={1}>{meta}</Text>
        </View>
      </Pressable>
      <ActionButton title={actionTitle || "GET"} compact busy={busy} onPress={onGet} />
    </View>
  );
}
function CompactAppCard({ app, onPress, onGet, busy, style }) {
  return (
    <View style={[s.compactCard, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed, hovered }) => [
          s.compactMain,
          hovered && Platform.OS === 'web' && { opacity: 0.82 },
          pressed && { opacity: 0.72 },
          webPointer,
        ]}
      >
        <AppIcon app={app} size={52} />
        <Text style={s.compactTitle} numberOfLines={1}>{appName(app)}</Text>
        <Text style={s.compactMeta} numberOfLines={1}>{categoryFor(app)}</Text>
      </Pressable>
      <ActionButton title="GET" compact busy={busy} onPress={onGet} />
    </View>
  );
}
function CommunityBanner({ onPress, count }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }) => [
        s.communityBanner,
        hovered && Platform.OS === 'web' && s.communityBannerHover,
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
        webPointer,
      ]}
    >
      <View style={s.communityBubble}>
        <Text style={s.communityBubbleGlyph}>◉</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.communityBannerTitle}>Community</Text>
        <Text style={s.communityBannerBody}>
          {count ? `${count} shared app${count === 1 ? "" : "s"} ready to explore.` : "Discover apps shared by the iOSNova community."}
        </Text>
      </View>
      <View style={s.communityArrow}>
        <Text style={s.communityArrowText}>›</Text>
      </View>
    </Pressable>
  );
}

function HomeScreen({ apps, community, library, requests, onGet, signingId, onOpenApp, onBrowse, onLibrary, onCommunity, onProfile }) {
  const featured = apps[0];
  const recent = apps.slice(0, 5);
  const popular = apps.slice(5, 8).length ? apps.slice(5, 8) : apps.slice(0, 3);
  const pending = requests.filter((x) => !["ready", "failed"].includes(String(x.status).toLowerCase())).length;
  return <Page>
    <TopHeader title="iOSNova" onProfile={onProfile} />
    <Text style={s.homeHeadline}>Discover amazing apps.</Text>
    <CommunityBanner onPress={onCommunity} count={community.length} />
    {featured ? <Pressable onPress={() => onOpenApp(featured)} style={({ pressed }) => [s.heroCard, pressed && { opacity: 0.92 }]}><View style={s.heroGlowOne} /><View style={s.heroGlowTwo} /><Text style={s.heroKicker}>FEATURED</Text><View style={s.heroContent}><View style={{ flex: 1, paddingRight: 18 }}><Text style={s.heroTitle}>{appName(featured)}</Text><Text style={s.heroBody} numberOfLines={2}>{featured.description || "A fresh release prepared for your iPhone."}</Text><View style={{ alignSelf: "flex-start", marginTop: 16 }}><ActionButton title="GET" compact busy={signingId === signingKey(featured)} onPress={() => onGet(featured)} /></View></View><AppIcon app={featured} size={96} /></View></Pressable> : null}
    <Pressable onPress={onLibrary} style={({ pressed }) => [s.librarySummary, pressed && { opacity: 0.68 }]}><View style={s.librarySummaryIcon}><Text style={s.librarySummaryTick}>✓</Text></View><View style={{ flex: 1 }}><Text style={s.librarySummaryTitle}>Your Library</Text><Text style={s.librarySummaryCaption}>{pending ? `${pending} app${pending === 1 ? "" : "s"} being prepared` : "Everything is up to date"}</Text></View><View style={s.summaryStat}><Text style={s.summaryStatValue}>{library.length}</Text><Text style={s.summaryStatLabel}>Ready</Text></View><Text style={s.disclosure}>›</Text></Pressable>
    <SectionHeader title="Recently Updated" action="See All" onAction={onBrowse} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontalCards}>{recent.map((app, index) => <CompactAppCard key={`${appKey(app, index)}-${index}`} app={app} onPress={() => onOpenApp(app)} onGet={() => onGet(app)} busy={signingId === signingKey(app)} />)}</ScrollView>
    <SectionHeader title="Popular This Week" action="See All" onAction={onBrowse} />
    <View style={s.cardGroup}>{popular.map((app, index) => <React.Fragment key={`${appKey(app, index)}-popular`}><AppRow app={app} onOpen={() => onOpenApp(app)} onGet={() => onGet(app)} busy={signingId === signingKey(app)} />{index < popular.length - 1 ? <View style={s.separator} /> : null}</React.Fragment>)}</View>
  </Page>;
}

const FILTERS = ["All", "Games", "Social", "Streaming", "Utilities", "Tweaked"];
function AppsScreen({ apps, loading, error, reload, onGet, signingId, onOpenApp, onProfile, onCommunity }) {
  const [filter, setFilter] = useState("All");
  const filtered = useMemo(() => filter === "All" ? apps : apps.filter((app) => `${categoryFor(app)} ${app?.description || ""} ${app?.repository || ""}`.toLowerCase().includes(filter.toLowerCase())), [apps, filter]);
  return <Page refreshing={loading} onRefresh={reload}><TopHeader title="Apps" onProfile={onProfile} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>{FILTERS.map((item) => <Pill key={item} active={filter === item} onPress={() => setFilter(item)}>{item}</Pill>)}</ScrollView><Pressable onPress={onCommunity} style={({ pressed }) => [s.communityStrip, pressed && { opacity: 0.7 }]}><View><Text style={s.communityStripTitle}>Community</Text><Text style={s.communityStripText}>Apps shared by iOSNova users</Text></View><Text style={s.communityStripAction}>Explore ›</Text></Pressable>{error ? <Text style={s.errorText}>{error}</Text> : null}<View style={s.cardGroup}>{filtered.length ? filtered.map((app, index) => <React.Fragment key={`${appKey(app, index)}-browse`}><AppRow app={app} onOpen={() => onOpenApp(app)} onGet={() => onGet(app)} busy={signingId === signingKey(app)} />{index < filtered.length - 1 ? <View style={s.separator} /> : null}</React.Fragment>) : <Text style={s.emptyText}>No apps match this category yet.</Text>}</View></Page>;
}

function SearchScreen({ apps, onGet, signingId, onOpenApp, onCommunity, onProfile }) {
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setRemoteResults(null); setSearchError(""); setSearching(false); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true); setSearchError("");
      try {
        const response = await fetch(`${SEARCH_API}/apps/search?name=${encodeURIComponent(trimmed)}&type=ipa`, { headers: { Accept: "application/json" }, signal: controller.signal });
        if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
        setRemoteResults(normalizeSearchResults(await response.json()));
      } catch (error) {
        if (error?.name !== "AbortError") setSearchError(String(error?.message || error));
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return apps.filter((app) => `${app.displayName || ""} ${appName(app)} ${app.repository || ""} ${app.bundle_identifier || ""} ${categoryFor(app)} ${app?.description || ""}`.toLowerCase().includes(q));
  }, [apps, query]);
  const results = remoteResults !== null ? remoteResults : localMatches;
  return <Page><TopHeader title="Search" onProfile={onProfile} /><SearchField value={query} onChangeText={setQuery} />{!query.trim() ? <><SectionHeader title="Trending Searches" /><View style={s.trendingWrap}>{["Spotify", "YouTube++", "Minecraft", "TikTok", "Instagram", "Delta"].map((x) => <Pill key={x} onPress={() => setQuery(x)}>{x}</Pill>)}</View><SectionHeader title="Browse Categories" /><View style={s.categoryGrid}>{[["Games", "⌁"], ["Streaming", "▶"], ["Social", "●"], ["Utilities", "✦"], ["Tweaked", "✧"], ["Community", "◉"]].map(([name, glyph]) => <Pressable key={name} onPress={name === "Community" ? onCommunity : () => setQuery(name)} style={({ pressed }) => [s.categoryCard, pressed && { opacity: 0.7 }, name === "Community" && s.categoryCardPurple]}><Text style={s.categoryGlyph}>{glyph}</Text><Text style={s.categoryTitle}>{name}</Text>{name === "Community" ? <Text style={s.categoryHint}>Shared apps</Text> : null}</Pressable>)}</View></> : <><SectionHeader title={searching ? "Searching…" : `Results for “${query.trim()}”`} />{searchError ? <Text style={s.errorText}>Live search unavailable; showing loaded matches. {searchError}</Text> : null}<View style={s.cardGroup}>{results.length ? results.map((app, index) => <React.Fragment key={`${appKey(app, index)}-search`}><AppRow app={app} onOpen={() => onOpenApp(app)} onGet={() => onGet(app)} busy={signingId === signingKey(app)} />{index < results.length - 1 ? <View style={s.separator} /> : null}</React.Fragment>) : <Text style={s.emptyText}>{searching ? "Searching repositories…" : "No apps found."}</Text>}</View></>}</Page>;
}

function statusTone(status) {
  switch (String(status || "").toLowerCase()) {
    case "ready": return { color: GREEN, label: "READY" };
    case "failed": return { color: RED, label: "FAILED" };
    case "queued": return { color: PURPLE, label: "REQUESTED" };
    default: return { color: PURPLE, label: "PREPARING" };
  }
}
function LibraryScreen({ library, requests, loading, reload, onBrowse, onProfile, onInstall }) {
  const pending = requests.filter((x) => !["ready", "failed"].includes(String(x.status).toLowerCase()));
  const failed = requests.filter((x) => String(x.status).toLowerCase() === "failed");
  return <Page refreshing={loading} onRefresh={reload}><TopHeader title="Library" onProfile={onProfile} />{pending.length ? <><SectionHeader title="Preparing" /><View style={s.cardGroup}>{pending.map((item, index) => { const tone = statusTone(item.status); return <React.Fragment key={item.id}><View style={s.requestRow}><View style={[s.statusRing, { borderColor: tone.color }]}><ActivityIndicator color={tone.color} size="small" /></View><View style={{ flex: 1 }}><Text style={s.appRowTitle}>{item.appName}</Text><Text style={[s.requestStatus, { color: tone.color }]}>{tone.label}</Text></View></View>{index < pending.length - 1 ? <View style={s.separator} /> : null}</React.Fragment>; })}</View></> : null}<SectionHeader title="Ready to Install" action={library.length ? `${library.length} Apps` : undefined} /><View style={s.cardGroup}>{library.length ? library.map((app, index) => <React.Fragment key={app.id}><View style={s.libraryRow}><View style={s.libraryIcon}><Text style={s.libraryIconGlyph}>✓</Text></View><View style={{ flex: 1, paddingRight: 8 }}><Text style={s.appRowTitle}>{app.displayName || app.appName}</Text><Text style={s.appRowDeveloper}>{app.version ? `Version ${app.version}` : app.bundleIdentifier || "Signed for this iPhone"}</Text><Text style={s.appRowMeta}>Prepared for this iPhone</Text></View><ActionButton title="INSTALL" compact onPress={() => onInstall(app)} /></View>{index < library.length - 1 ? <View style={s.separator} /> : null}</React.Fragment>) : <View style={s.emptyState}><Text style={s.emptyGlyph}>↓</Text><Text style={s.emptyTitle}>Your library is empty</Text><Text style={s.emptyText}>Apps prepared for this iPhone will appear here.</Text><ActionButton title="Browse Apps" secondary onPress={onBrowse} /></View>}</View>{failed.length ? <><SectionHeader title="Needs Attention" /><View style={s.cardGroup}>{failed.slice(0, 4).map((item) => <View key={item.id} style={s.failedRow}><Text style={s.failedGlyph}>!</Text><View style={{ flex: 1 }}><Text style={s.appRowTitle}>{item.appName}</Text><Text style={s.errorSmall}>{item.error || "This app could not be prepared."}</Text></View></View>)}</View></> : null}</Page>;
}

function ModalShell({ visible, onClose, children }) {
  const { isDesktop } = useBreakpoint();
  if (isDesktop && Platform.OS === "web") {
    if (!visible) return null;
    return (
      <View style={s.desktopModalOverlay}>
        <Pressable style={s.desktopModalBackdrop} onPress={onClose} />
        <View style={s.desktopModalCard}>
          <SafeAreaView style={s.modalSafe}>{children}</SafeAreaView>
        </View>
      </View>
    );
  }
  return <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"} allowSwipeDismissal onRequestClose={onClose} onDismiss={onClose}><SafeAreaView style={s.modalSafe}>{children}</SafeAreaView></Modal>;
}
function ModalTitleBar({ title, onClose }) {
  return <View style={s.modalTitleBar}><Text style={s.modalTitle}>{title}</Text><Pressable onPress={onClose}><Text style={s.modalDone}>Done</Text></Pressable></View>;
}
function AppDetailsSheet({ app, visible, onClose, onGet, signingId }) {
  if (!app) return null;
  const entries = versionEntries(app);
  return <ModalShell visible={visible} onClose={onClose}><View style={s.modalToolbar}><Pressable onPress={onClose}><Text style={s.backText}>‹ Back</Text></Pressable><View style={{ flex: 1 }} /><Text style={s.toolbarDots}>•••</Text></View><ScrollView contentContainerStyle={s.detailPage} showsVerticalScrollIndicator={false}><View style={s.detailHero}><AppIcon app={app} size={88} /><View style={s.detailIdentity}><Text style={s.detailTitle}>{appName(app)}</Text><Text style={s.detailSubtitle}>{app.developer_name || app.repository || categoryFor(app)}</Text></View></View><View style={s.detailStats}><View><Text style={s.statValue}>4.7 ★</Text><Text style={s.statLabel}>Ratings</Text></View><View><Text style={s.statValue}>17+</Text><Text style={s.statLabel}>Age</Text></View><View><Text style={s.statValue}>{categoryFor(app)}</Text><Text style={s.statLabel}>Category</Text></View></View><ActionButton title="GET" busy={signingId === signingKey(app)} onPress={() => onGet(app)} /><SectionHeader title="What’s New" /><View style={s.infoCard}><View style={s.whatsNewTop}><Text style={s.infoTitle}>Version {app.version || "Latest"}</Text><Text style={s.infoMeta}>{formatVersionDate(app.versionDate || app.version_date || app.date) || "Latest release"}</Text></View><Text style={s.infoBody}>{app.localized_description || app.description || "Updated app release ready to be prepared for your iPhone."}</Text></View><SectionHeader title="About" /><Text style={s.aboutText}>{app.description || "This app is available through iOSNova."}</Text><View style={s.infoCard}>{[["Developer", app.developer_name || app.repository], ["Version", app.version], ["Size", formatBytes(app.size)], ["Bundle ID", app.bundle_identifier || app.bundleIdentifier]].filter(([, value]) => value).map(([label, value], index, arr) => <React.Fragment key={label}><View style={s.infoRow}><Text style={s.infoLabel}>{label}</Text><Text style={s.infoValue} numberOfLines={2}>{value}</Text></View>{index < arr.length - 1 ? <View style={s.infoDivider} /> : null}</React.Fragment>)}</View><SectionHeader title="Version History" /><Text style={s.versionIntro}>Install a previous release by preparing that exact archived IPA for this iPhone.</Text><View style={s.infoCard}>{entries.map((entry, index) => { const versionApp = versionSigningApp(app, entry, index); const source = resolveRepoUrl(versionApp.download_url); const details = [formatVersionDate(entry.date || entry.versionDate), formatBytes(entry.size)].filter(Boolean).join(" · "); return <React.Fragment key={`${entry.version || "version"}-${index}`}><View style={s.versionRow}><View style={[s.versionDot, entry.latest && s.versionDotLatest]} /><View style={{ flex: 1 }}><View style={s.versionTitleLine}><Text style={s.infoTitle}>{entry.version || "Unknown"}</Text>{entry.latest ? <Pill tone="green">LATEST</Pill> : null}</View><Text style={s.infoMeta}>{details || entry.repository || "Archived release"}</Text>{!source ? <Text style={s.versionUnavailable}>Archived IPA unavailable for this release</Text> : null}</View><ActionButton title={entry.latest ? "GET" : "INSTALL"} compact disabled={!source} busy={signingId === signingKey(versionApp)} onPress={() => onGet(versionApp)} /></View>{index < entries.length - 1 ? <View style={s.infoDivider} /> : null}</React.Fragment>; })}</View></ScrollView></ModalShell>;
}
function CommunitySheet({ visible, onClose, items, loading, reload, onGet, signingId }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Featured");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = q ? items.filter((app) => `${appName(app)} ${app.sharedBy || ""} ${app.description || ""}`.toLowerCase().includes(q)) : items;
    return filter === "Newest" ? [...result].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)) : result;
  }, [items, query, filter]);
  return <ModalShell visible={visible} onClose={onClose}><Page refreshing={loading} onRefresh={reload}><ModalTitleBar title="Community" onClose={onClose} /><Text style={s.modalIntro}>Discover apps shared by the iOSNova community.</Text><SearchField value={query} onChangeText={setQuery} placeholder="Search Community" /><View style={s.filterRow}>{["Featured", "Newest", "Popular"].map((item) => <Pill key={item} active={filter === item} onPress={() => setFilter(item)}>{item}</Pill>)}</View><View style={s.cardGroup}>{filtered.length ? filtered.map((app, index) => <React.Fragment key={app.id || index}><AppRow app={app} community onGet={() => onGet(app)} busy={signingId === `community-${app.id}`} />{app.description ? <Text style={s.communityDescription}>{app.description}</Text> : null}{index < filtered.length - 1 ? <View style={s.separator} /> : null}</React.Fragment>) : <Text style={s.emptyText}>No Community apps found.</Text>}</View></Page></ModalShell>;
}
function ThemeChoice({ id, label, caption, selected, onSelect }) {
  return <Pressable onPress={() => onSelect(id)} style={({ pressed }) => [s.themeRow, pressed && { opacity: 0.62 }]}><View style={{ flex: 1 }}><Text style={s.themeTitle}>{label}</Text><Text style={s.themeCaption}>{caption}</Text></View><View style={[s.themeCheck, selected && s.themeCheckSelected]}>{selected ? <Text style={s.themeCheckText}>✓</Text> : null}</View></Pressable>;
}
function AccountSheet({ visible, onClose, themeMode, onThemeModeChange, onSetup }) {
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { const session = await ensureNovaSession(); setDevice(session.device || await novaRequest("/api/v1/devices/me")); } catch {}
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    if (!visible) return undefined;
    refresh();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, [visible, refresh]);
  return <ModalShell visible={visible} onClose={onClose}><Page refreshing={loading} onRefresh={refresh}><ModalTitleBar title="Your iPhone" onClose={onClose} /><View style={s.deviceCard}><View style={s.deviceAvatar}><Image source={require("./assets/tabs/account.png")} style={s.deviceAvatarIcon} /></View><View style={{ flex: 1 }}><Text style={s.deviceTitle}>{device?.name || "iPhone"}</Text><Text style={s.deviceCaption}>{device?.osVersion ? `iOS ${device.osVersion}` : "iOSNova device"}</Text></View><Pill tone={device?.udid ? "green" : "orange"}>{device?.udid ? "READY" : "SETUP"}</Pill></View>{!device?.udid ? <ActionButton title="Set Up This iPhone" onPress={onSetup} /> : null}<SectionHeader title="Appearance" /><View style={s.infoCard}><ThemeChoice id="light" label="Light Theme" caption="Always use the light iOSNova appearance." selected={themeMode === "light"} onSelect={onThemeModeChange} /><View style={s.infoDivider} /><ThemeChoice id="dark" label="Dark Theme" caption="Always use the dark iOSNova appearance." selected={themeMode === "dark"} onSelect={onThemeModeChange} /><View style={s.infoDivider} /><ThemeChoice id="system" label="System Default" caption="Follow this iPhone’s current appearance." selected={themeMode === "system"} onSelect={onThemeModeChange} /></View><SectionHeader title="About" /><View style={s.infoCard}><View style={s.infoRow}><Text style={s.infoLabel}>App</Text><Text style={s.infoValue}>iOSNova</Text></View><View style={s.infoDivider} /><View style={s.infoRow}><Text style={s.infoLabel}>Version</Text><Text style={s.infoValue}>2.1.0</Text></View><View style={s.infoDivider} /><View style={s.infoRow}><Text style={s.infoLabel}>Device</Text><Text style={[s.infoValue, { color: device?.udid ? GREEN : ORANGE }]}>{device?.udid ? "Ready" : "Setup required"}</Text></View></View></Page></ModalShell>;
}
function DeviceSetupSheet({ visible, onClose, onCompleted }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const session = await ensureNovaSession();
      const current = session.device || await novaRequest("/api/v1/devices/me");
      if (current?.udid) { setStep(3); if (onCompleted) onCompleted(current); }
    } catch {}
  }, [onCompleted]);
  useEffect(() => {
    if (!visible) return undefined;
    refresh();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, [visible, refresh]);
  const installProfile = async () => {
    setBusy(true);
    try {
      const profile = await novaRequest("/api/v1/devices/me/profile", { method: "POST" });
      if (!profile?.url) throw new Error("iOSNova did not return a profile URL.");
      setStep(1);
      await Linking.openURL(profile.url);
      setStep(2);
    } catch (error) { Alert.alert("Could not start setup", String(error?.message || error)); }
    finally { setBusy(false); }
  };
  const titles = ["Set Up This iPhone", "Install Profile", "Return to iOSNova", "Ready!"];
  const descriptions = ["A quick one-time setup lets iOSNova prepare apps specifically for this iPhone.", "iOS will download a lightweight registration profile. Review it in Settings and tap Install.", "After installing the profile, return here. iOSNova will verify this iPhone automatically.", "This iPhone is ready to install apps from iOSNova."];
  return <ModalShell visible={visible} onClose={onClose}><View style={s.setupTop}><Pressable onPress={onClose}><Text style={s.modalDone}>Close</Text></Pressable></View><View style={s.setupPage}><View style={s.setupStepCircle}><Text style={s.setupStepNumber}>{step + 1}</Text></View><View style={[s.setupHeroIcon, step === 3 && { backgroundColor: GREEN_SOFT }]}><Text style={[s.setupHeroGlyph, step === 3 && { color: GREEN }]}>{step === 3 ? "✓" : "N"}</Text></View><Text style={s.setupTitle}>{titles[step]}</Text><Text style={s.setupDescription}>{descriptions[step]}</Text>{step < 3 ? <View style={s.setupChecklist}>{["Secure & Private", "Easy & Guided", "One-Time Setup"].map((item) => <View key={item} style={s.setupCheckRow}><View style={s.setupCheckIcon}><Text style={s.setupCheckGlyph}>✓</Text></View><Text style={s.setupCheckText}>{item}</Text></View>)}</View> : <View style={s.readyList}>{["Install apps", "Keep apps in your library", "Explore Community"].map((item) => <View key={item} style={s.readyRow}><Text style={s.readyTick}>✓</Text><Text style={s.readyText}>{item}</Text></View>)}</View>}<View style={{ flex: 1 }} />{step === 0 ? <ActionButton title="Continue" onPress={installProfile} busy={busy} /> : step < 3 ? <><ActionButton title="Open Settings" onPress={() => Linking.openURL("app-settings:")} /><ActionButton title="I Installed It" secondary onPress={refresh} busy={busy} /></> : <ActionButton title="Let’s Go" onPress={onClose} />}</View></ModalShell>;
}
function InstallProgressSheet({ request, libraryItem, visible, onClose, onInstall }) {
  const { isDesktop } = useBreakpoint();
  if (!request) return null;
  const status = String(request.status || "queued").toLowerCase();
  const failed = status === "failed";
  const ready = status === "ready";
  const steps = [
    { title: "Request Created", detail: "We’ve created a request to prepare this app.", done: true },
    { title: "Securing for your iPhone", detail: "Downloading and signing the IPA for your device.", done: ready || status === "signing", active: !ready && status !== "failed" },
    { title: "Ready to Install", detail: "The app is ready and will open the iOS installer.", done: ready, active: ready },
  ];
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={[s.progressBackdrop, isDesktop && s.desktopProgressBackdrop]}><View style={[s.progressCard, isDesktop && s.desktopProgressCard]}><View style={s.progressHeader}><Text style={s.progressTitle}>{failed ? "Couldn’t Prepare App" : ready ? "Ready to Install" : "Preparing App"}</Text><Pressable onPress={onClose} style={webPointer}><Text style={s.progressClose}>×</Text></Pressable></View>{failed ? <View style={s.progressError}><Text style={s.failedGlyph}>!</Text><Text style={s.errorSmall}>{request.error || "The signing request failed."}</Text></View> : steps.map((step, index) => <View key={step.title} style={s.progressStep}><View style={[s.progressNode, step.done && s.progressNodeDone, step.active && !step.done && s.progressNodeActive]}>{step.done ? <Text style={s.progressCheck}>✓</Text> : step.active ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}</View><View style={{ flex: 1 }}><Text style={s.infoTitle}>{step.title}</Text><Text style={s.infoMeta}>{step.detail}</Text></View>{index < steps.length - 1 ? <View style={s.progressLine} /> : null}</View>)}{ready && libraryItem ? <ActionButton title="Install" onPress={() => onInstall(libraryItem)} /> : null}{!ready && !failed ? <Text style={s.progressHint}>You can close this and continue browsing. We’ll keep preparing the app.</Text> : null}</View></View></Modal>;
}
function NativeTabBar({ selected, onSelect, themeMode }) {
  if (IOSGlassTabBar) return <View style={s.tabBarShell}><IOSGlassTabBar style={s.nativeGlassTabBar} selectedTab={selected} themeMode={themeMode} onTabSelected={(event) => { const next = event?.nativeEvent?.tabId; if (next) onSelect(next); }} /></View>;
  return <View style={s.tabBarShell}><View style={s.nativeTabBar}>{TABS.map((tab) => { const active = selected === tab.id; return <Pressable key={tab.id} onPress={() => onSelect(tab.id)} style={s.tabItem}><Image source={tab.icon} style={[s.tabIcon, { tintColor: active ? PURPLE : SECONDARY }]} /><Text numberOfLines={1} style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text></Pressable>; })}</View></View>;
}

export default function App() {
  const { isDesktop } = useBreakpoint();
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState("system");
  const [tab, setTab] = useState("home");
  const [apps, setApps] = useState([]);
  const [community, setCommunity] = useState([]);
  const [library, setLibrary] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingCommunity, setLoadingCommunity] = useState(false);
  const [error, setError] = useState("");
  const [signingId, setSigningId] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [communityVisible, setCommunityVisible] = useState(false);
  const [accountVisible, setAccountVisible] = useState(false);
  const [setupVisible, setSetupVisible] = useState(false);
  const [activeRequest, setActiveRequest] = useState(null);
  const [activeLibraryItem, setActiveLibraryItem] = useState(null);
  const [progressVisible, setProgressVisible] = useState(false);
  const pollRef = useRef(null);

  const applyThemeMode = useCallback(async (requested) => {
    const next = ["light", "dark", "system"].includes(requested) ? requested : "system";
    setThemeMode(next);
    Appearance.setColorScheme(next === "system" ? "unspecified" : next);
    try { if (storage?.setAppearance) await storage.setAppearance(next); await saved.set("iosnova.theme.mode", next); } catch {}
  }, []);
  useEffect(() => {
    let active = true;
    saved.get("iosnova.theme.mode").then((storedTheme) => { if (active) applyThemeMode(["light", "dark", "system"].includes(storedTheme) ? storedTheme : "system"); }).catch(() => applyThemeMode("system"));
    return () => { active = false; };
  }, [applyThemeMode]);
  const effectiveScheme = themeMode === "system" ? (systemScheme === "dark" ? "dark" : "light") : themeMode;

  const loadApps = useCallback(async () => {
    setLoadingApps(true); setError("");
    try { const response = await fetch(`${SEARCH_API}/apps/search?type=ipa`, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(`Catalogue returned HTTP ${response.status}`); setApps(normalizeSearchResults(await response.json())); }
    catch (loadError) { setError(String(loadError?.message || loadError)); }
    finally { setLoadingApps(false); }
  }, []);
  const loadCommunity = useCallback(async () => {
    setLoadingCommunity(true);
    try { await ensureNovaSession(); const data = await novaRequest("/api/v1/community"); setCommunity(Array.isArray(data) ? data : []); } catch {}
    finally { setLoadingCommunity(false); }
  }, []);
  const loadLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    try { await ensureNovaSession(); const [appsData, requestData] = await Promise.all([novaRequest("/api/v1/library"), novaRequest("/api/v1/sign-requests")]); setLibrary(Array.isArray(appsData) ? appsData : []); setRequests(Array.isArray(requestData) ? requestData : []); }
    catch {}
    finally { setLoadingLibrary(false); }
  }, []);

  useEffect(() => { ensureNovaSession().catch(() => {}); loadApps(); loadCommunity(); loadLibrary(); }, [loadApps, loadCommunity, loadLibrary]);
  useEffect(() => { const timer = setInterval(loadLibrary, 3500); return () => clearInterval(timer); }, [loadLibrary]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const openDetails = (app) => { setSelectedApp(app); setDetailsVisible(true); };
  const installLibraryApp = async (app) => { try { await Linking.openURL(app.installUrl); } catch (error) { Alert.alert("Install failed", String(error?.message || error)); } };
  const openCommunity = () => { setCommunityVisible(true); loadCommunity(); };
  const watchRequest = useCallback((request) => {
    if (!request?.id) return;
    if (pollRef.current) clearInterval(pollRef.current);
    setActiveRequest(request); setActiveLibraryItem(null); setProgressVisible(true);
    pollRef.current = setInterval(async () => {
      try {
        const next = await novaRequest(`/api/v1/sign-requests/${request.id}`);
        setActiveRequest(next);
        if (String(next.status).toLowerCase() === "ready") {
          const items = await novaRequest("/api/v1/library");
          const match = Array.isArray(items) ? items.find((x) => x.id === next.libraryAppId) : null;
          if (match) setActiveLibraryItem(match);
          setLibrary(Array.isArray(items) ? items : []);
          clearInterval(pollRef.current); pollRef.current = null;
        } else if (String(next.status).toLowerCase() === "failed") {
          clearInterval(pollRef.current); pollRef.current = null;
        }
      } catch {}
    }, 2000);
  }, []);
  const requestSign = async (app) => {
    const requestId = signingKey(app);
    if (signingId) return;
    const source = resolveRepoUrl(app?.download_url || app?.downloadUrl || app?.url);
    if (!source) { Alert.alert("No IPA available", "This version does not expose an IPA source URL."); return; }
    setSigningId(requestId);
    try {
      const session = await ensureNovaSession();
      if (!session?.device?.udid) { setSetupVisible(true); return; }
      const created = await novaRequest("/api/v1/sign-requests", { method: "POST", body: { appName: app?.name || appName(app), sourceIpaUrl: source, bundleIdentifier: app?.bundle_identifier || app?.bundleIdentifier || null, version: app.version || null, displayName: appName(app) } });
      watchRequest(created); loadLibrary();
    } catch (requestError) {
      if (String(requestError?.message || requestError).toLowerCase().includes("udid")) setSetupVisible(true);
      else Alert.alert("Couldn’t prepare app", String(requestError?.message || requestError));
    } finally { setSigningId(null); }
  };
  const requestCommunitySign = async (app) => {
    if (signingId) return;
    setSigningId(`community-${app.id}`);
    try {
      const session = await ensureNovaSession();
      if (!session?.device?.udid) { setSetupVisible(true); return; }
      const created = await novaRequest(`/api/v1/community/${app.id}/sign`, { method: "POST" });
      watchRequest(created); setCommunityVisible(false); loadLibrary();
    } catch (requestError) {
      if (String(requestError?.message || requestError).toLowerCase().includes("udid")) setSetupVisible(true);
      else Alert.alert("Couldn’t prepare app", String(requestError?.message || requestError));
    } finally { setSigningId(null); }
  };

  let content;
  if (tab === "home") content = <HomeScreen apps={apps} community={community} library={library} requests={requests} onGet={requestSign} signingId={signingId} onOpenApp={openDetails} onBrowse={() => setTab("apps")} onLibrary={() => setTab("library")} onCommunity={openCommunity} onProfile={() => setAccountVisible(true)} />;
  else if (tab === "apps") content = <AppsScreen apps={apps} loading={loadingApps} error={error} reload={loadApps} onGet={requestSign} signingId={signingId} onOpenApp={openDetails} onProfile={() => setAccountVisible(true)} onCommunity={openCommunity} />;
  else if (tab === "search") content = <SearchScreen apps={apps} onGet={requestSign} signingId={signingId} onOpenApp={openDetails} onCommunity={openCommunity} onProfile={() => setAccountVisible(true)} />;
  else content = <LibraryScreen library={library} requests={requests} loading={loadingLibrary} reload={loadLibrary} onBrowse={() => setTab("apps")} onProfile={() => setAccountVisible(true)} onInstall={installLibraryApp} />;

  if (isDesktop && Platform.OS === "web") {
    return (
      <View style={s.desktopLayout}>
        <StatusBar barStyle={Platform.OS === "android" ? "dark-content" : effectiveScheme === "dark" ? "light-content" : "dark-content"} backgroundColor={SAFE_BG} />
        <View style={s.desktopSidebar}>
          <View>
            <View style={s.desktopBrand}>
              <Text style={s.desktopBrandText}>iOSNova</Text>
              <Text style={s.desktopBrandBadge}>WEB</Text>
            </View>
            <View style={s.desktopNavGroup}>
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => setTab(t.id)}
                    style={({ pressed, hovered }) => [
                      s.desktopNavItem,
                      active && s.desktopNavItemActive,
                      (pressed || hovered) && !active && s.desktopNavItemHover,
                    ]}
                  >
                    <Image source={t.icon} style={[s.desktopNavIcon, { tintColor: active ? PURPLE : SECONDARY }]} />
                    <Text style={[s.desktopNavLabel, active && s.desktopNavLabelActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={s.desktopSidebarFooter}>
            <Pressable onPress={openCommunity} style={({ pressed, hovered }) => [s.desktopCommunityBtn, (pressed || hovered) && { opacity: 0.85 }]}>
              <Text style={s.desktopCommunityIcon}>✦</Text>
              <Text style={s.desktopCommunityText}>Community</Text>
            </Pressable>
            <Pressable onPress={() => setAccountVisible(true)} style={({ pressed, hovered }) => [s.desktopAccountBtn, (pressed || hovered) && { opacity: 0.85 }]}>
              <View style={s.profileButton}>
                <Image source={require("./assets/tabs/account.png")} style={s.profileIcon} />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={s.desktopAccountName}>My iPhone</Text>
                <Text style={s.desktopAccountSub}>Account Settings</Text>
              </View>
            </Pressable>
          </View>
        </View>
        <View style={s.desktopMain}>
          <ScrollView style={s.desktopScroll} contentContainerStyle={s.desktopScrollContent} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        </View>
        <AppDetailsSheet app={selectedApp} visible={detailsVisible} onClose={() => setDetailsVisible(false)} onGet={requestSign} signingId={signingId} />
        <CommunitySheet visible={communityVisible} onClose={() => setCommunityVisible(false)} items={community} loading={loadingCommunity} reload={loadCommunity} onGet={requestCommunitySign} signingId={signingId} />
        <AccountSheet visible={accountVisible} onClose={() => setAccountVisible(false)} themeMode={themeMode} onThemeModeChange={applyThemeMode} onSetup={() => { setAccountVisible(false); setSetupVisible(true); }} />
        <DeviceSetupSheet visible={setupVisible} onClose={() => { setSetupVisible(false); loadLibrary(); }} onCompleted={loadLibrary} />
        <InstallProgressSheet request={activeRequest} libraryItem={activeLibraryItem} visible={progressVisible} onClose={() => setProgressVisible(false)} onInstall={installLibraryApp} />
      </View>
    );
  }

  return <SafeAreaView style={s.safe}><StatusBar barStyle={Platform.OS === "android" ? "dark-content" : effectiveScheme === "dark" ? "light-content" : "dark-content"} backgroundColor={SAFE_BG} /><View style={s.content}>{content}</View><NativeTabBar selected={tab} themeMode={themeMode} onSelect={setTab} /><AppDetailsSheet app={selectedApp} visible={detailsVisible} onClose={() => setDetailsVisible(false)} onGet={requestSign} signingId={signingId} /><CommunitySheet visible={communityVisible} onClose={() => setCommunityVisible(false)} items={community} loading={loadingCommunity} reload={loadCommunity} onGet={requestCommunitySign} signingId={signingId} /><AccountSheet visible={accountVisible} onClose={() => setAccountVisible(false)} themeMode={themeMode} onThemeModeChange={applyThemeMode} onSetup={() => { setAccountVisible(false); setSetupVisible(true); }} /><DeviceSetupSheet visible={setupVisible} onClose={() => { setSetupVisible(false); loadLibrary(); }} onCompleted={loadLibrary} /><InstallProgressSheet request={activeRequest} libraryItem={activeLibraryItem} visible={progressVisible} onClose={() => setProgressVisible(false)} onInstall={installLibraryApp} /></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: SAFE_BG },
  content: { flex: 1, backgroundColor: BG, paddingBottom: 92 },
  page: { paddingHorizontal: 17, paddingTop: 8, paddingBottom: 42 },
  topHeader: { minHeight: 66, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  headerTitle: { color: INK, fontSize: 34, lineHeight: 40, fontWeight: "850", letterSpacing: -0.9 },
  homeHeadline: { color: INK, fontSize: 22, lineHeight: 28, fontWeight: "750", letterSpacing: -0.35, marginBottom: 14 },
  profileButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center" },
  profileIcon: { width: 20, height: 20, resizeMode: "contain", tintColor: PURPLE },
  sectionHeader: { minHeight: 46, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingBottom: 9 },
  sectionTitle: { color: INK, fontSize: 19, lineHeight: 24, fontWeight: "750", letterSpacing: -0.3 },
  sectionAction: { color: PURPLE, fontSize: 13, fontWeight: "700", padding: 4 },
  searchField: { minHeight: 48, borderRadius: 16, backgroundColor: FIELD_BG, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 2 },
  searchGlyph: { color: MUTED, fontSize: 23, marginRight: 8 },
  searchInput: { flex: 1, color: INK, fontSize: 16, paddingVertical: 0 },
  searchClear: { color: SECONDARY, fontSize: 22, paddingLeft: 10 },
  pill: { minHeight: 32, paddingHorizontal: 14, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 12, fontWeight: "750" },
  filterRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingRight: 16, gap: 8 },
  actionButton: { height: 48, borderRadius: 15, backgroundColor: PURPLE, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 },
  actionButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  actionSecondary: { backgroundColor: PURPLE_SOFT },
  actionCompact: { minWidth: 68, height: 32, borderRadius: 16, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center", paddingHorizontal: 13 },
  actionCompactText: { color: PURPLE, fontSize: 12, fontWeight: "850" },
  cardGroup: { backgroundColor: CARD, borderRadius: 22, paddingHorizontal: 14, overflow: "hidden" },
  appRow: { minHeight: 82, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  appRowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", paddingRight: 10 },
  appRowText: { flex: 1, minWidth: 0, marginLeft: 12 },
  appRowTitle: { color: INK, fontSize: 15, lineHeight: 19, fontWeight: "750" },
  appRowDeveloper: { color: MUTED, fontSize: 12, lineHeight: 16, marginTop: 3 },
  appRowMeta: { color: SECONDARY, fontSize: 11, lineHeight: 15, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: LINE, marginLeft: 70 },
  fallbackIcon: { backgroundColor: PURPLE, alignItems: "center", justifyContent: "center" },
  fallbackLetter: { color: "#FFFFFF", fontWeight: "850" },
  communityBanner: { minHeight: 112, borderRadius: 24, backgroundColor: PURPLE, flexDirection: "row", alignItems: "center", padding: 18, marginBottom: 16, overflow: "hidden" },
  communityBubble: { width: 54, height: 54, borderRadius: 27, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginRight: 14 },
  communityBubbleGlyph: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  communityBannerTitle: { color: "#FFFFFF", fontSize: 21, lineHeight: 25, fontWeight: "850" },
  communityBannerBody: { color: "rgba(255,255,255,0.86)", fontSize: 13, lineHeight: 18, marginTop: 4, paddingRight: 8 },
  communityArrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  communityArrowText: { color: "#FFFFFF", fontSize: 28, lineHeight: 30, fontWeight: "400" },
  communityStrip: { minHeight: 64, borderRadius: 18, backgroundColor: PURPLE_SOFT, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  communityStripTitle: { color: INK, fontSize: 15, fontWeight: "800" },
  communityStripText: { color: MUTED, fontSize: 11.5, marginTop: 3 },
  communityStripAction: { color: PURPLE, fontSize: 13, fontWeight: "800" },
  heroCard: { minHeight: 190, borderRadius: 26, backgroundColor: "#171126", overflow: "hidden", padding: 18, marginBottom: 14 },
  heroGlowOne: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "rgba(109,40,245,0.65)", right: -65, top: -55 },
  heroGlowTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(56,189,248,0.18)", left: -35, bottom: -70 },
  heroKicker: { color: "#C6B4FF", fontSize: 10, fontWeight: "850", letterSpacing: 1.1 },
  heroContent: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  heroTitle: { color: "#FFFFFF", fontSize: 27, lineHeight: 31, fontWeight: "850", letterSpacing: -0.55 },
  heroBody: { color: "#D7D1E5", fontSize: 13, lineHeight: 18, marginTop: 7 },
  librarySummary: { minHeight: 74, borderRadius: 20, backgroundColor: CARD, flexDirection: "row", alignItems: "center", paddingHorizontal: 14 },
  librarySummaryIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: GREEN_SOFT, alignItems: "center", justifyContent: "center", marginRight: 10 },
  librarySummaryTick: { color: GREEN, fontSize: 15, fontWeight: "900" },
  librarySummaryTitle: { color: INK, fontSize: 14, fontWeight: "750" },
  librarySummaryCaption: { color: GREEN, fontSize: 10.5, marginTop: 3 },
  summaryStat: { alignItems: "center", minWidth: 42 },
  summaryStatValue: { color: INK, fontSize: 15, fontWeight: "850" },
  summaryStatLabel: { color: MUTED, fontSize: 9, marginTop: 1 },
  disclosure: { color: SECONDARY, fontSize: 24, marginLeft: 4 },
  horizontalCards: { paddingRight: 16, gap: 10 },
  compactCard: { width: 128, minHeight: 174, borderRadius: 20, backgroundColor: CARD, padding: 12 },
  compactMain: { flex: 1 },
  compactTitle: { color: INK, fontSize: 13, fontWeight: "750", marginTop: 8 },
  compactMeta: { color: MUTED, fontSize: 10.5, marginTop: 2, marginBottom: 9 },
  trendingWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10 },
  categoryCard: { width: "48.7%", minHeight: 88, borderRadius: 18, backgroundColor: CARD, padding: 14, justifyContent: "center" },
  categoryCardPurple: { backgroundColor: PURPLE_SOFT },
  categoryGlyph: { color: PURPLE, fontSize: 22, fontWeight: "800" },
  categoryTitle: { color: INK, fontSize: 14, fontWeight: "800", marginTop: 6 },
  categoryHint: { color: MUTED, fontSize: 10, marginTop: 2 },
  requestRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  statusRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: "center", justifyContent: "center", marginRight: 12 },
  requestStatus: { fontSize: 10, fontWeight: "850", marginTop: 4 },
  libraryRow: { minHeight: 78, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  libraryIcon: { width: 50, height: 50, borderRadius: 13, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center", marginRight: 12 },
  libraryIconGlyph: { color: PURPLE, fontSize: 20, fontWeight: "900" },
  emptyState: { alignItems: "center", paddingVertical: 24 },
  emptyGlyph: { color: PURPLE, fontSize: 30, fontWeight: "700" },
  emptyTitle: { color: INK, fontSize: 17, fontWeight: "800", marginTop: 8 },
  emptyText: { color: MUTED, fontSize: 13, lineHeight: 18, textAlign: "center", paddingVertical: 10 },
  failedRow: { minHeight: 66, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  failedGlyph: { width: 30, color: RED, fontSize: 22, fontWeight: "900" },
  errorText: { color: RED, fontSize: 12, lineHeight: 17, marginVertical: 8 },
  errorSmall: { color: RED, fontSize: 11, lineHeight: 15 },
  modalSafe: { flex: 1, backgroundColor: BG },
  modalTitleBar: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: INK, fontSize: 32, lineHeight: 38, fontWeight: "850", letterSpacing: -0.8 },
  modalDone: { color: PURPLE, fontSize: 16, fontWeight: "750", paddingVertical: 10 },
  modalIntro: { color: MUTED, fontSize: 14, lineHeight: 20, marginTop: -3, marginBottom: 16 },
  modalToolbar: { minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 18 },
  backText: { color: PURPLE, fontSize: 16, fontWeight: "650" },
  toolbarDots: { color: MUTED, fontSize: 16, letterSpacing: 2 },
  detailPage: { paddingHorizontal: 18, paddingBottom: 42 },
  detailHero: { flexDirection: "row", alignItems: "center", paddingTop: 8, paddingBottom: 18 },
  detailIdentity: { flex: 1, marginLeft: 14 },
  detailTitle: { color: INK, fontSize: 23, lineHeight: 27, fontWeight: "850", letterSpacing: -0.4 },
  detailSubtitle: { color: MUTED, fontSize: 13, lineHeight: 18, marginTop: 4 },
  detailStats: { minHeight: 62, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: LINE, flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginBottom: 14 },
  statValue: { color: INK, fontSize: 13, fontWeight: "800", textAlign: "center" },
  statLabel: { color: MUTED, fontSize: 9.5, marginTop: 3, textAlign: "center" },
  infoCard: { backgroundColor: CARD, borderRadius: 20, paddingHorizontal: 14, overflow: "hidden" },
  whatsNewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 14 },
  infoTitle: { color: INK, fontSize: 14, lineHeight: 18, fontWeight: "750" },
  infoMeta: { color: MUTED, fontSize: 11, lineHeight: 16, marginTop: 3 },
  infoBody: { color: MUTED, fontSize: 13, lineHeight: 19, paddingVertical: 14 },
  aboutText: { color: MUTED, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  infoRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoLabel: { color: MUTED, fontSize: 12, fontWeight: "650", width: 90 },
  infoValue: { color: INK, flex: 1, textAlign: "right", fontSize: 12.5, lineHeight: 17, fontWeight: "650" },
  infoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: LINE },
  versionIntro: { color: MUTED, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  versionRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  versionDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: SECONDARY, marginRight: 12 },
  versionDotLatest: { backgroundColor: GREEN, borderColor: GREEN },
  versionTitleLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  versionUnavailable: { color: ORANGE, fontSize: 10.5, marginTop: 4 },
  communityDescription: { color: MUTED, fontSize: 12, lineHeight: 17, marginLeft: 70, marginTop: -5, marginBottom: 10 },
  deviceCard: { minHeight: 106, borderRadius: 22, backgroundColor: CARD, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, marginBottom: 12 },
  deviceAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center", marginRight: 12 },
  deviceAvatarIcon: { width: 27, height: 27, tintColor: PURPLE, resizeMode: "contain" },
  deviceTitle: { color: INK, fontSize: 18, fontWeight: "750" },
  deviceCaption: { color: MUTED, fontSize: 12.5, marginTop: 4 },
  themeRow: { minHeight: 78, flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  themeTitle: { color: INK, fontSize: 14, fontWeight: "800" },
  themeCaption: { color: MUTED, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  themeCheck: { width: 25, height: 25, borderRadius: 13, borderWidth: 1.5, borderColor: LINE, alignItems: "center", justifyContent: "center", marginLeft: 12 },
  themeCheckSelected: { backgroundColor: PURPLE, borderColor: PURPLE },
  themeCheckText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  setupTop: { minHeight: 52, alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 18 },
  setupPage: { flex: 1, paddingHorizontal: 24, paddingBottom: 28, alignItems: "center" },
  setupStepCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center", marginTop: 8 },
  setupStepNumber: { color: PURPLE, fontSize: 14, fontWeight: "850" },
  setupHeroIcon: { width: 102, height: 102, borderRadius: 51, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center", marginTop: 26 },
  setupHeroGlyph: { color: PURPLE, fontSize: 42, fontWeight: "900" },
  setupTitle: { color: INK, fontSize: 26, lineHeight: 31, fontWeight: "850", letterSpacing: -0.5, marginTop: 20, textAlign: "center" },
  setupDescription: { color: MUTED, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 8, maxWidth: 340 },
  setupChecklist: { alignSelf: "stretch", backgroundColor: CARD, borderRadius: 20, padding: 14, marginTop: 24 },
  setupCheckRow: { minHeight: 50, flexDirection: "row", alignItems: "center" },
  setupCheckIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: PURPLE_SOFT, alignItems: "center", justifyContent: "center", marginRight: 12 },
  setupCheckGlyph: { color: PURPLE, fontSize: 13, fontWeight: "900" },
  setupCheckText: { color: INK, fontSize: 14, fontWeight: "700" },
  readyList: { alignSelf: "stretch", marginTop: 24 },
  readyRow: { minHeight: 40, flexDirection: "row", alignItems: "center" },
  readyTick: { color: GREEN, width: 30, fontSize: 17, fontWeight: "900" },
  readyText: { color: INK, fontSize: 14, fontWeight: "650" },
  progressBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "flex-end", padding: 14 },
  progressCard: { backgroundColor: CARD, borderRadius: 28, padding: 20, paddingBottom: 24 },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  progressTitle: { color: INK, fontSize: 20, fontWeight: "850" },
  progressClose: { color: MUTED, fontSize: 28, paddingLeft: 12 },
  progressStep: { minHeight: 72, flexDirection: "row", alignItems: "flex-start", position: "relative" },
  progressNode: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: LINE, alignItems: "center", justifyContent: "center", marginRight: 12, zIndex: 2, backgroundColor: CARD },
  progressNodeDone: { backgroundColor: GREEN, borderColor: GREEN },
  progressNodeActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  progressCheck: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  progressLine: { position: "absolute", left: 14, top: 29, width: 2, height: 45, backgroundColor: LINE },
  progressHint: { color: MUTED, fontSize: 10.5, lineHeight: 15, textAlign: "center", marginTop: 4 },
  progressError: { flexDirection: "row", alignItems: "center", backgroundColor: RED_SOFT, borderRadius: 14, padding: 12 },
  tabBarShell: { position: "absolute", left: 16, right: 16, bottom: 18, height: 60 },
  nativeGlassTabBar: { width: "100%", height: 60 },
  nativeTabBar: { height: 60, flexDirection: "row", alignItems: "center", backgroundColor: GLASS_FALLBACK, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth, borderColor: LINE, paddingHorizontal: 5 },
  tabItem: { flex: 1, height: 52, alignItems: "center", justifyContent: "center" },
  tabIcon: { width: 19, height: 19, resizeMode: "contain" },
  tabLabel: { color: SECONDARY, fontSize: 9, fontWeight: "650", marginTop: 2 },
  tabLabelActive: { color: PURPLE, fontWeight: "800" },
  desktopLayout: { flex: 1, flexDirection: "row", backgroundColor: BG, height: "100vh" },
  desktopSidebar: { width: 250, borderRightWidth: StyleSheet.hairlineWidth, borderColor: LINE, backgroundColor: CARD, padding: 20, justifyContent: "space-between" },
  desktopBrand: { flexDirection: "row", alignItems: "center", marginBottom: 28 },
  desktopBrandText: { color: INK, fontSize: 24, fontWeight: "850", letterSpacing: -0.5 },
  desktopBrandBadge: { backgroundColor: PURPLE_SOFT, color: PURPLE, fontSize: 10, fontWeight: "850", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8, overflow: "hidden" },
  desktopNavGroup: { gap: 6 },
  desktopNavItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, ...webPointer },
  desktopNavItemActive: { backgroundColor: PURPLE_SOFT },
  desktopNavItemHover: { backgroundColor: FIELD_BG },
  desktopNavIcon: { width: 20, height: 20, resizeMode: "contain" },
  desktopNavLabel: { color: SECONDARY, fontSize: 15, fontWeight: "650", marginLeft: 12 },
  desktopNavLabelActive: { color: PURPLE, fontWeight: "800" },
  desktopSidebarFooter: { gap: 10, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderColor: LINE },
  desktopCommunityBtn: { flexDirection: "row", alignItems: "center", backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, ...webPointer },
  desktopCommunityIcon: { color: "#FFFFFF", fontSize: 16, marginRight: 8 },
  desktopCommunityText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  desktopAccountBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 6, borderRadius: 14, ...webPointer },
  desktopAccountName: { color: INK, fontSize: 13, fontWeight: "750" },
  desktopAccountSub: { color: MUTED, fontSize: 10.5 },
  desktopMain: { flex: 1, backgroundColor: BG },
  desktopScroll: { flex: 1 },
  desktopScrollContent: { paddingVertical: 24, minHeight: "100%" },
  desktopModalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: "center", alignItems: "center" },
  desktopModalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
  desktopModalCard: { width: "90%", maxWidth: 640, maxHeight: "88%", backgroundColor: BG, borderRadius: 24, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 },
  desktopProgressBackdrop: { justifyContent: "center", alignItems: "center" },
  desktopProgressCard: { width: 440, maxWidth: "90%" },
});
