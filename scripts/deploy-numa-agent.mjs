#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import solc from 'solc'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE_PATH = path.join(ROOT, 'contracts', 'NumaAgent.sol')

// Load .env into process.env (no dotenv dep)
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const [, k, vRaw] = m
    if (process.env[k]) continue
    const v = vRaw.replace(/^['"]|['"]$/g, '')
    process.env[k] = v
  }
} catch {}

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_ARC_RPC || 'https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
})

function compile() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8')
  const input = {
    language: 'Solidity',
    sources: { 'NumaAgent.sol': { content: source } },
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }
  const out = JSON.parse(solc.compile(JSON.stringify(input)))
  if (out.errors) {
    const fatal = out.errors.filter((e) => e.severity === 'error')
    for (const e of out.errors) console.error(e.formattedMessage)
    if (fatal.length) throw new Error('Compilation failed')
  }
  const c = out.contracts['NumaAgent.sol'].NumaAgent
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }
}

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY
  if (!rawKey) {
    console.error('Missing DEPLOYER_PRIVATE_KEY env var')
    process.exit(1)
  }
  const pk = rawKey.startsWith('0x') ? rawKey : '0x' + rawKey
  const account = privateKeyToAccount(pk)

  console.log('Compiling NumaAgent.sol ...')
  const { abi, bytecode } = compile()
  console.log('Bytecode size:', (bytecode.length - 2) / 2, 'bytes')

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() })
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http() })

  const balance = await publicClient.getBalance({ address: account.address })
  console.log('Deployer:', account.address)
  console.log('Balance :', balance.toString(), 'wei')

  if (balance === 0n) {
    console.error('Deployer has zero balance on Arc Testnet. Fund via https://faucet.circle.com first.')
    process.exit(1)
  }

  console.log('Sending deployment tx ...')
  const hash = await wallet.deployContract({ abi, bytecode })
  console.log('Tx hash:', hash)
  console.log('Waiting for receipt ...')
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    console.error('Deployment reverted:', receipt)
    process.exit(1)
  }

  const address = receipt.contractAddress
  console.log('\n✓ NumaAgent deployed at:', address)
  console.log('  Explorer: https://testnet.arcscan.app/address/' + address)

  const outPath = path.join(ROOT, 'contracts', 'numa-agent.address.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify({ address, chainId: arcTestnet.id, deployer: account.address, txHash: hash, abi }, null, 2),
  )
  console.log('  Wrote:', outPath)

  const envLine = `NEXT_PUBLIC_NUMA_AGENT_NFT=${address}`
  const envPath = path.join(ROOT, '.env')
  let envBody = ''
  try { envBody = fs.readFileSync(envPath, 'utf8') } catch {}
  if (envBody.includes('NEXT_PUBLIC_NUMA_AGENT_NFT=')) {
    envBody = envBody.replace(/^NEXT_PUBLIC_NUMA_AGENT_NFT=.*$/m, envLine)
  } else {
    envBody = (envBody.trim() ? envBody.trimEnd() + '\n' : '') + envLine + '\n'
  }
  fs.writeFileSync(envPath, envBody)
  console.log('  Updated .env with NEXT_PUBLIC_NUMA_AGENT_NFT')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
