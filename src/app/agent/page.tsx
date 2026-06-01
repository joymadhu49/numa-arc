import { arcTestnet } from '@/chains/arc'
import { AgentProfile } from '@/components/agent/agent-profile'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function AgentPage() {
  const contract = process.env.NEXT_PUBLIC_NUMA_AGENT_NFT ?? null

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold text-fg sm:text-2xl">Numa Agent Identity</h1>
        <p className="text-sm text-muted-fg">
          On-chain soulbound NFT on Arc Testnet (chainId {arcTestnet.id}).
        </p>
      </header>

      <div className="mb-6 sm:mb-8">
        <AgentProfile />
      </div>

      <section className="rounded-2xl border border-border-c bg-card/60 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-fg">
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
                className="text-xs text-muted-fg underline decoration-border-c underline-offset-4 transition hover:text-fg"
              >
                View on Arcscan →
              </a>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-fg">
            Contract not deployed yet. Run{' '}
            <code className="break-all rounded bg-muted-bg px-1.5 py-0.5 font-mono text-fg">
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
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-muted-fg">{label}</dt>
      <dd className="break-all font-mono text-xs text-fg sm:text-right">{value}</dd>
    </div>
  )
}
