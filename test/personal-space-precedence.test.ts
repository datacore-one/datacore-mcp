import { expect, it } from 'vitest'
import { personalSpace } from '../src/space-catalog.js'

/**
 * Regression: this installation has TWO spaces typed personal -- 0-personal
 * (name `personal`) and 9-practice (name `practice`). personalSpace() used to
 * return null for anything other than exactly one candidate, which disabled
 * journal, capture and ingest outright: datacore_status reported 0 entries and
 * 0 knowledge notes on a store holding 208 and 11,926.
 *
 * Every existing test passed and CI was green, because no fixture used a
 * layout with two personal spaces. That is the gap this file closes.
 */
const space = (name: string, type: string, marked = true) => ({
  name, type, marked, rootPath: `/r/${name}`, journalPath: '', knowledgePath: '',
})

it('applies precedence when several spaces are typed personal', () => {
  const spaces = [
    space('inbox', 'meta'),
    space('personal', 'personal'),
    space('datafund', 'team'),
    space('practice', 'personal'),
  ]
  const chosen = personalSpace(spaces as never)
  expect(chosen).not.toBeNull()
  expect(chosen!.name).toBe('personal')
})

it('still refuses genuine ambiguity', () => {
  // Two candidates both claiming the canonical name is not precedence, it is
  // a misconfiguration, and picking one would silently route private writes.
  const spaces = [space('personal', 'personal'), space('personal', 'personal')]
  expect(personalSpace(spaces as never)).toBeNull()
})

it('keeps the single-candidate and legacy-unmarked cases', () => {
  expect(personalSpace([space('self', 'personal')] as never)!.name).toBe('self')
  expect(personalSpace([space('personal', 'other', false)] as never)!.name).toBe('personal')
})
