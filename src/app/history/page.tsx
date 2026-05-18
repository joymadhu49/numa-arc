import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function HistoryPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">History</h1>
        <p className="text-sm text-neutral-400">
          Every Numa action, attested on Arc. Filterable by tool, status, and tx hash.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>No activity yet</CardTitle>
          <CardDescription>
            Your swaps, sends, bridges, and agent jobs will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-neutral-400">
          Connect a wallet and execute an action to populate history.
        </CardContent>
      </Card>
    </div>
  )
}
