import { useAppKit, useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";

export function useWalletBridge() {
  const { open } = useAppKit();
  const { address, isConnected, caipAddress, status } = useAppKitAccount({
    namespace: "eip155",
  });
  const { walletProvider } = useAppKitProvider("eip155");

  const openConnect = () => open({ view: "Connect", namespace: "eip155" });
  const openAccount = () => open({ view: "Account", namespace: "eip155" });

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
  };
}
