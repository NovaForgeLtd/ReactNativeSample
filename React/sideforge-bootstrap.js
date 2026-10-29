import { Alert, Linking, NativeModules, Platform } from "react-native";

const IOSNOVA_API = "https://iosnovaapi.dansmatrix.org";
const storage = NativeModules.SideForgeStorage;
const handled = new Set();
const baseFetch = globalThis.fetch.bind(globalThis);

function withNoStoreHeaders(headers = {}) {
  return {
    ...headers,
    "Cache-Control": "no-cache, no-store, max-age=0",
    Pragma: "no-cache",
  };
}

function cacheBust(url) {
  const value = String(url || "");
  const separator = value.includes("?") ? "&" : "?";
  return `${value}${separator}_iosnova_poll=${Date.now()}`;
}

function isSignRequestStatusUrl(url, method) {
  if (String(method || "GET").toUpperCase() !== "GET") return false;
  const value = String(url || "");
  return new RegExp(`^${IOSNOVA_API.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/api/v1/sign-requests/[0-9a-f-]{36}(?:\\?|$)`, "i").test(value);
}

function syntheticJsonResponse(original, payload) {
  const text = JSON.stringify(payload);
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    url: original?.url || "",
    headers: original?.headers,
    text: async () => text,
    json: async () => payload,
    clone: () => syntheticJsonResponse(original, payload),
  };
}

// React Native's status sheet polls one sign request while the Library refreshes
// independently. A stale intermediary/cache response must never leave the sheet
// on "Securing" after the signed app has already been persisted to Library.
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url;
  if (!isSignRequestStatusUrl(url, init?.method)) return baseFetch(input, init);

  const pollInit = {
    ...init,
    headers: withNoStoreHeaders(init?.headers || {}),
  };
  const response = await baseFetch(cacheBust(url), pollInit);
  if (!response?.ok) return response;

  let request;
  try {
    request = await response.clone().json();
  } catch {
    return response;
  }

  const status = String(request?.status || "").toLowerCase();
  if (status === "ready" || status === "failed" || !request?.libraryAppId) return response;

  try {
    const libraryResponse = await baseFetch(cacheBust(`${IOSNOVA_API}/api/v1/library`), {
      method: "GET",
      headers: withNoStoreHeaders(init?.headers || {}),
    });
    if (!libraryResponse.ok) return response;
    const library = await libraryResponse.json();
    const targetId = String(request.libraryAppId).toLowerCase();
    const readyItem = Array.isArray(library)
      ? library.find((item) => String(item?.id || "").toLowerCase() === targetId)
      : null;
    if (!readyItem) return response;

    return syntheticJsonResponse(response, {
      ...request,
      status: "ready",
      updatedAt: readyItem.updatedAt || request.updatedAt,
    });
  } catch {
    return response;
  }
};

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function queryValue(url, name) {
  const query = String(url || "").split("?")[1] || "";
  for (const part of query.split("&")) {
    const [rawKey, ...rest] = part.split("=");
    if (decodeURIComponent(rawKey || "") === name) {
      return decodeURIComponent(rest.join("=") || "");
    }
  }
  return "";
}

function parseWebLogin(url) {
  const value = String(url || "");
  if (!/^iosnova:\/\/web-login(?:\?|\/)/i.test(value)) return null;
  const id = queryValue(value, "id").trim();
  const code = queryValue(value, "code").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{64}$/i.test(code)) return null;
  return { id, code };
}

function parseBootstrap(url) {
  const value = String(url || "");
  if (!/^iosnova:\/\/bootstrap(?:\?|\/)/i.test(value)) return null;
  const claim = queryValue(value, "claim").trim();
  if (!/^[0-9a-f]{64}$/i.test(claim)) return null;
  const id = queryValue(value, "loginId").trim();
  const code = queryValue(value, "code").trim();
  const hasLogin = /^[0-9a-f-]{36}$/i.test(id) && /^[0-9a-f]{64}$/i.test(code);
  return { claim, login: hasLogin ? { id, code } : null };
}

