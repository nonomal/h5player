import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { SITE_ADAPTER_DEFINITIONS } from '../src/adapters/sites'

type ReportEntry = {
  readonly id: string
  readonly version: string
  readonly tier: 1 | 2
  readonly supportLevel: 'preview' | 'best-effort'
  readonly owner: string
  readonly fixture: string
  readonly lastVerified: string
  readonly fixturePresent: boolean
  readonly fixtureSha256: string | null
  readonly status: 'fixture-verified' | 'fixture-missing'
}

type BaselineEntry = Pick<
  ReportEntry,
  | 'id'
  | 'version'
  | 'tier'
  | 'supportLevel'
  | 'owner'
  | 'fixture'
  | 'lastVerified'
  | 'fixtureSha256'
>

const DAY_MS = 24 * 60 * 60 * 1_000
const MAX_VERIFICATION_AGE_DAYS = 183

function verificationTimestamp(value: string, id: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid verification date: ${id}`)
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid verification date: ${id}`)
  }
  return timestamp
}

function assertCatalog(): void {
  const ids = new Set<string>()
  for (const definition of SITE_ADAPTER_DEFINITIONS) {
    if (ids.has(definition.id)) throw new Error(`Duplicate adapter id: ${definition.id}`)
    ids.add(definition.id)
    if (definition.owner.trim() === '') throw new Error(`Missing owner: ${definition.id}`)
    const verifiedAt = verificationTimestamp(definition.lastVerified, definition.id)
    const ageDays = Math.floor((Date.now() - verifiedAt) / DAY_MS)
    // Allow one calendar day of timezone skew between a maintainer's local date
    // and a UTC CI runner, but reject genuinely future-dated evidence.
    if (ageDays < -1) {
      throw new Error(`Verification date is in the future: ${definition.id}`)
    }
    if (ageDays > MAX_VERIFICATION_AGE_DAYS) {
      throw new Error(`Site adapter verification is stale (${ageDays} days): ${definition.id}`)
    }
  }
}

async function main(): Promise<void> {
  assertCatalog()
  const baselinePath = path.resolve('tests/baselines/site-adapters.json')
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as {
    readonly schemaVersion: number
    readonly evidenceBoundary: string
    readonly liveSmoke: string
    readonly entries: readonly BaselineEntry[]
  }
  if (baseline.schemaVersion !== 1) throw new Error('Unsupported adapter baseline schema')
  if (
    baseline.evidenceBoundary !== 'sanitized-fixture-only' ||
    baseline.liveSmoke !== 'not-verified'
  ) {
    throw new Error('Adapter baseline overstates its verification boundary')
  }
  const baselineById = new Map(baseline.entries.map((entry) => [entry.id, entry]))
  const entries: ReportEntry[] = []
  for (const definition of SITE_ADAPTER_DEFINITIONS) {
    const fixture = path.resolve('tests/fixtures/sites', definition.fixture)
    let fixturePresent = true
    let fixtureSha256: string | null = null
    try {
      const content = await readFile(fixture)
      fixtureSha256 = createHash('sha256').update(content).digest('hex')
    } catch {
      fixturePresent = false
    }
    entries.push({
      id: definition.id,
      version: definition.version,
      tier: definition.tier,
      supportLevel: definition.supportLevel,
      owner: definition.owner,
      fixture: definition.fixture,
      lastVerified: definition.lastVerified,
      fixturePresent,
      fixtureSha256,
      status: fixturePresent ? 'fixture-verified' : 'fixture-missing'
    })
    const expected = baselineById.get(definition.id)
    if (
      expected === undefined ||
      expected.version !== definition.version ||
      expected.tier !== definition.tier ||
      expected.supportLevel !== definition.supportLevel ||
      expected.owner !== definition.owner ||
      expected.fixture !== definition.fixture ||
      expected.lastVerified !== definition.lastVerified ||
      expected.fixtureSha256 !== fixtureSha256
    ) {
      throw new Error(
        `Adapter catalog drift requires an explicit baseline update: ${definition.id}`
      )
    }
  }
  if (baseline.entries.length !== entries.length) {
    throw new Error('Adapter baseline/catalog entry count differs')
  }

  const missing = entries.filter((entry) => !entry.fixturePresent)
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evidenceBoundary: 'sanitized-fixture-only',
    liveSmoke: 'not-verified',
    entries
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (missing.length > 0) {
    throw new Error(`Missing site adapter fixtures: ${missing.map((entry) => entry.id).join(', ')}`)
  }
}

void main()
