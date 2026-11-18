import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { initialMemoryState, memoryActions, memoryLeadIn, memoryPosition, memoryReducer, type MemoryMode } from './model'

const documentFor = (id: string) => calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8')))
const events = documentFor('5').events
function begin(mode: MemoryMode = 'recall') { return memoryReducer(initialMemoryState, { type: 'start', mode, targets: events.slice(0, 5) }) }

describe('route memory sessions', () => {
  it('requires reaching a checkpoint and revealing the answer before accepting a self assessment', () => {
    let state = begin()
    expect(memoryReducer(state, { type: 'rate', rating: 'independent' })).toBe(state)
    state = memoryReducer(state, { type: 'arrive' })
    expect(state.phase).toBe('question')
    expect(memoryReducer(state, { type: 'next' })).toBe(state)
    expect(memoryReducer(state, { type: 'rate', rating: 'independent' })).toBe(state)
    state = memoryReducer(state, { type: 'reveal' })
    state = memoryReducer(state, { type: 'rate', rating: 'independent' })
    expect(state.index).toBe(1)
    expect(state.answers).toEqual([{ eventId: events[0].id, rating: 'independent', usedHint: false }])
    expect(memoryReducer(state, { type: 'rate', rating: 'again' })).toBe(state)
  })
  it('keeps used hints from being counted as independent recall after revealing', () => {
    let state = memoryReducer(begin(), { type: 'arrive' })
    for (let i = 0; i < 4; i++) state = memoryReducer(state, { type: 'hint' })
    expect(state.hint).toBe(2)
    state = memoryReducer(state, { type: 'reveal' })
    state = memoryReducer(state, { type: 'rate', rating: 'independent' })
    expect(state.answers[0]).toMatchObject({ rating: 'prompted', usedHint: true })
    expect(state.hint).toBe(0)
  })
  for (const id of ['5', '6', '7']) for (const mode of ['learn', 'recall'] as const) it(`can complete the full published route ${id} in ${mode} mode without generating scores`, () => {
    const targets = documentFor(id).events
    let state = memoryReducer(initialMemoryState, { type: 'start', mode, targets })
    for (let index = 0; index < targets.length; index++) {
      expect(state.index).toBe(index)
      state = memoryReducer(state, { type: 'arrive' })
      if (mode === 'learn') state = memoryReducer(state, { type: 'next' })
      else {
        state = memoryReducer(state, { type: 'reveal' })
        state = memoryReducer(state, { type: 'rate', rating: index % 2 ? 'again' : 'independent' })
      }
    }
    expect(state.phase).toBe('finished')
    expect(state.answers).toHaveLength(mode === 'recall' ? targets.length : 0)
    expect(state.learned).toHaveLength(mode === 'learn' ? targets.length : 0)
    expect(state).not.toHaveProperty('score')
  })
  it('does not count stopping or skipping as completed recall', () => {
    const state = memoryReducer(begin(), { type: 'finish' })
    expect(state.phase).toBe('finished')
    expect(state.answers).toEqual([])
    expect(state.learned).toEqual([])
    expect(memoryReducer(state, { type: 'reset' })).toEqual(initialMemoryState)
  })
  it('does not expose blocked events or accept duplicate, reversed, or mixed route targets', () => {
    expect(memoryReducer(initialMemoryState, { type: 'start', mode: 'recall', targets: [{ ...events[0], blockers: ['待核对'] }] })).toBe(initialMemoryState)
    for (const targets of [[events[0], events[0]], [events[1], events[0]], [events[0], documentFor('6').events[0]]]) {
      expect(memoryReducer(initialMemoryState, { type: 'start', mode: 'recall', targets })).toBe(initialMemoryState)
    }
  })
  it('uses published window starts and keeps replay context within the preceding segment', () => {
    for (const id of ['5', '6', '7']) {
      const targets = documentFor(id).events
      for (const [index, event] of targets.entries()) {
        expect(memoryPosition(event)).toBe(event.windowStartMs)
        expect(memoryLeadIn(targets, event)).toBeGreaterThanOrEqual(targets[index - 1]?.windowStartMs ?? 0)
        expect(memoryLeadIn(targets, event)).toBeLessThanOrEqual(memoryPosition(event))
        expect(memoryActions(event).length).toBeGreaterThan(0)
      }
    }
  })
})
