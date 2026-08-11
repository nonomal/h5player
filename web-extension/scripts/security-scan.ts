import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const sourceRoots = ['entrypoints', 'src']
const outputRoots = ['.output/chrome-mv3', '.output/firefox-mv3']
const roots = [...sourceRoots, ...outputRoots]
const forbidden = [
  { label: 'eval', pattern: /\beval\s*\(/i },
  { label: 'Function constructor', pattern: /\b(?:new\s+)?Function\s*\(/ },
  { label: 'javascript data URI', pattern: /data:\s*text\/javascript/i },
  { label: 'remote executable script', pattern: /https?:\/\/[^\s'"`]+\.m?js(?:[?#][^\s'"`]*)?/i },
  { label: 'unsafe-eval', pattern: /unsafe-eval/i },
  { label: 'CSP relaxation', pattern: /declarativeNetRequest|webRequestBlocking/i }
]
const sourceOnlyForbidden = [
  { label: 'business innerHTML assignment', pattern: /\.innerHTML\s*=/ },
  { label: 'legacy runtime import', pattern: /(?:inject(?:\.base|\.main)?\.js|src\/h5player)/ }
]
const allowedPermissions = new Set(['storage', 'activeTab', 'scripting'])
const allowedOptionalHostPermissions = new Set(['<all_urls>'])
const allowedFixtureMatches = new Set(['http://localhost/*', 'http://127.0.0.1/*'])

async function collectFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const filePath = path.join(directory, entry.name)
      if (entry.isDirectory()) files.push(...(await collectFiles(filePath)))
      else if (/\.(?:ts|tsx|vue|js|mjs|html|json)$/.test(entry.name)) files.push(filePath)
    }
    return files
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null
}

function checkAllowedSet(
  values: string[] | null,
  allowed: ReadonlySet<string>,
  label: string,
  manifestPath: string,
  violations: string[]
): void {
  if (!values) {
    violations.push(`${label} is not a string array: ${manifestPath}`)
    return
  }
  for (const value of values) {
    if (!allowed.has(value)) violations.push(`${label} contains ${value}: ${manifestPath}`)
  }
}

async function inspectManifest(manifestPath: string, violations: string[]): Promise<boolean> {
  let source: string
  try {
    source = await readFile(manifestPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    violations.push(`manifest cannot be read: ${manifestPath}`)
    return false
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(source) as unknown
  } catch {
    violations.push(`manifest cannot be parsed: ${manifestPath}`)
    return true
  }
  const manifest = asRecord(parsed)
  if (!manifest || manifest['manifest_version'] !== 3) {
    violations.push(`manifest is not MV3: ${manifestPath}`)
    return true
  }

  checkAllowedSet(
    stringArray(manifest['permissions']),
    allowedPermissions,
    'permissions',
    manifestPath,
    violations
  )
  checkAllowedSet(
    stringArray(manifest['optional_host_permissions']),
    allowedOptionalHostPermissions,
    'optional_host_permissions',
    manifestPath,
    violations
  )
  if (manifest['host_permissions'] !== undefined) {
    violations.push(`unexpected host_permissions: ${manifestPath}`)
  }

  const contentScripts = Array.isArray(manifest['content_scripts'])
    ? manifest['content_scripts']
    : []
  for (const entry of contentScripts) {
    const matches = stringArray(asRecord(entry)?.['matches'])
    checkAllowedSet(
      matches,
      allowedFixtureMatches,
      'content script matches',
      manifestPath,
      violations
    )
  }

  const accessibleResources = Array.isArray(manifest['web_accessible_resources'])
    ? manifest['web_accessible_resources']
    : []
  for (const entry of accessibleResources) {
    const record = asRecord(entry)
    checkAllowedSet(
      stringArray(record?.['matches']),
      allowedFixtureMatches,
      'web accessible resource matches',
      manifestPath,
      violations
    )
    const resources = stringArray(record?.['resources'])
    if (!resources || resources.some((resource) => resource !== 'page-main.js')) {
      violations.push(`unexpected web accessible resource: ${manifestPath}`)
    }
  }

  const serialized = JSON.stringify(manifest)
    .replaceAll('http://localhost/*', '')
    .replaceAll('http://127.0.0.1/*', '')
  if (/unsafe-eval|https?:\/\//i.test(serialized)) {
    violations.push(`manifest contains unsafe CSP or remote URL: ${manifestPath}`)
  }
  return true
}

const files = (await Promise.all(roots.map((root) => collectFiles(root)))).flat()
const sourceFiles = (await Promise.all(sourceRoots.map((root) => collectFiles(root)))).flat()
const violations: string[] = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push(`${rule.label}: ${file}`)
  }
}

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8')
  for (const rule of sourceOnlyForbidden) {
    if (rule.pattern.test(source)) violations.push(`${rule.label}: ${file}`)
  }
}

let manifestsInspected = 0
for (const root of outputRoots) {
  if (await inspectManifest(path.join(root, 'manifest.json'), violations)) manifestsInspected += 1
}

if (violations.length > 0) {
  console.error('Security scan failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(
    `Security scan passed (${files.length} files and ${manifestsInspected} manifests inspected).`
  )
}
