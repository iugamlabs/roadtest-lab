import { z } from 'zod'
import { isPracticeReady, type CalibratedEvent } from '@/features/content/schema'

export type MemoryMode = 'learn' | 'recall'
export type MemoryRating = 'independent' | 'prompted' | 'again'
export const ratingLabels: Record<MemoryRating, string> = { independent: '自己想起来了', prompted: '提示后想起来了', again: '这段再练一次' }
export interface MemoryAnswer { eventId: string; rating: MemoryRating; usedHint: boolean }
export interface MemoryState {
  mode: MemoryMode
  phase: 'ready' | 'travelling' | 'question' | 'revealed' | 'finished'
  targets: CalibratedEvent[]
  index: number
  hint: number
  answers: MemoryAnswer[]
  learned: string[]
}
export type MemoryAction =
  | { type: 'reset' }
  | { type: 'finish' }
  | { type: 'start'; mode: MemoryMode; targets: CalibratedEvent[] }
  | { type: 'arrive' }
  | { type: 'hint' }
  | { type: 'reveal' }
  | { type: 'rate'; rating: MemoryRating }
  | { type: 'next' }

export const initialMemoryState: MemoryState = { mode: 'learn', phase: 'ready', targets: [], index: 0, hint: 0, answers: [], learned: [] }

function next(state: MemoryState): MemoryState {
  return { ...state, index: state.index + 1, hint: 0, phase: state.index + 1 < state.targets.length ? 'travelling' : 'finished' }
}

export function memoryReducer(state: MemoryState, action: MemoryAction): MemoryState {
  const event = state.targets[state.index]
  switch (action.type) {
    case 'reset': return initialMemoryState
    case 'finish': return state.phase === 'ready' ? state : { ...state, phase: 'finished' }
    case 'start': {
      // Memory uses the same publication boundary; excluded events never become prompts.
      const targets = action.targets.filter(isPracticeReady)
      if (!targets.length || new Set(targets.map(item => item.id)).size !== targets.length
        || targets.some((item, index) => item.id[0] !== targets[0].id[0] || index > 0 && item.windowStartMs < targets[index - 1].windowStartMs)) return state
      return { ...initialMemoryState, mode: action.mode, targets, phase: 'travelling' }
    }
    case 'arrive': return state.phase === 'travelling' ? { ...state, phase: state.mode === 'learn' ? 'revealed' : 'question' } : state
    case 'hint': return state.phase === 'question' ? { ...state, hint: Math.min(2, state.hint + 1) } : state
    case 'reveal': return state.phase === 'question' ? { ...state, phase: 'revealed' } : state
    case 'rate': {
      if (state.phase !== 'revealed' || state.mode !== 'recall' || !event) return state
      const rating = action.rating === 'independent' && state.hint > 0 ? 'prompted' : action.rating
      return next({ ...state, answers: [...state.answers, { eventId: event.id, rating, usedHint: state.hint > 0 }] })
    }
    case 'next': return state.phase === 'revealed' && state.mode === 'learn' && event ? next({ ...state, learned: [...state.learned, event.id] }) : state
  }
}

export function memoryPosition(event: CalibratedEvent) { return event.windowStartMs }

// A short lead-in retains real road context. It is a replay length, never a response limit.
export function memoryLeadIn(events: CalibratedEvent[], event: CalibratedEvent) {
  const previous = events[events.findIndex(item => item.id === event.id) - 1]
  return previous ? Math.max(previous.windowStartMs, memoryPosition(event) - 12_000) : 0
}

export function memoryActions(event: CalibratedEvent): string[] {
  const turn = event.direction === 'left' ? '左' : '右'
  switch (event.kind) {
    case 'brake': return ['观察前方交通', '平顺减速，确认安全后继续']
    case 'straight': return ['观察前方，保持视野开阔', '保持直线行驶']
    case 'stop-and-observe': return ['减速并停稳', '观察左右交通，确认安全后继续']
    case 'overtake': return ['左转向灯，观察左后方，确认安全后驶出', '完成后关闭转向灯', '右转向灯，观察右后方，确认安全后返回', '完成后关闭转向灯']
    case 'parking': return ['右转向灯，观察右后方，平顺减速', '确认安全后靠边停稳，关闭转向灯', '停稳后挂 P 挡、拉驻车制动']
    case 'lane-change': return [`打开${turn}转向灯，观察${turn}后方`, '确认安全后变道，完成后关闭转向灯']
    case 'turn': return [`打开${turn}转向灯，观察交通并减速`, `确认安全后${turn}转，完成后关闭转向灯`]
    case 'uturn': return [`打开${turn}转向灯，观察交通并减速`, '确认安全后掉头，完成后关闭转向灯']
  }
}

export const memoryRatingSchema = z.enum(['independent', 'prompted', 'again'])
