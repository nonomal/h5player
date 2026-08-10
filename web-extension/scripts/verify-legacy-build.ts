import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

type LegacyBaseline = {
  yarnVersion: string
  artifact: string
  sha256: string
  bytes: number
}

const execFileAsync = promisify(execFile)
const extensionRoot = process.cwd()
const repositoryRoot = path.resolve(extensionRoot, '..')
const baselinePath = path.resolve(extensionRoot, 'tests/baselines/legacy-userscript.json')
const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as LegacyBaseline

await execFileAsync('corepack', [`yarn@${baseline.yarnVersion}`, 'build'], {
  cwd: repositoryRoot,
  maxBuffer: 10 * 1024 * 1024
})

const artifactPath = path.resolve(repositoryRoot, baseline.artifact)
const artifact = await readFile(artifactPath)
const artifactStat = await stat(artifactPath)
const sha256 = createHash('sha256').update(artifact).digest('hex')

if (sha256 !== baseline.sha256 || artifactStat.size !== baseline.bytes) {
  throw new Error(
    `Legacy artifact changed: expected ${baseline.sha256}/${baseline.bytes}, got ${sha256}/${artifactStat.size}`
  )
}

await execFileAsync('git', ['diff', '--exit-code', '--', baseline.artifact], {
  cwd: repositoryRoot
})

console.log(`Legacy build verified: ${baseline.artifact} ${sha256} (${artifactStat.size} bytes)`)
