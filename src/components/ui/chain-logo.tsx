'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Per-chain brand color for the monogram fallback (used when a logo file is
 * missing or fails to load). Keyed by registry chain key. This guarantees a
 * network icon NEVER renders as a broken image.
 */
const BRAND: Record<string, { bg: string; fg: string }> = {
  'arc-testnet': { bg: '#2775CA', fg: '#ffffff' },
  arc: { bg: '#2775CA', fg: '#ffffff' },
  ethereum: { bg: '#627EEA', fg: '#ffffff' },
  'ethereum-sepolia': { bg: '#627EEA', fg: '#ffffff' },
  base: { bg: '#0052FF', fg: '#ffffff' },
  'base-sepolia': { bg: '#0052FF', fg: '#ffffff' },
  arbitrum: { bg: '#12AAFF', fg: '#0b1530' },
  'arbitrum-sepolia': { bg: '#12AAFF', fg: '#0b1530' },
  optimism: { bg: '#FF0420', fg: '#ffffff' },
  'optimism-sepolia': { bg: '#FF0420', fg: '#ffffff' },
  polygon: { bg: '#8247E5', fg: '#ffffff' },
  'polygon-amoy': { bg: '#8247E5', fg: '#ffffff' },
  avalanche: { bg: '#E84142', fg: '#ffffff' },
  'avalanche-fuji': { bg: '#E84142', fg: '#ffffff' },
  unichain: { bg: '#F50DB4', fg: '#ffffff' },
  'unichain-sepolia': { bg: '#F50DB4', fg: '#ffffff' },
  linea: { bg: '#121212', fg: '#61DFFF' },
  'linea-sepolia': { bg: '#121212', fg: '#61DFFF' },
}

const FALLBACK = { bg: '#1e2229', fg: '#9aa3b2' }

/** Two-letter monogram from a chain name ("Base Sepolia" → "BS", "Arc" → "AR"). */
function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/**
 * Chain logo with a guaranteed branded monogram fallback. Renders the official
 * logo image when available; on a missing src OR a load error it falls back to
 * a colored initials chip so a network icon is never a broken image.
 */
export function ChainLogo({
  src,
  name,
  chainKey,
  size = 24,
  className,
}: {
  src?: string
  name: string
  chainKey?: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const dim = { width: size, height: size }

  if (!src || failed) {
    const brand = (chainKey && BRAND[chainKey]) || FALLBACK
    return (
      <span
        style={{ ...dim, backgroundColor: brand.bg, color: brand.fg, fontSize: Math.round(size * 0.4) }}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none tracking-tight',
          className,
        )}
        aria-hidden="true"
      >
        {monogram(name)}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={dim}
      onError={() => setFailed(true)}
      className={cn('shrink-0 rounded-full bg-muted-bg object-contain', className)}
    />
  )
}
