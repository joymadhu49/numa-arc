const ADJECTIVES = [
  'Quantum', 'Sable', 'Lunar', 'Solar', 'Crimson', 'Pixel', 'Echo', 'Neon',
  'Cipher', 'Vapor', 'Nova', 'Glacial', 'Velvet', 'Mythic', 'Astral',
  'Obsidian', 'Iron', 'Silent', 'Phantom', 'Rogue', 'Stellar', 'Cobalt',
  'Frost', 'Ember', 'Bronze', 'Onyx', 'Marble', 'Carbon', 'Hyper', 'Atomic',
] as const

const NOUNS = [
  'Owl', 'Raven', 'Fox', 'Wolf', 'Falcon', 'Cat', 'Hawk', 'Lynx',
  'Otter', 'Panther', 'Bear', 'Tiger', 'Heron', 'Sparrow', 'Mantis',
  'Crane', 'Stag', 'Moth', 'Beetle', 'Squid', 'Orca', 'Manta', 'Koi',
  'Robin', 'Wren', 'Newt', 'Asp', 'Drake', 'Whale', 'Cub',
] as const

export interface GeneratedAgent {
  id: string
  name: string
  seed: string
  imageUrl: string
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary'
  capabilities: string[]
  mintedAt: string
  txHash?: string
  explorerUrl?: string
  ownerAddress?: string
}

const CAPABILITY_POOL = [
  'auto-rebalance', 'yield-hunter', 'tx-guardian', 'bridge-routing',
  'stablecoin-arb', 'gas-optimizer', 'lp-manager', 'risk-scanner',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function rollRarity(): GeneratedAgent['rarity'] {
  const r = Math.random()
  if (r < 0.55) return 'Common'
  if (r < 0.85) return 'Rare'
  if (r < 0.97) return 'Epic'
  return 'Legendary'
}

export function generateAgent(): GeneratedAgent {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`
  const capCount = 2 + Math.floor(Math.random() * 2)
  const caps = new Set<string>()
  while (caps.size < capCount) caps.add(pick(CAPABILITY_POOL))
  return {
    id: seed,
    name,
    seed,
    imageUrl: `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}&backgroundColor=ffffff&radius=20`,
    rarity: rollRarity(),
    capabilities: Array.from(caps),
    mintedAt: new Date().toISOString(),
  }
}

const STORAGE_KEY = 'numa.agent'

export function saveAgent(agent: GeneratedAgent): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(agent))
}

export function loadAgent(): GeneratedAgent | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GeneratedAgent
  } catch {
    return null
  }
}

export function clearAgent(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
