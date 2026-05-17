export interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export const TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'swap',
      description:
        'Swap one token for another on Arc Testnet via Circle App Kit. Gas paid in USDC. Both tokens must be on Arc Testnet (chainId 5042002).',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Symbol or address of token to sell.' },
          toToken: { type: 'string', description: 'Symbol or address of token to buy.' },
          amount: { type: 'string', description: 'Human-readable amount of fromToken.' },
          slippageBps: { type: 'number', description: 'Max slippage in bps. Default 50.' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send',
      description: 'Send a token to an address on Arc Testnet. Confirm recipient with user first.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Symbol or address. Defaults USDC.' },
          to: { type: 'string', description: 'Destination EVM address (0x…).' },
          amount: { type: 'string', description: 'Human-readable amount.' },
        },
        required: ['token', 'to', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bridge',
      description:
        'Bridge USDC across chains via Circle CCTP/Gateway through App Kit. Source or destination must be Arc Testnet.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Token symbol. Strongly prefer USDC.' },
          amount: { type: 'string', description: 'Human-readable amount.' },
          fromChain: { type: 'string', description: 'Source chain enum (e.g. Arc_Testnet, Ethereum_Sepolia, Base_Sepolia).' },
          toChain: { type: 'string', description: 'Destination chain enum.' },
          recipient: { type: 'string', description: 'Optional recipient. Defaults connected wallet.' },
        },
        required: ['token', 'amount', 'fromChain', 'toChain'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deposit',
      description:
        'Deposit USDC (or other supported asset) into a yield-bearing DeFi protocol on Arc Testnet (lending market, vault, or staking). Returns receipt token. Use this for "earn yield", "deposit into Aave", "stake USDC".',
      parameters: {
        type: 'object',
        properties: {
          protocol: {
            type: 'string',
            description: 'Protocol slug (e.g. "aave-v3", "compound-v3", "morpho", "yearn"). Required.',
          },
          token: { type: 'string', description: 'Token symbol or address. Default USDC.' },
          amount: { type: 'string', description: 'Human-readable amount.' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: ['protocol', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'withdraw',
      description: 'Withdraw a previously deposited position from a lending market or vault.',
      parameters: {
        type: 'object',
        properties: {
          protocol: { type: 'string', description: 'Protocol slug.' },
          token: { type: 'string', description: 'Underlying token symbol.' },
          amount: { type: 'string', description: 'Amount of underlying to withdraw, or "max".' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: ['protocol', 'token', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_liquidity',
      description:
        'Add liquidity to a Uniswap V3 concentrated liquidity pool on Arc Testnet. Mints an LP NFT position. Use for "add liquidity", "create LP position", "provide liquidity to USDC/ETH pool". Caller chooses tick range or selects "full" / "narrow" / "wide" presets.',
      parameters: {
        type: 'object',
        properties: {
          tokenA: { type: 'string', description: 'First token symbol or address.' },
          tokenB: { type: 'string', description: 'Second token symbol or address.' },
          amountA: { type: 'string', description: 'Human-readable amount of tokenA to deposit.' },
          amountB: { type: 'string', description: 'Human-readable amount of tokenB to deposit.' },
          feeTier: {
            type: 'number',
            enum: [100, 500, 3000, 10000],
            description: 'Uniswap V3 fee tier in bps. 100=0.01% (stable), 500=0.05%, 3000=0.30%, 10000=1%. Default 500 for stable pairs, 3000 for volatile.',
          },
          rangePreset: {
            type: 'string',
            enum: ['full', 'wide', 'narrow', 'custom'],
            description: 'Tick range preset. "full"=full range, "wide"=±50%, "narrow"=±5%, "custom"=use tickLower/tickUpper.',
          },
          tickLower: { type: 'number', description: 'Required if rangePreset=custom.' },
          tickUpper: { type: 'number', description: 'Required if rangePreset=custom.' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: ['tokenA', 'tokenB', 'amountA', 'amountB', 'feeTier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_liquidity',
      description: 'Burn or decrease a Uniswap V3 LP position. Collects fees and returns underlying tokens.',
      parameters: {
        type: 'object',
        properties: {
          positionId: { type: 'string', description: 'NFT tokenId of the LP position.' },
          percent: { type: 'number', description: 'Percent of liquidity to remove (1-100). Default 100.' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: ['positionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lp_positions',
      description: 'List the connected wallet\'s open Uniswap V3 LP positions on Arc Testnet, with current value, fees earned, and in-range status.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Optional wallet override.' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio',
      description: "Fetch the connected wallet's token balances and total USD value across Arc.",
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Optional address override.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_yield',
      description:
        'Find yield opportunities (lending APYs, LP APRs, staking) from DefiLlama and Arc-native pools. Stablecoin pools first.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Optional token filter (e.g. USDC).' },
          minApy: { type: 'number', description: 'Optional min APY in percent.' },
          chain: { type: 'string', description: 'Optional chain filter. Default Arc.' },
          stablecoinOnly: { type: 'boolean', description: 'Default true.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_prices',
      description:
        'Fetch current USD spot price + 24h change for tokens from CoinGecko (e.g. BTC, ETH, SOL, USDC). Use when user asks "what is the price of X" or "BTC price today".',
      parameters: {
        type: 'object',
        properties: {
          symbols: {
            type: 'array',
            items: { type: 'string' },
            description: 'Symbols to price (e.g. ["BTC", "ETH"]).',
          },
        },
        required: ['symbols'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trending',
      description: 'Trending tokens by volume / holders / price movement.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: 'Chain filter. Default Arc_Testnet.' },
          window: { type: 'string', enum: ['1h', '24h', '7d'], description: 'Default 24h.' },
          limit: { type: 'number', description: 'Max tokens. Default 10.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_token',
      description:
        'Safety-scan a token: honeypot patterns, mint authority, owner privileges, tax, liquidity. Call before quoting unknown tokens.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Token contract address.' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: ['address'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_tx',
      description:
        'MANDATORY pre-execution simulation for any swap, send, bridge, deposit, withdraw, add_liquidity, remove_liquidity. Decodes calldata, simulates via eth_call, surfaces approval risk and asset deltas.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Contract or recipient address.' },
          data: { type: 'string', description: 'Hex-encoded calldata.' },
          value: { type: 'string', description: 'Native value (wei). Default 0.' },
          from: { type: 'string', description: 'Optional from. Defaults connected wallet.' },
          chain: { type: 'string', description: 'Chain enum. Default Arc_Testnet.' },
        },
        required: ['to', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_job',
      description:
        'Create an ERC-8183 job escrow on Arc for a recurring task (e.g. weekly rebalance, auto-compound LP fees). Funds USDC up front; deliverables released by evaluator.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Job description + acceptance criteria.' },
          provider: { type: 'string', description: 'Provider agent address. Default Arcwise.' },
          evaluator: { type: 'string', description: 'Evaluator address (oracle, DAO, or self).' },
          budgetUsdc: { type: 'string', description: 'Total USDC budget to escrow.' },
          schedule: { type: 'string', description: 'Optional cron-like schedule.' },
        },
        required: ['description', 'budgetUsdc'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'register_agent',
      description:
        'Register the user as an ERC-8004 agent on Arc. Mints identity NFT + pins agentURI JSON.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          image: { type: 'string', description: 'URL or ipfs://.' },
          capabilities: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hire_agent',
      description:
        'Hire another ERC-8004 agent. Reads reputation, then opens an ERC-8183 job funded in USDC.',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          task: { type: 'string' },
          budgetUsdc: { type: 'string' },
          deadline: { type: 'string', description: 'Optional ISO 8601.' },
        },
        required: ['agentId', 'task', 'budgetUsdc'],
      },
    },
  },
]
