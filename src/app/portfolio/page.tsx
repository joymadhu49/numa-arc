import { PortfolioLoader } from "@/components/portfolio/portfolio-loader";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Portfolio</h1>
        <p className="mt-1 text-sm text-neutral-400">
          USDC + EURC on Arc Testnet.
        </p>
      </header>
      <PortfolioLoader />
    </main>
  );
}
