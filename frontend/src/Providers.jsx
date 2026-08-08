import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

import { arcTestnet } from "./contracts/arcChain";

const queryClient = new QueryClient();
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "";

const metadata = {
  name: "ArcBridge Escrow",
  description: "Secure USDC escrow on Arc Testnet",
  url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
  icons: [],
};

const networks = [arcTestnet];

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
    features: {
      analytics: true,
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
