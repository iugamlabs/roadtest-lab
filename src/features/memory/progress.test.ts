import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { readMemoryProgress, recordMemoryAnswer, saveMemoryProgress, type MemorySource } from './progress'

const source = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync('public/data/route-5.events.json', 'utf8')))
function storage() {
  const data = new Map<string, string>()
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}
const answer = { eventId: source.events[0].id, rating: 'again' as const, usedHint: false }

describe('local route memory progress', () => {
  it('persists the latest assessment per event and increments attempts rather than inventing mastery', () => {
    const local = storage()
    let entries = recordMemoryAnswer([], answer, 1000)
    entries = recordMemoryAnswer(entries, { ...answer, rating: 'independent' }, 2000)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ rating: 'independent', attempts: 2, updatedAt: 2000 })
    expect(saveMemoryProgress(local, source, entries)).toBe(true)
    expect(readMemoryProgress(local, source)).toEqual({ entries, notice: '' })
  })
  it('does not reuse records after source fingerprints change or in another route', () => {
    const local = storage()
    saveMemoryProgress(local, source, recordMemoryAnswer([], answer))
    for (const next of [{ ...source, videoSha256: 'a'.repeat(64) }, { ...source, subtitleSha256: 'b'.repeat(64) }, { ...source, events: source.events.map((event, index) => index === 0 ? { ...event, guidance: '更新后的教学对照' } : event) }]) {
      expect(readMemoryProgress(local, next).entries).toEqual([])
      expect(readMemoryProgress(local, next).notice).toContain('更新')
    }
    const six = { ...source, routeId: '6' } as MemorySource
    local.data.set('roadtest.route-memory.v1.6', local.data.get('roadtest.route-memory.v1.5')!)
    expect(readMemoryProgress(local, six).entries).toEqual([])
  })
  it('rejects damaged, duplicate and inconsistent records, and filters removed event ids', () => {
    const local = storage()
    const key = 'roadtest.route-memory.v1.5'
    local.data.set(key, '{broken')
    expect(readMemoryProgress(local, source).notice).not.toBe('')
    const entries = recordMemoryAnswer([], answer)
    expect(saveMemoryProgress(local, source, [...entries, ...entries])).toBe(false)
    expect(saveMemoryProgress(local, source, [{ ...entries[0], usedHint: true, rating: 'independent' }])).toBe(false)
    expect(saveMemoryProgress(local, source, [{ ...entries[0], eventId: '6-exit-look' }])).toBe(false)
    saveMemoryProgress(local, source, [{ ...entries[0], eventId: '5-no-longer-published' }])
    expect(readMemoryProgress(local, source).entries).toEqual([])
  })
  it('keeps hint-assisted recall honest and handles unavailable or full storage', () => {
    const entries = recordMemoryAnswer([], { ...answer, rating: 'independent', usedHint: true })
    expect(entries[0].rating).toBe('prompted')
    expect(readMemoryProgress({ getItem: () => { throw new Error('blocked') } }, source).entries).toEqual([])
    expect(saveMemoryProgress({ setItem: () => { throw new Error('full') } }, source, entries)).toBe(false)
  })
})
