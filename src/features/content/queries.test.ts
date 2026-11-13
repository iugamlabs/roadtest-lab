import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { eventsQueryOptions } from './queries'
import type { RouteId } from './schema'

afterEach(() => vi.unstubAllGlobals())
const documentFor = (id: string) => JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8'))
async function load(id: RouteId) {
  const options = eventsQueryOptions(id)
  // Query invokes this with context; the query itself does not depend on context.
  const queryFn = options.queryFn as () => Promise<unknown>
  return queryFn()
}
describe('practice event loading boundary', () => {
  for (const id of ['5', '6', '7'] as const) it(`loads published route ${id} data with empty scoring events`, async () => {
    const doc = documentFor(id)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => doc })))
    expect(await load(id)).toEqual(doc)
    expect(fetch).toHaveBeenCalledWith(`/data/route-${id}.events.json`)
  })
  it('rejects failures and mismatched route documents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    await expect(load('5')).rejects.toThrow('暂时无法读取')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => documentFor('7') })))
    await expect(load('5')).rejects.toThrow('不一致')
  })
  it('rejects blocked events and any attempt to attach scoring events', async () => {
    const doc = documentFor('5')
    doc.events[0].blockers.push('等待复核')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => doc })))
    await expect(load('5')).rejects.toThrow()
    const scored = documentFor('5')
    scored.examEvents.push(scored.events[0])
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => scored })))
    await expect(load('5')).rejects.toThrow()
  })
})
