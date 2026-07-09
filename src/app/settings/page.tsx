import { Network, Palette, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { NetworkPrefsCard } from '@/components/settings/network-prefs-card'

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Settings</h1>
        <p className="text-sm text-muted-fg">Preferences, networks, and safety thresholds.</p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <CardTitle>Appearance</CardTitle>
          </div>
          <CardDescription>Choose how Numa looks. System follows your device.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-fg">Theme</p>
              <p className="text-xs text-muted-fg">Light, dark, or match your system.</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <CardTitle>Networks</CardTitle>
          </div>
          <CardDescription>Choose which networks Numa shows.</CardDescription>
        </CardHeader>
        <CardContent>
          <NetworkPrefsCard />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <CardTitle>Safety</CardTitle>
          </div>
          <CardDescription>Every transaction previews and simulates before you sign.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-fg">
          Configurable thresholds are coming soon: slippage caps, approval limits, and
          high-risk hold-to-confirm.
        </CardContent>
      </Card>
    </div>
  )
}
