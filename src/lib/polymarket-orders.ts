// Polymarket CLOB Order utilities for signing and submitting trades

export const POLYMARKET_ORDER_DOMAIN = {
  name: "Polymarket CTF Exchange",
  version: "1",
  chainId: 137, // Polygon
} as const;

export const POLYMARKET_ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
} as const;

export interface PolymarketOrderParams {
  tokenId: string;
  price: number; // 0-1 range
  size: number;
  side: 'BUY' | 'SELL';
  walletAddress: string;
  funderAddress?: string; // The proxy wallet that holds funds
  signatureType?: number; // 1 = email/magic, 2 = browser wallet
}

export interface SignedPolymarketOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
  signatureType: number;
  signature: string;
}

export function buildPolymarketOrder(params: PolymarketOrderParams): {
  salt: bigint;
  maker: `0x${string}`;
  signer: `0x${string}`;
  taker: `0x${string}`;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;
  signatureType: number;
} {
  const { tokenId, price, size, side, walletAddress, funderAddress, signatureType } = params;
  
  // Use funder (proxy) as maker if provided, otherwise use EOA
  const makerAddress = (funderAddress || walletAddress) as `0x${string}`;
  // Signer is always the EOA that signs the order
  const signerAddress = walletAddress as `0x${string}`;

  // Generate random salt
  const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));

  // Calculate amounts (Polymarket uses 6 decimals for USDC)
  const PRECISION = BigInt(1_000_000); // 6 decimals
  const sizeInUsdc = BigInt(Math.floor(size * 1_000_000)); // size in USDC (6 decimals)
  
  // For a BUY order: maker gives USDC, taker gives outcome tokens
  // For a SELL order: maker gives outcome tokens, taker gives USDC
  const isBuy = side === 'BUY';
  const priceInUsdc = Math.floor(price * 1_000_000); // price per token in USDC (6 decimals)
  
  const makerAmount = isBuy 
    ? BigInt(priceInUsdc) * BigInt(Math.floor(size)) // USDC to spend
    : sizeInUsdc; // Tokens to sell
    
  const takerAmount = isBuy
    ? sizeInUsdc // Tokens to receive
    : BigInt(priceInUsdc) * BigInt(Math.floor(size)); // USDC to receive

  return {
    salt,
    maker: makerAddress, // Proxy wallet that holds funds
    signer: signerAddress, // EOA that signs the order
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: BigInt(tokenId),
    makerAmount,
    takerAmount,
    expiration: BigInt(Math.floor(Date.now() / 1000) + 86400), // 24 hours from now
    nonce: BigInt(Date.now()),
    feeRateBps: BigInt(0), // 0 basis points fee
    side: isBuy ? 0 : 1, // 0 = BUY, 1 = SELL
    signatureType: signatureType ?? 2, // Default to 2 (browser wallet)
  };
}

/**
 * Formats a signed order for submission to Polymarket CLOB API
 */
export function formatSignedOrder(
  order: ReturnType<typeof buildPolymarketOrder>,
  signature: string
): SignedPolymarketOrder {
  return {
    salt: order.salt.toString(),
    maker: order.maker,
    signer: order.signer,
    taker: order.taker,
    tokenId: order.tokenId.toString(),
    makerAmount: order.makerAmount.toString(),
    takerAmount: order.takerAmount.toString(),
    expiration: order.expiration.toString(),
    nonce: order.nonce.toString(),
    feeRateBps: order.feeRateBps.toString(),
    side: order.side,
    signatureType: order.signatureType,
    signature,
  };
}
