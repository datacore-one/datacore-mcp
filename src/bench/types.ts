export const SCHEMA_VERSION = '1.0'

export interface ToolCallLog {
  tool: string
  timestamp: string
  duration_ms: number
  input_size: number   // estimated tokens (chars/4 approximation)
  output_size: number  // estimated tokens (chars/4 approximation)
  success: boolean
  error?: string
}

export interface FeedbackLog {
  engram_id: string
  rating: 'positive' | 'negative' | 'neutral'
  timestamp: string
}

export interface SessionLog {
  schema_version: string
  session_id: string
  started_at: string
  ended_at: string | null
  duration_ms: number
  model: string
  datacore_version: string
  tool_calls: ToolCallLog[]
  engrams_injected: string[]
  engrams_created: string[]
  feedback: FeedbackLog[]
}
