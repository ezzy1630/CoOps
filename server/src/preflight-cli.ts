/**
 * Reads the four Go/No-Go gates from a running CoOps server. It asks the server
 * rather than measuring locally because the server is what holds the OAuth
 * grant and the event log the gates are decided on.
 *
 *   npm --prefix server run preflight [-- --json] [http://host:port]
 *
 * Exit code: 0 go · 1 hold or no-go · 2 no server answered.
 */
import { formatGateReport, type GateReport } from './preflight.js'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const base = args.find(arg => !arg.startsWith('--')) ?? process.env.COOPS_SERVER_URL ?? 'http://localhost:8080'

let response: Response
try {
  response = await fetch(new URL('/preflight', base))
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err)
  console.error(`preflight: no CoOps server answered at ${base} (${reason}).`)
  console.error('Start it with `npm --prefix server run dev`, then run the preflight again.')
  process.exit(2)
}

if (!response.ok) {
  console.error(`preflight: ${base} answered ${response.status} ${response.statusText}.`)
  process.exit(2)
}

const report = (await response.json()) as GateReport
console.log(asJson ? JSON.stringify(report, null, 2) : formatGateReport(report))
process.exit(report.verdict === 'go' ? 0 : 1)
