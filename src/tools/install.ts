// src/tools/install.ts
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'

interface InstallArgs {
  source: string
}

interface InstallResult {
  success: boolean
  pack_id?: string
  upgraded?: boolean
  already_current?: boolean
  error?: string
}

export async function handleInstall(args: InstallArgs, packsDir: string): Promise<InstallResult> {
  const srcDir = args.source

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
  return { success: true, pack_id: packId }
}
