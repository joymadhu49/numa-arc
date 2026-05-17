import { arcTestnet } from '@/chains/arc'
import { AgentProfile } from '@/components/agent/agent-profile'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AgentPage() {
  const contract = process.env.NEXT_PUBLIC_NUMA_AGENT_NFT ?? null

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Numa Agent Identity</h1>
        <p className="text-sm text-neutral-400">
          On-chain soulbound NFT on Arc Testnet (chainId {arcTestnet.id}).
        </p>
      </header>

      <div className="mb-8">
        <AgentProfile />
      </div>

      <section className="rounded-2xl border border-neutral-800 p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-400">
          NumaAgent contract
        </h2>
        {contract ? (
          <dl className="grid grid-cols-1 gap-2 text-sm">
            <Row label="Address" value={contract} />
            <Row label="Chain" value={`Arc Testnet (${arcTestnet.id})`} />
            <Row label="Standard" value="ERC-721 soulbound, on-chain metadata" />
            <div className="mt-1">
              <a
                href={`${arcTestnet.blockExplorers.default.url}/address/${contract}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-neutral-300 underline decoration-neutral-600 underline-offset-4 hover:text-white"
              >
                View on Arcscan →
              </a>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">
            Contract not deployed yet. Run{' '}
            <code className="rounded bg-neutral-900 px-1.5 py-0.5">
              DEPLOYER_PRIVATE_KEY=0x... npm run deploy:numa-agent
            </code>
            .
          </p>
        )}
      </section>
    </main>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="break-all text-right font-mono text-xs text-neutral-200">{value}</dd>
    </div>
  )
}
