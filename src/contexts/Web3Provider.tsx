import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { WagmiProvider } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { ReactNode } from 'react';

// WalletConnect project ID - this is a public identifier
const projectId = 'e542ff314e26ff34de2d4fba98db70bb';

const metadata = {
  name: 'FOMO Feed',
  description: 'Prediction Markets Trading Platform',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: ['/logo.png']
};

// Polymarket uses Polygon network
const chains = [polygon] as const;

const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});

// Create Web3Modal
createWeb3Modal({
  wagmiConfig: config,
  projectId,
  enableAnalytics: false,
  enableOnramp: false,
});

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={config}>
      {children}
    </WagmiProvider>
  );
}
