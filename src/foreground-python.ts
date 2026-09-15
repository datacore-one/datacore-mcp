/** Bound a foreground Python request, including descendants holding its pipes.
 * Deliberate process-group escapes require the deployment's OS service boundary.
 */
import { spawn } from 'child_process'

export function runForegroundPython(command: string, args: string[], input: string): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn(command, args, { detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let size = 0
    let failed = false
    let closed = false
    let cleaned = false
    let settled = false
    let exitCode: number | null = null
    let cleanup: ReturnType<typeof setTimeout> | undefined
    let forcedClose: ReturnType<typeof setTimeout> | undefined
    const terminate = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try {
        if (process.platform === 'win32') child.kill(signal)
        else process.kill(-child.pid, signal)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failed = true
      }
    }
    const finish = () => {
      if (settled || !closed || !cleaned) return
      settled = true
      clearTimeout(deadline)
      if (cleanup) clearTimeout(cleanup)
      if (forcedClose) clearTimeout(forcedClose)
      resolve(!failed && exitCode === 0 ? Buffer.concat(chunks).toString('utf8') : null)
    }
    const deadline = setTimeout(() => {
      failed = true
      terminate('SIGKILL')
      // A child escaping the process group must not pin this client forever.
      // Its service/cgroup remains responsible for independent containment.
      forcedClose = setTimeout(() => {
        child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy()
        closed = cleaned = true
        finish()
      }, 1000)
    }, 30000)
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 512 * 1024) { failed = true; terminate('SIGKILL') }
      else chunks.push(chunk)
    })
    child.stderr.resume() // Drain without retaining or exposing provider text.
    child.once('error', () => { failed = true; closed = cleaned = true; finish() })
    child.once('exit', code => {
      exitCode = code
      terminate('SIGTERM')
      cleanup = setTimeout(() => { terminate('SIGKILL'); cleaned = true; finish() }, 100)
    })
    child.once('close', () => { closed = true; finish() })
    child.stdin.on('error', () => { failed = true; terminate('SIGKILL') })
    child.stdin.end(input)
  })
}
