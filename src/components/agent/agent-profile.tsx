'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, ExternalLink } from 'lucide-react'
import { loadAgent, type GeneratedAgent } from '@/lib/agent-generator'

export function AgentProfile() {
  const [agent, setAgent] = useState<GeneratedAgent | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setAgent(loadAgent())
    setReady(true)
  }, [])

  if (!ready) return null

  if (!agent) {
    return (
      <section className="rounded-2xl border border-border-c bg-card/60 p-8 text-center">
        <p className="text-sm text-muted-fg">No agent minted yet.</p>
        <Link
          href="/"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg transition hover:brightness-110"
        >
          <Sparkles className="h-4 w-4" />
          Mint your agent
        </Link>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border-c bg-card/60">
      <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-[240px_1fr]">
        <div className="mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl bg-muted-bg md:max-w-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.imageUrl} alt={agent.name} className="h-full w-full" />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <p className="text-2xs uppercase tracking-wider text-muted-fg">Numa Agent</p>
            <h2 className="mt-1 break-words text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {agent.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border-c bg-muted-bg px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-fg">
              {agent.rarity}
            </span>
            {agent.capabilities.map((c) => (
              <span
                key={c}
                className="rounded-full border border-border-c px-2.5 py-0.5 text-2xs text-muted-fg"
              >
                {c}
              </span>
            ))}
          </div>

          <dl className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
            <Row label="Seed" value={agent.seed} />
            <Row label="Minted" value={new Date(agent.mintedAt).toLocaleString()} />
            {agent.ownerAddress ? <Row label="Owner" value={agent.ownerAddress} /> : null}
            {agent.txHash ? (
              <Row label="Tx" value={`${agent.txHash.slice(0, 10)}…${agent.txHash.slice(-6)}`} />
            ) : null}
          </dl>

          {agent.explorerUrl ? (
            <a
              href={agent.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-fg underline decoration-border-c underline-offset-4 transition hover:text-fg"
            >
              <ExternalLink className="h-3 w-3" /> View mint tx on Arcscan
            </a>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg border border-border-c bg-bg px-3 py-2">
      <dt className="shrink-0 text-muted-fg">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-fg">{value}</dd>
    </div>
  )
}
