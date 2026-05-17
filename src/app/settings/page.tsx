import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-400">Preferences, networks, and safety thresholds.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Language, theme, and risk limits land here.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-neutral-400">
          Configuration UI is under construction.
        </CardContent>
      </Card>
    </div>
  )
}
