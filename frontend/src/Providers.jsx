import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { arcTestnet } from "./contracts/arcChain";
import { baseSepolia, sepolia } from "viem/chains";

const queryClient = new QueryClient();
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "";

const appUrl =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

const metadata = {
  name: "ArcBridge Escrow",
  description: "Secure USDC escrow on Arc Testnet",
  url: appUrl,
  icons: [`${appUrl}/arc-logo.svg`],
};

const networks = [arcTestnet, baseSepolia, sepolia];

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
});

if (projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    chainImages: {
      [arcTestnet.id]: `${appUrl}/arc-logo.svg`,
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#5e6ad2",
      "--w3m-color-mix": "#0f1428",
      "--w3m-color-mix-strength": 20,
      "--w3m-border-radius-master": "10px",
      "--w3m-font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
    },
    features: {
      analytics: true,
      allWallets: "SHOW",
      enableWalletGuide: true,
    },
  });
} else if (typeof console !== "undefined") {
  console.warn("VITE_REOWN_PROJECT_ID is missing. Wallet modal is disabled until it is set.");
}

export function Providers({ children }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
