import { describe, expect, it } from 'vitest'
import { createExam, examReducer } from './engine'
import { HISTORY_KEY, readHistory, resultFrom, resultSchema, saveResult } from './storage'

function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
function result(id = 'session') {
  const running = examReducer(createExam('5', 42, 0, false), { type: 'start', now: 0 })
  return resultFrom(examReducer(running, { type: 'abort', now: 0 }), id, '2026-11-13T12:00:00.000Z')
}
describe('local examination records', () => {
  it('stores the most recent 12 results, deduplicates IDs and roundtrips source seed and logs', () => {
    const storage = memoryStorage()
    for (let index = 0; index < 15; index++) expect(saveResult(storage, result(`session-${index}`))).toBe(true)
    const records = readHistory(storage)
    expect(records).toHaveLength(12)
    expect(records[0]).toEqual(result('session-14'))
    saveResult(storage, result('session-14'))
    expect(readHistory(storage)).toHaveLength(12)
  })
  it('ignores corrupted records, unknown rule versions and invalid vehicle snapshots', () => {
    const storage = memoryStorage()
    storage.setItem(HISTORY_KEY, JSON.stringify([{ ...result('invalid'), score: 90 }, result('valid'), { ...result('future'), version: 'unknown' }]))
    expect(readHistory(storage).map(record => record.id)).toEqual(['valid'])
    storage.setItem(HISTORY_KEY, 'invalid json')
    expect(readHistory(storage)).toEqual([])
  })
  it('validates score consistency, result outcomes and numeric boundaries', () => {
    expect(resultSchema.safeParse({ ...result(), score: 90 }).success).toBe(false)
    expect(resultSchema.safeParse({ ...result(), seed: -1 }).success).toBe(false)
    expect(resultSchema.safeParse({ ...result(), elapsedMs: Infinity }).success).toBe(false)
    expect(resultSchema.safeParse({ ...result(), outcome: 'failed' }).success).toBe(false)
    expect(() => resultFrom(createExam('5', 0), 'not-finished')).toThrow()
  })
  it('handles unavailable or full storage without losing the on-screen result', () => {
    const storage = { getItem: () => { throw Error('denied') }, setItem: () => { throw Error('quota') } }
    expect(readHistory(storage)).toEqual([])
    expect(saveResult(storage, result())).toBe(false)
  })
})
