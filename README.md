# Arcwise

AI crypto copilot on Arc, Circle's stablecoin L1. Stablecoin-native, USDC-gas, sub-second finality.

See `PLAN.md` for the full build plan, architecture, and milestones.

## Stack

- Next.js 15 (App Router), React 19, TypeScript strict
- viem 2, wagmi 2, `@circle-fin/app-kit`, `@circle-fin/adapter-viem-v2`
- Claude Agent SDK (`@anthropic-ai/sdk`)
- Tailwind CSS, zustand, lucide-react

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open http://localhost:3000.

## Arc Testnet

- Chain ID: `5042002`
- Native gas: USDC (6 decimals)
- RPC: `https://rpc.testnet.arc.network`
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com`
