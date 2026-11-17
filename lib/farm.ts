// Farm plans built from each protocol's own record: its category decides the
// core action, its first two chains decide where and what gas costs, its TVL
// tier decides a sensible position size, and its age decides the hold period.
// Every step states an action, a USD cost and a time commitment.

import type { Proto } from './model.ts';

function gasForChain(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('ethereum') || c.includes('bitcoin')) return 12;
  if (c.includes('solana') || c.includes('sui') || c.includes('aptos')) return 1;
  if (c.includes('tron') || c.includes('binance') || c.includes('bnb')) return 2;
  return 3; // rollups and most alt-L1s sit between L2-cheap and mainnet
}

function positionFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 300;
  if (tvl >= 250_000_000) return 200;
  if (tvl >= 50_000_000) return 120;
  if (tvl >= 15_000_000) return 75;
  return 40;
}

function coreAction(p: Proto, size: number, chain: string): string {
  const c = (p.category || '').toLowerCase();
  const n = p.name;
  if (c.includes('lend')) return `Supply $${size} in USDC as collateral inside ${n} on ${chain}, then borrow $${Math.round(size * 0.4)} against it once so both sides of the market register your wallet`;
  if (c.includes('cdp') || c.includes('stable')) return `Deposit $${size} in collateral into a ${n} vault on ${chain} and mint a small amount of its stable asset, keeping the health factor above 2.0`;
  if (c.includes('dex') || c.includes('liquidity')) return `Add $${size} as two-sided liquidity to the busiest USDC pool in ${n} on ${chain}, choosing the fee tier with the highest 7-day volume`;
  if (c.includes('bridge')) return `Bridge $${size} in USDC from Ethereum to ${chain} through ${n}, then make one swap with the bridged funds on the destination chain`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${size} worth of the native staking asset through ${n} on ${chain} and hold the liquid receipt token in the same wallet`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return `Post $${size} in USDC margin on ${n} (${chain}) and trade one small hedged position of about $${Math.round(size / 2)}, closing it the same day`;
  if (c.includes('curator') || c.includes('allocator')) return `Allocate $${size} in USDC to the largest curated vault run through ${n} on ${chain} and leave the vault shares untouched`;
  if (c.includes('rwa')) return `Buy $${size} of the tokenised real-world asset offered by ${n} on ${chain} after its eligibility check, and hold it in your farming wallet`;
  if (c.includes('yield') || c.includes('farm') || c.includes('basis')) return `Deposit $${size} in USDC into the main yield strategy of ${n} on ${chain}, picking the vault with the largest share of its TVL`;
  if (c.includes('insurance')) return `Purchase $${size} of protocol cover from ${n} on ${chain} for a 90-day term and keep the cover NFT as proof of activity`;
  if (c.includes('chain')) return `Bridge $${size} in USDC onto ${chain} via ${n}'s canonical route, then make three native swaps and one contract interaction in its ecosystem apps`;
  if (c.includes('payment')) return `Route a real $${size} payment through ${n} on ${chain} to a second wallet you control, then repeat with a smaller amount a week later`;
  if (c.includes('launchpad')) return `Register on ${n} (${chain}), complete its profile checks and take part in one public allocation round with at most $${size}`;
  return `Deposit $${size} in USDC into the flagship product of ${n} on ${chain} and keep the resulting position or shares in the wallet`;
}

export function buildFarmSteps(p: Proto, years: number | null): string[] {
  const main = p.chains[0] || 'Ethereum';
  const second = p.chains[1] || main;
  const gas = gasForChain(main);
  const size = positionFor(p.tvl_usd);
  const hold = years === null ? 45 : years < 0.5 ? 75 : years < 1.5 ? 60 : 35;
  const weeklyGas = Math.max(1, Math.round(gas / 3));
  const cat = p.category || 'uncategorised protocol';
  return [
    `Create a dedicated farming wallet for ${p.name}, fund it with $${size + gas * 3} (position plus gas buffer) on ${main}; setup costs about $${gas} in gas and takes 20 minutes.`,
    coreAction(p, size, main) + `; expect about $${gas} in gas and 15 minutes to complete the first position.`,
    `Repeat one small ${cat.toLowerCase()} action on ${second} every week for 6 weeks (about $${weeklyGas} gas each, 10 minutes weekly) so activity spans several weekly snapshots.`,
    `Hold the ${p.name} position for at least ${hold} days without moving it to another wallet; holding costs $0 beyond the $${size} already deployed.`,
    `Check ${p.name}'s official points, rewards or governance page every Sunday (5 minutes, $0) and screenshot your balance so a later eligibility claim can be evidenced.`,
    `After ${hold} days, either roll the position for another cycle or exit in one transaction (about $${gas} gas, 10 minutes); never pay a third party to 'unlock' a future ${p.name} token.`,
  ];
}
