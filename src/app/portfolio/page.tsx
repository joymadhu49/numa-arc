import { PortfolioLoader } from "@/components/portfolio/portfolio-loader";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Portfolio</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Your USDC &amp; EURC across Arc and supported testnets.
        </p>
      </header>
      <PortfolioLoader />
    </main>
  );
}
