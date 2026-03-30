import { Plur } from '@plur-ai/core'

let instance: Plur | null = null

export function getPlur(): Plur {
  if (!instance) {
    instance = new Plur({ path: process.env.PLUR_PATH || undefined })
  }
  return instance
}

export function resetPlur(): void {
  instance = null
}
