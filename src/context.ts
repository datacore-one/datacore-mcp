import { AsyncLocalStorage } from 'async_hooks'

interface RequestContext {
  actor: string | undefined
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
export const getActor = (): string | undefined => requestContext.getStore()?.actor