async function getDeviceCredentials() {
  if (!storage?.getDeviceCredentials) throw new Error("Secure device credentials are unavailable.");
  const credentials = await storage.getDeviceCredentials();
  if (!credentials?.deviceId || !credentials?.secret) {
    throw new Error("Secure device credentials are incomplete.");
  }
  return {
    deviceId: String(credentials.deviceId),
    secret: String(credentials.secret),
  };
}

async function getStoredToken() {
  if (!storage?.getItem) return null;
  const token = await storage.getItem("iosnova.auth.token");
  return token ? String(token) : null;
}

async function saveToken(token) {
  if (storage?.setItem) await storage.setItem("iosnova.auth.token", String(token));
}

async function authenticateDevice() {
  const credentials = await getDeviceCredentials();
  const response = await fetch(`${IOSNOVA_API}/api/v1/auth/device`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: credentials.deviceId,
      deviceSecret: credentials.secret,
      name: Platform.OS === "ios" ? "iPhone" : "Device",
      platform: Platform.OS,
      osVersion: String(Platform.Version || ""),
    }),
  });
  const data = await readJson(response);
  if (!response.ok || !data?.accessToken) {
    throw new Error(data?.error || `iOSNova authentication returned HTTP ${response.status}`);
  }
  await saveToken(data.accessToken);
  return data.accessToken;
}

async function withNativeToken(action) {
  let token = await getStoredToken();
  if (!token) token = await authenticateDevice();
  let response = await action(token);
  if (response.status === 401) {
    token = await authenticateDevice();
    response = await action(token);
  }
  return response;
}

async function approveWebLogin(login) {
  const response = await withNativeToken((token) => fetch(`${IOSNOVA_API}/api/v1/web-auth/${login.id}/approve`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code: login.code }),
  }));

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || `Web sign-in approval returned HTTP ${response.status}`);
  }
}

async function redeemBootstrap(bootstrap) {
  const response = await withNativeToken((token) => fetch(`${IOSNOVA_API}/api/v1/web-bootstrap/redeem`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ claim: bootstrap.claim }),
  }));

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || `iOSNova setup returned HTTP ${response.status}`);
  }
  if (storage?.setItem) await storage.setItem("iosnova.bootstrap.completed", "1");
  return data;
}

function handleWebLogin(login) {
  const key = `login:${login.id}:${login.code}`;
  if (handled.has(key)) return;
  handled.add(key);

  Alert.alert(
    "Approve web sign-in?",
    "A browser is asking to access your iOSNova account, Library and signing requests using this iPhone.",
    [
      {
        text: "Cancel",
        style: "cancel",
        onPress: () => handled.delete(key),
      },
      {
        text: "Approve",
        onPress: async () => {
          try {
            await approveWebLogin(login);
            Alert.alert("Web sign-in approved", "The browser is now signed in to your iOSNova account.");
          } catch (error) {
            handled.delete(key);
            Alert.alert("Could not approve sign-in", String(error?.message || error));
          }
        },
      },
    ],
  );
}

async function handleBootstrap(bootstrap) {
  const key = `bootstrap:${bootstrap.claim}`;
  if (handled.has(key)) return;
  handled.add(key);
  try {
    await redeemBootstrap(bootstrap);
    let desktopApproved = false;
    if (bootstrap.login) {
      try {
        await approveWebLogin(bootstrap.login);
        desktopApproved = true;
      } catch {}
    }
    Alert.alert(
      "iOSNova is ready",
      desktopApproved
        ? "This app is connected to your iPhone and account. The browser you started from has also been approved automatically."
        : bootstrap.login
          ? "This app is connected to your iPhone and account. The original browser sign-in expired, so refresh its QR code if you still want to sign in there."
          : "This app is now connected to the iPhone and account you set up in Safari.",
    );
  } catch (error) {
    handled.delete(key);
    Alert.alert("Could not finish setup", String(error?.message || error));
  }
}

function handleUrl(url) {
  const bootstrap = parseBootstrap(url);
  if (bootstrap) {
    handleBootstrap(bootstrap);
    return;
  }
  const login = parseWebLogin(url);
  if (login) handleWebLogin(login);
}

Linking.addEventListener("url", (event) => handleUrl(event?.url));
Linking.getInitialURL()
  .then((url) => {
    if (url) setTimeout(() => handleUrl(url), 500);
  })
  .catch(() => {});
