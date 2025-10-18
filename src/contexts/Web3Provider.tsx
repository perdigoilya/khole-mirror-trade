import { createWeb3Modal } from '@web3modal/wagmi/react';
import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { WagmiProvider } from 'wagmi';
import { mainnet, polygon, base, arbitrum, optimism } from 'wagmi/chains';
import { ReactNode } from 'react';

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

// Singleton guard: Prevent double initialization across HMR/remounts
let web3ModalInitialized = false;

function ensureWeb3ModalInit() {
  // Only run on client-side
  if (typeof window === 'undefined') return;
  
  // Singleton: only init once
  if (web3ModalInitialized) return;
  
  try {
    const isIframe = window.top !== window.self;
    
    createWeb3Modal({
      wagmiConfig: config,
      projectId,
      enableAnalytics: false,
      enableOnramp: false,
      // In Lovable preview (iframe), WalletConnect may have CSP issues
      // Modal still inits but WC button should be hidden in UI
    });
    
    web3ModalInitialized = true;
    
    if (isIframe) {
      console.log('Running in iframe (Lovable preview) - WalletConnect may have CSP restrictions');
    }
  } catch (error) {
    console.error('Failed to initialize Web3Modal:', error);
    // App continues to work even if Web3Modal fails
  }
}

// Initialize immediately on module load (client-side only)
ensureWeb3ModalInit();

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

// Export helper to detect if running in iframe (for hiding WC UI)
export const isInIframe = typeof window !== 'undefined' && window.top !== window.self;
