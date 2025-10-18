import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { WagmiProvider } from 'wagmi';
import { mainnet, polygon, base, arbitrum, optimism } from 'wagmi/chains';
import { ReactNode, useEffect, useState } from 'react';

// WalletConnect project ID - this is a public identifier
const projectId = 'e542ff314e26ff34de2d4fba98db70bb';

const metadata = {
  name: 'FOMO Feed',
  description: 'Prediction Markets Trading Platform',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  icons: ['/logo.png']
};

// Support multiple chains for portfolio balances
const chains = [polygon, mainnet, base, arbitrum, optimism] as const;

const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
});

interface Web3ProviderProps {
  children: ReactNode;
}

export function Web3Provider({ children }: Web3ProviderProps) {
  const [modalInitialized, setModalInitialized] = useState(false);

  useEffect(() => {
    // Initialize Web3Modal after component mounts to prevent blocking app load
    try {
      if (!modalInitialized) {
        createWeb3Modal({
          wagmiConfig: config,
          projectId,
          enableAnalytics: false,
          enableOnramp: false,
        });
        setModalInitialized(true);
      }
    } catch (error) {
      console.error('Failed to initialize Web3Modal:', error);
      // App continues to work even if Web3Modal fails
    }
  }, [modalInitialized]);

  return (
    <WagmiProvider config={config}>
      {children}
    </WagmiProvider>
  );
}
