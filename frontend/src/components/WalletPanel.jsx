import { useEffect, useState } from "react";
import {
  circleCreateWallet,
  circleEmailLogin,
  circleListWallets,
  circlePinLogin,
  clearCircleSession,
  executeCircleChallenge,
  fetchCircleConfig,
  loadCircleSession,
  saveCircleSession,
} from "../lib/circleWallet";
import { toast } from "../lib/toast";
import { useWalletBridge } from "../hooks/useWalletBridge";

const shorten = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "--");

function WalletPanel({ wallet, onCircleChange }) {
  const { isConnected, disconnect: reownDisconnect } = useWalletBridge();
  const [disconnecting, setDisconnecting] = useState(false);
  const [circleConfig, setCircleConfig] = useState(null);
  const [authMode, setAuthMode] = useState("email"); // "email" | "pin"
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [circle, setCircle] = useState(null); // { address, walletId, userToken, encryptionKey }

  // Restore a previously saved Circle session on mount (reload doesn't force
  // a re-login). Expired sessions are cleared and surfaced with a hint.
  useEffect(() => {
    const saved = loadCircleSession();
    if (saved?.expired) {
      clearCircleSession();
      toast("Circle session expired — please log in again", "warning", { duration: 5000 });
    } else if (saved?.userToken) {
      setCircle(saved);
      onCircleChange?.(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    fetchCircleConfig().then((cfg) => {
      if (!cancelled) setCircleConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateCircle = (next) => {
    setCircle(next);
    if (next) saveCircleSession(next);
    else clearCircleSession();
    onCircleChange?.(next);
  };

  /**
   * Shared post-login flow: find/create an Arc Testnet wallet and surface it.
   * `login` must contain { userToken, encryptionKey } (+ optional challengeId
   * for the email-OTP path — PIN login returns the token directly).
   */
  const connectWallet = async (login) => {
    if (login.challengeId) {
      await executeCircleChallenge(
        circleConfig.app_id,
        login.userToken,
        login.encryptionKey,
        login.challengeId,
      );
    }

    // Find an existing wallet or create one on Arc Testnet.
    const existing = await circleListWallets(login.userToken);
    let walletId = existing?.wallets?.[0]?.walletId;
    let address = existing?.wallets?.[0]?.address;

    if (!walletId) {
      const created = await circleCreateWallet(login.userToken);
      if (!created.ok) {
        toast(created.error || "Wallet creation failed", "warning", { duration: 6000 });
        return;
      }
      await executeCircleChallenge(
        circleConfig.app_id,
        login.userToken,
        login.encryptionKey,
        created.challengeId,
      );
      // Re-list after the create challenge completes to get the address.
      const after = await circleListWallets(login.userToken);
      walletId = after?.wallets?.[0]?.walletId;
      address = after?.wallets?.[0]?.address;
    }

    updateCircle({
      address,
      walletId,
      userToken: login.userToken,
      encryptionKey: login.encryptionKey,
      appId: circleConfig.app_id,
    });
    setEmail("");
    setUserId("");
    toast("Circle Wallet connected", "success", { duration: 5000 });
  };

  const handleEmailConnect = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const login = await circleEmailLogin(email.trim());
      if (!login.ok) {
        toast(login.error || "Circle login failed", "warning", { duration: 6000 });
        return;
      }
      if (!circleConfig?.app_id) {
        toast("Circle App ID missing — add CIRCLE_APP_ID to backend/.env", "warning", {
          duration: 6000,
        });
        return;
      }
      await connectWallet(login);
    } catch (err) {
      toast(err?.message || "Circle connection failed", "error", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const handlePinConnect = async (e) => {
    e.preventDefault();
    if (!userId.trim()) return;
    setBusy(true);
    try {
      const login = await circlePinLogin(userId.trim());
      if (!login.ok) {
        toast(login.error || "Circle PIN login failed", "warning", { duration: 6000 });
        return;
      }
      if (!circleConfig?.app_id) {
        toast("Circle App ID missing — add CIRCLE_APP_ID to backend/.env", "warning", {
          duration: 6000,
        });
        return;
      }
      // PIN login returns userToken directly (no OTP email, no SMTP needed).
      await connectWallet(login);
    } catch (err) {
      toast(err?.message || "Circle connection failed", "error", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Unified disconnect — cleans up BOTH the Reown wallet and the Circle
   * wallet, so after one click nothing stays connected or persisted.
   */
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      // 1) Reown / injected wallet
      if (isConnected && reownDisconnect) {
        try {
          await reownDisconnect();
        } catch {
          /* AppKit may already be disconnected — ignore */
        }
      }
      // 2) Circle wallet + persisted session
      updateCircle(null);
      clearCircleSession();
      toast("All wallets disconnected", "warning", { duration: 4000 });
    } finally {
      setDisconnecting(false);
    }
  };

  const authLabel =
    authMode === "email"
      ? { title: "Connect with Circle", sub: "Email login — no wallet extension needed" }
      : { title: "Connect with Circle", sub: "PIN login — no email/SMTP needed" };

  return (
    <section className="card wallet-card">
      <div className="wallet-header">
        <div>
          <h3>💼 Wallet Overview</h3>
          <p>Your connected wallet status</p>
        </div>

        <span className={`wallet-badge ${wallet.connected ? "connected" : "disconnected"}`}>
          <span className="status-dot" />
          {wallet.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {(wallet.connected || circle || isConnected) && (
        <button
          type="button"
          className="premium-action-btn premium-action-btn--cancel wallet-unified-disconnect"
          onClick={handleDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "🔌 Disconnect All Wallets"}
        </button>
      )}

      <div className="wallet-info">
        <div className="wallet-item">
          <span>Network</span>
          <strong>{wallet.network}</strong>
        </div>

        <div className="wallet-item">
          <span>USDC Balance</span>
          <strong>{wallet.loading ? "Loading..." : wallet.balance}</strong>
        </div>

        <div className="wallet-item">
          <span>Wallet Status</span>
          <strong>{wallet.connected ? "Active" : "Inactive"}</strong>
        </div>

        <div className="wallet-item">
          <span>Address</span>
          <strong>{wallet.address}</strong>
        </div>
      </div>

      {/* Circle User-Controlled Wallet (email OTP + PIN, parallel to Reown) */}
      <div className="wallet-circle">
        {circle ? (
          <>
            <div className="wallet-circle-status">
              <span className={`wallet-badge connected`}>
                <span className="status-dot" /> Circle Wallet
              </span>
              <strong className="wallet-circle-address">{shorten(circle.address)}</strong>
            </div>
            <div className="wallet-circle-actions">
              <span className="wallet-circle-note">
                Connected — escrow actions in Create Escrow will use this wallet.
              </span>
              <button
                type="button"
                className="premium-action-btn premium-action-btn--cancel"
                onClick={handleDisconnect}
                disabled={busy || disconnecting}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="wallet-circle-tabs">
              <button
                type="button"
                className={`wallet-circle-tab ${authMode === "email" ? "active" : ""}`}
                onClick={() => setAuthMode("email")}
                disabled={busy}
              >
                ✉️ Email
              </button>
              <button
                type="button"
                className={`wallet-circle-tab ${authMode === "pin" ? "active" : ""}`}
                onClick={() => setAuthMode("pin")}
                disabled={busy}
              >
                🔐 PIN
              </button>
            </div>

            {authMode === "email" ? (
              <form className="wallet-circle-login" onSubmit={handleEmailConnect}>
                <label htmlFor="circle-email">
                  <strong>{authLabel.title}</strong>
                  <span>{authLabel.sub}</span>
                </label>
                <input
                  id="circle-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="premium-action-btn premium-action-btn--create"
                  disabled={busy || !email.trim()}
                >
                  {busy ? "Connecting…" : "Connect with Circle"}
                </button>
              </form>
            ) : (
              <form className="wallet-circle-login" onSubmit={handlePinConnect}>
                <label htmlFor="circle-userid">
                  <strong>{authLabel.title}</strong>
                  <span>PIN login — set your PIN in the Circle popup, no email needed</span>
                </label>
                <input
                  id="circle-userid"
                  type="text"
                  placeholder="any unique ID (e.g. your email)"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="submit"
                  className="premium-action-btn premium-action-btn--create"
                  disabled={busy || !userId.trim()}
                >
                  {busy ? "Connecting…" : "Connect with PIN"}
                </button>
              </form>
            )}

            {circleConfig && !circleConfig.configured && (
              <p className="escrow-hint">
                Circle not configured — add CIRCLE_API_KEY to backend/.env (see README).
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default WalletPanel;
