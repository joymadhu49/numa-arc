'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Github, History, Home, PieChart, Settings, Bot, Send, Twitter } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/ui/theme-toggle'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/portfolio', label: 'Portfolio', icon: PieChart },
  { href: '/agent', label: 'Agent', icon: Bot },
  { href: '/history', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar() {
  const pathname = usePathname() ?? '/'
  const router = useRouter()

  function newChat() {
    router.push(`/?new=${Date.now()}`)
  }

  return (
    <aside className="sticky top-0 flex h-screen w-14 shrink-0 flex-col border-r border-border-c bg-bg sm:w-16 md:w-60">
      <div className="flex h-14 items-center justify-center border-b border-border-c px-2 sm:px-3 md:justify-start">
        <button
          type="button"
          onClick={newChat}
          className="flex items-center gap-2 text-fg"
          aria-label="New chat"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/numa-logo.svg" alt="Numa" className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
          <span className="hidden text-2xl font-extrabold tracking-tight md:inline">Numa</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-1.5 py-3 sm:px-2 min-h-0">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isActive(pathname, item.href)
            const classes = cn(
              'group flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2 text-sm transition md:justify-start md:px-2.5',
              active
                ? 'bg-primary text-primary-fg'
                : 'text-muted-fg hover:bg-muted-bg hover:text-fg',
            )
            const iconClasses = cn(
              'h-4 w-4 shrink-0',
              active ? 'text-primary-fg' : 'text-muted-fg group-hover:text-fg',
            )
            const label = (
              <>
                <Icon className={iconClasses} />
                <span className="hidden md:inline">{item.label}</span>
              </>
            )
            return (
              <li key={item.href}>
                {item.href === '/' ? (
                  <button
                    type="button"
                    onClick={newChat}
                    className={classes}
                    aria-label={item.label}
                    title={item.label}
                  >
                    {label}
                  </button>
                ) : (
                  <Link
                    href={item.href}
                    className={classes}
                    aria-label={item.label}
                    title={item.label}
                    aria-current={active ? 'page' : undefined}
                  >
                    {label}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex flex-col items-center gap-2 border-t border-border-c px-2 py-3 sm:gap-3 md:flex-row md:px-4">
        <ThemeToggle variant="cycle" className="md:-ml-1.5" />
        <a
          href="https://x.com/zx_joy_"
          target="_blank"
          rel="noreferrer"
          aria-label="X / Twitter"
          className="text-muted-fg transition hover:text-fg"
        >
          <Twitter className="h-5 w-5" />
        </a>
        <a
          href="https://github.com/joymadhu49/numa-arc"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
          className="text-muted-fg transition hover:text-fg"
        >
          <Github className="h-5 w-5" />
        </a>
        <a
          href="https://t.me/joy_madhu"
          target="_blank"
          rel="noreferrer"
          aria-label="Telegram"
          className="text-muted-fg transition hover:text-fg"
        >
          <Send className="h-5 w-5" />
        </a>
      </div>
    </aside>
  )
}
