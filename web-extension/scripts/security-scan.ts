import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const roots = ['entrypoints', 'src', '.output/chrome-mv3', '.output/firefox-mv3']
const forbidden = [
  { label: 'eval', pattern: /\beval\s*\(/i },
  { label: 'Function constructor', pattern: /\b(?:new\s+)?Function\s*\(/ },
  { label: 'javascript data URI', pattern: /data:\s*text\/javascript/i },
  { label: 'remote executable script', pattern: /https?:\/\/[^\s'"`]+\.m?js(?:[?#][^\s'"`]*)?/i },
  { label: 'unsafe-eval', pattern: /unsafe-eval/i },
  { label: 'CSP relaxation', pattern: /declarativeNetRequest|webRequestBlocking/i }
]

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

const files = (await Promise.all(roots.map((root) => collectFiles(root)))).flat()
const violations: string[] = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) violations.push(`${rule.label}: ${file}`)
  }
}

if (violations.length > 0) {
  console.error('Security scan failed:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log(`Security scan passed (${files.length} files inspected).`)
}
