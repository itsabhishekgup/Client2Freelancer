import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
} from "@reown/appkit/react";
import { useDisconnect } from "@reown/appkit-controllers/react";
import { appKitEnabled } from "../Providers";

export function useWalletBridge() {
  // When VITE_REOWN_PROJECT_ID is unset, createAppKit is skipped in
  // Providers.jsx and useAppKit() throws "Please call createAppKit before
  // using useAppKit hook" — which would crash the whole app on mount. The
  // controllers hooks (account/provider/disconnect) never throw and return
  // safe disconnected defaults, so only the modal hook needs guarding. The
  // appKitEnabled flag is a module-level constant that never changes between
  // renders, so the conditional hook call is stable and safe.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const appkit = appKitEnabled ? useAppKit() : null;
  const { address, isConnected, caipAddress, status } = useAppKitAccount({
    namespace: "eip155",
  });
  const { walletProvider } = useAppKitProvider("eip155");
  const { disconnect: reownDisconnect } = useDisconnect();

  const openConnect = () => {
    if (!appkit) return;
    appkit.open({ view: "Connect", namespace: "eip155" });
  };
  const openAccount = () => {
    if (!appkit) return;
    appkit.open({ view: "Account", namespace: "eip155" });
  };

  const providerSource =
    walletProvider ?? (typeof window !== "undefined" ? window.ethereum : null);

  return {
    address,
    isConnected,
    caipAddress,
    status,
    walletProvider: providerSource,
    openConnect,
    openAccount,
    disconnect: reownDisconnect,
  };
}
