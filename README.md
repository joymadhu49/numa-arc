<p align="center">
  <img src="public/numa-logo.svg" alt="Numa" width="120" />
</p>

<h1 align="center">Numa</h1>

<p align="center"><em>AI stablecoin DeFi copilot on Arc — Circle's stablecoin Layer 1.</em></p>


Numa turns DeFi into a conversation. Ask in plain English: swap, send, bridge across chains via CCTP, check yields, scan tokens, read your portfolio, mint a soulbound on-chain agent identity. All routed through Arc's USDC-native rails with sub-second finality.

**Live:** [numa-arc.vercel.app](https://numa-arc.vercel.app/)
**Repo:** [github.com/joymadhu49/numa-arc](https://github.com/joymadhu49/numa-arc)

---

## Features

- **Chat-driven DeFi** — swap, send, bridge via CCTP, deposit, withdraw, add/remove liquidity, all triggered by natural language.
- **Multi-chain bridging** — CCTP routes from Ethereum Sepolia and Base Sepolia into Arc Testnet, plus reverse paths.
- **Portfolio + yield discovery** — Arc-only USDC + EURC balances via ERC-20 precompile, live token prices via CoinGecko, yield opportunities via DefiLlama.
- **Safety scans** — pre-flight token + transaction scans through `scan_token` and `scan_tx` tools.
- **Soulbound agent NFT** — mint a unique character (DiceBear-generated) as an ERC-721 soulbound token on Arc. Fully on-chain metadata, no IPFS, unlimited supply, gas-only mint.
- **SIWE auth** — wallet-signed sign-in, session persists across refreshes and chain switches.
- **Monochrome UI** — Elsa-inspired clean dark theme, official chain logos for the network switcher.

---

## On-chain

| Contract | Address | Network |
|---|---|---|
| `NumaAgent` (ERC-721 soulbound) | [`0x2ffd7da9b099cd1abb60149c347caf34b39f026f`](https://testnet.arcscan.app/address/0x2ffd7da9b099cd1abb60149c347caf34b39f026f) | Arc Testnet (5042002) |

Source: [`contracts/NumaAgent.sol`](contracts/NumaAgent.sol). ABI + deploy metadata in [`contracts/numa-agent.address.json`](contracts/numa-agent.address.json).

---

## Stack

- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript strict
- **Wallet / chain:** viem 2, wagmi 2, WalletConnect, MetaMask
- **Stablecoin rails:** `@circle-fin/app-kit`, `@circle-fin/adapter-viem-v2` (swap, bridge via CCTP, send)
- **AI:** OpenRouter (`openai/gpt-4o`) via OpenAI-compatible streaming
- **Smart contracts:** Solidity 0.8.24 with `viaIR` + optimizer
- **UI:** Tailwind CSS, lucide-react icons, zustand

---

## Arc Testnet

| Field | Value |
|---|---|
| Chain ID | `5042002` |
| Native gas | USDC (18 decimals when read via `eth_getBalance`; 6 decimals via ERC-20 `balanceOf` precompile) |
| RPC | `https://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |

> **Note:** Arc's native USDC gas token uses 18-decimal precision via `eth_getBalance`, while the USDC ERC-20 interface (`0x36000000...`) uses 6 decimals. Always read user-facing USDC balances via the ERC-20 precompile.

---

## Getting started

```bash
git clone https://github.com/joymadhu49/numa-arc.git
cd numa-arc
npm install --legacy-peer-deps
cp .env.example .env       # or create .env from the template below
npm run dev
```

Open <http://localhost:3000>.

### Environment

Configure your local `.env` with OpenRouter, WalletConnect, Arc RPC / explorer, Circle App Kit key, token addresses (USDC, EURC), and the deployed `NEXT_PUBLIC_NUMA_AGENT_NFT` contract address. Never commit `DEPLOYER_PRIVATE_KEY` — it is only used locally by `scripts/deploy-numa-agent.mjs`.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server on `http://localhost:3000` |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run deploy:numa-agent` | Compile + deploy `NumaAgent.sol` to Arc Testnet (requires `DEPLOYER_PRIVATE_KEY` env var) |

### Deploying the NFT contract

```bash
DEPLOYER_PRIVATE_KEY=0xYOUR_KEY npm run deploy:numa-agent
```

The script:

1. Compiles `contracts/NumaAgent.sol` with solc 0.8.24 (`viaIR: true`, optimizer runs=200).
2. Deploys via viem to Arc Testnet using the supplied key.
3. Waits for the receipt.
4. Writes `contracts/numa-agent.address.json` (address + ABI + tx hash).
5. Updates `.env` with `NEXT_PUBLIC_NUMA_AGENT_NFT=<address>`.

Deployer wallet must hold USDC gas on Arc Testnet. Grab some from <https://faucet.circle.com>.

---

## Project layout

```
contracts/
  NumaAgent.sol              ERC-721 soulbound, on-chain metadata
  numa-agent.address.json    Deployed address + ABI
scripts/
  deploy-numa-agent.mjs      Compile + deploy script (solc + viem)
src/
  ai/
    system-prompt.ts         Numa system prompt
    tools/                   AI tool definitions (swap, bridge, send, scans, prices, yield, ...)
  app/
    api/                     Tool dispatch, OpenRouter chat stream, Circle proxy
    agent/                   /agent page (NFT profile + contract info)
    portfolio/               /portfolio page
  chains/arc.ts              viem chain definition for Arc Testnet
  components/
    chat/                    Chat shell + message renderer + mint card
    sidebar/                 Sidebar + WalletPill + NetworkSwitcher
    agent/                   AgentProfile (reads localStorage)
    auth/                    SIWE gate
    portfolio/               Portfolio loader + card
  lib/
    appkit.ts                Circle App Kit instance
    wagmi.ts                 wagmi config
    tx-executor.ts           Unified transaction executor for AI-prepared intents
    agent-generator.ts       Random character + name generator
    tokens.ts                Token registry per chain
    use-auth.ts              SIWE hook
public/
  numa-logo.svg              Mascot logo
```

---

## Deploying to Vercel

1. Import the repo on Vercel: <https://vercel.com/new>
2. Framework preset: **Next.js** (auto-detected)
3. **Install Command:** `npm install --legacy-peer-deps` (React 19 RC peer mismatch with wagmi/walletconnect — required)
4. Add the environment variables above (Production + Preview + Development scope). **Do not add `DEPLOYER_PRIVATE_KEY` on Vercel.**
5. Deploy.

A `vercel.json` in the repo already sets the install command, build command, and framework.

---

## Architecture notes

- **AI tool flow:** `system-prompt.ts` instructs the model to call tools eagerly. The OpenRouter stream is parsed in `/api/chat`, tool calls are dispatched client-side via `src/lib/exec-tools.ts`. Read-only tools hit `/api/tools`. Signing tools return `awaiting_wallet_signature` and the user confirms via wallet.
- **Bridge:** `useTxExecutor` resolves source/destination chains, switches the wallet via raw EIP-1193 (bypassing wagmi's strict chain check), then calls `appkit.bridge()`. CCTP burn step is the canonical tx hash returned to the UI.
- **NumaAgent mint:** `mint-agent-card.tsx` builds the calldata with `encodeFunctionData(NUMA_AGENT_ABI, 'mint', [...])`, sends it to the contract, waits for the receipt, and parses the `Mint` event for the tokenId.
- **New chat reset:** clicking the sidebar Home or the Numa logo pushes `/?new=<timestamp>`; `Chat` watches the `new` search param and clears all message state when it changes.

---

## Roadmap

- Real Uniswap V3 + Aave addresses on Arc Testnet (positions, deposit, withdraw)
- ERC-8004 / ERC-8183 official registry integration (hire_agent, create_job)
- Live USD pricing for portfolio totals (CoinGecko already wired for the `get_prices` tool)
- One-signature CCTP UX verification

---

## License

MIT
