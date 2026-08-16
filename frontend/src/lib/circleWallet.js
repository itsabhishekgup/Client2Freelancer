// Circle User-Controlled Wallets — frontend client.
//
// The backend owns the Circle API key and creates challenges; this module
// (a) tells the UI whether Circle is configured, (b) starts email-OTP login,
// (c) creates a wallet, and (d) executes challenges with the Web SDK so the
// user approves escrow actions on-device. Every function degrades gracefully
// when Circle is not configured (backend returns a friendly error).
// The Circle Web SDK is loaded lazily: its module currently throws in some
// browser bundles at import time, and a crash in wallet plumbing must never
// take down the whole app (the regular Reown flow keeps working).
let _W3SSdkPromise = null;
function loadW3S() {
  if (!_W3SSdkPromise) {
    _W3SSdkPromise = import("@circle-fin/w3s-pw-web-sdk").then(
      (mod) => mod.W3SSdk,
      () => null,
    );
  }
  return _W3SSdkPromise;
}

const requestJSON = async (path, options = {}) => {
  const res = await fetch(`http://127.0.0.1:8000${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`Circle API ${res.status}`);
  return res.json();
};

export async function fetchCircleConfig() {
  try {
    return await requestJSON("/api/circle/config");
  } catch {
    return { configured: false, app_id: "", error: "backend unreachable" };
  }
}

export async function circleEmailLogin(email) {
  return requestJSON("/api/circle/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function circlePinLogin(userId) {
  return requestJSON("/api/circle/pin-login", {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function circleCreateWallet(userToken) {
  return requestJSON("/api/circle/wallet", {
    method: "POST",
    body: JSON.stringify({ user_token: userToken }),
  });
}

export async function circleListWallets(userToken) {
  return requestJSON("/api/circle/wallets", {
    method: "POST",
    body: JSON.stringify({ user_token: userToken }),
  });
}

export async function circleContractAction({ userToken, walletId, action, args }) {
  return requestJSON("/api/circle/contract", {
    method: "POST",
    body: JSON.stringify({
      user_token: userToken,
      wallet_id: walletId,
      action,
      args: args ?? [],
    }),
  });
}

// --- session persistence ------------------------------------------------------
// The Circle userToken is a JWT that expires (~60 min). We persist the session
// in localStorage so a page reload doesn't force a re-login, and transparently
// clear it (and re-login) once the token expires.

const SESSION_KEY = "arcbridge_circle_session";

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(escape(atob(b64))));
  } catch {
    return null;
  }
}

/**
 * Decode the Circle userToken's `exp` claim (seconds since epoch).
 * Returns null when the token isn't a JWT or has no exp.
 */
export function circleTokenExpiry(userToken) {
  const payload = decodeJwtPayload(userToken);
  const exp = payload && payload.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/**
 * Save the Circle session (userToken, encryptionKey, walletId, address, appId).
 * Returns true when saved, false when there's nothing to save.
 */
export function saveCircleSession(circle) {
  if (!circle || !circle.userToken) return false;
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...circle,
        savedAt: Date.now(),
        expiresAt: circleTokenExpiry(circle.userToken),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a previously saved Circle session. Returns the session object when
 * valid and unexpired, `{ expired: true }` when the token has expired (so the
 * UI can show a friendly "session expired, log in again" message and clear
 * storage), and null when nothing is saved.
 */
export function loadCircleSession() {
  let raw;
  try {
    raw = localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    clearCircleSession();
    return null;
  }
  if (!session.userToken) {
    clearCircleSession();
    return null;
  }
  const expiry = circleTokenExpiry(session.userToken);
  if (expiry && Date.now() >= expiry) {
    clearCircleSession();
    return { expired: true };
  }
  return session;
}

export function clearCircleSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Execute a Circle challenge on-device. Resolves with the challenge result
 * (signature etc.) or rejects with a readable message.
 */
export async function executeCircleChallenge(appId, userToken, encryptionKey, challengeId) {
  const W3SSdk = await loadW3S();
  if (!W3SSdk) {
    throw new Error("Circle Web SDK failed to load — use a regular wallet instead.");
  }
  return new Promise((resolve, reject) => {
    try {
      const sdk = new W3SSdk({ appSettings: { appId } });
      sdk.setAuthentication({ userToken, encryptionKey });
      sdk.execute(challengeId, (error, result) => {
        if (error) {
          reject(new Error(error.message || `Challenge failed (${error.code ?? "unknown"})`));
          return;
        }
        resolve(result);
      });
    } catch (err) {
      reject(err);
    }
  });
}
