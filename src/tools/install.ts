// src/tools/install.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as os from 'os'
import { execSync } from 'child_process'
import { verifyPackChecksum } from '../trust.js'
import registry from '../../registry/packs.json'

interface InstallArgs {
  source: string
}

interface InstallResult {
  success: boolean
  pack_id?: string
  upgraded?: boolean
  already_current?: boolean
  checksum_verified?: boolean
  error?: string
}

export async function handleInstall(args: InstallArgs, packsDir: string): Promise<InstallResult> {
  let srcDir = args.source

  // Detect URL source — download to temp, extract, use as srcDir
  if (srcDir.startsWith('http://') || srcDir.startsWith('https://')) {
    const downloaded = await downloadPack(srcDir)
    if (downloaded.error) return { success: false, error: downloaded.error }
    srcDir = downloaded.path!
  }

  // Validate source has SKILL.md
  const skillPath = path.join(srcDir, 'SKILL.md')
  if (!fs.existsSync(skillPath)) {
    return { success: false, error: 'No SKILL.md found in source directory' }
  }

  // Parse SKILL.md frontmatter to get pack ID and version
  const skillContent = fs.readFileSync(skillPath, 'utf8')
  const frontmatterMatch = skillContent.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) {
    return { success: false, error: 'No YAML frontmatter in SKILL.md' }
  }

  const manifest = yaml.load(frontmatterMatch[1]) as Record<string, any>
  const packId = manifest?.['x-datacore']?.id
  const newVersion = manifest?.version

  if (!packId) {
    return { success: false, error: 'Missing x-datacore.id in SKILL.md frontmatter' }
  }

  const destDir = path.join(packsDir, packId)

  // Check if already installed
  if (fs.existsSync(path.join(destDir, 'SKILL.md'))) {
    const existingContent = fs.readFileSync(path.join(destDir, 'SKILL.md'), 'utf8')
    const existingMatch = existingContent.match(/version:\s*["']?([^"'\n]+)/)
    const existingVersion = existingMatch?.[1]

    if (existingVersion === newVersion) {
      return { success: true, pack_id: packId, already_current: true }
    }

    // Upgrade: remove old, copy new
    fs.rmSync(destDir, { recursive: true, force: true })
    fs.cpSync(srcDir, destDir, { recursive: true })
    return { success: true, pack_id: packId, upgraded: true }
  }

  // Fresh install
  fs.cpSync(srcDir, destDir, { recursive: true })

  // Verify checksum if registry has one
  const checksumVerified = verifyInstalledChecksum(packId, destDir)
  return { success: true, pack_id: packId, checksum_verified: checksumVerified ?? undefined }
}

function verifyInstalledChecksum(packId: string, destDir: string): boolean | null {
  const registryPack = (registry.packs as Array<{ id: string; checksum?: string }>).find(p => p.id === packId)
  if (!registryPack?.checksum) return null
  const result = verifyPackChecksum(destDir, registryPack.checksum)
  return result.valid
}

async function downloadPack(url: string): Promise<{ path?: string; error?: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datacore-pack-'))

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) return { error: `Download failed: HTTP ${res.status}` }

    const buffer = Buffer.from(await res.arrayBuffer())
    const archivePath = path.join(tmpDir, 'pack.tar.gz')
    fs.writeFileSync(archivePath, buffer)

    // Extract .tar.gz
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir)
    execSync(`tar xzf ${JSON.stringify(archivePath)} -C ${JSON.stringify(extractDir)}`, { timeout: 10000 })

    // Find the pack root (directory containing SKILL.md)
    const packRoot = findPackRoot(extractDir)
    if (!packRoot) return { error: 'Downloaded archive does not contain SKILL.md' }

    return { path: packRoot }
  } catch (err) {
    return { error: `Download failed: ${err instanceof Error ? err.message : err}` }
  }
}

function findPackRoot(dir: string): string | null {
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return dir
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const found = findPackRoot(path.join(dir, entry.name))
      if (found) return found
    }
  }
  return null
}
