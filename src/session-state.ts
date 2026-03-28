// src/session-state.ts

interface ToolCallRecord {
  tool: string
  args_keys: string
  timestamp: string
}

export class SessionBreadcrumbs {
  private toolCalls: ToolCallRecord[] = []
  private engramsRecalled: string[] = []

  recordToolCall(tool: string, args: Record<string, unknown>): void {
    this.toolCalls.push({
      tool,
      args_keys: Object.keys(args).join(', '),
      timestamp: new Date().toISOString(),
    })
  }

  recordEngramRecalled(engramId: string): void {
    if (!this.engramsRecalled.includes(engramId)) {
      this.engramsRecalled.push(engramId)
    }
  }

  getToolCalls(): ToolCallRecord[] {
    return this.toolCalls
  }

  getEngramsRecalled(): string[] {
    return this.engramsRecalled
  }

  generateContinuationContext(): string {
    if (this.toolCalls.length === 0 && this.engramsRecalled.length === 0) return ''

    const lines: string[] = []

    if (this.toolCalls.length > 0) {
      const uniqueTools = [...new Set(this.toolCalls.map(tc => tc.tool))]
      lines.push(`Tools used: ${uniqueTools.join(', ')}`)
      lines.push(`Total tool calls: ${this.toolCalls.length}`)
    }

    if (this.engramsRecalled.length > 0) {
      lines.push(`Engrams recalled: ${this.engramsRecalled.length}`)
    }

    return lines.join('\n')
  }
}
