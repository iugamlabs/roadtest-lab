import type { QuizQuestion } from './bank'

export const UNKNOWN_ANSWER = 'unknown'
export interface QuizAnswer { questionId: string; selected: string; usedHint: boolean }
export interface RouteQuizState {
  phase: 'ready' | 'answering' | 'submitted' | 'finished'
  questions: QuizQuestion[]
  index: number
  selected: string | null
  usedHint: boolean
  frameReady: boolean
  answers: QuizAnswer[]
}
export type RouteQuizAction =
  | { type: 'start'; questions: QuizQuestion[] }
  | { type: 'frame-ready'; questionId: string; ready: boolean }
  | { type: 'select'; selected: string }
  | { type: 'hint' }
  | { type: 'submit' }
  | { type: 'next' }
  | { type: 'finish' }
  | { type: 'reset' }

export const initialRouteQuizState: RouteQuizState = { phase: 'ready', questions: [], index: 0, selected: null, usedHint: false, frameReady: false, answers: [] }

export function routeQuizReducer(state: RouteQuizState, action: RouteQuizAction): RouteQuizState {
  const question = state.questions[state.index]
  switch (action.type) {
    case 'reset': return initialRouteQuizState
    case 'start': {
      if (!action.questions.length || action.questions.length > 5 || new Set(action.questions.map(item => item.id)).size !== action.questions.length) return state
      return { ...initialRouteQuizState, phase: 'answering', questions: action.questions, frameReady: action.questions[0].kind === 'sequence' }
    }
    case 'frame-ready': return question?.id === action.questionId && question.kind === 'direction' && state.phase === 'answering' ? { ...state, frameReady: action.ready } : state
    case 'select': return state.phase === 'answering' && state.frameReady && (action.selected === UNKNOWN_ANSWER || question?.options.some(option => option.id === action.selected)) ? { ...state, selected: action.selected } : state
    case 'hint': return state.phase === 'answering' && state.frameReady ? { ...state, usedHint: true } : state
    case 'submit': {
      if (state.phase !== 'answering' || !question || !state.frameReady || state.selected === null) return state
      return { ...state, phase: 'submitted', answers: [...state.answers, { questionId: question.id, selected: state.selected, usedHint: state.usedHint }] }
    }
    case 'next': {
      if (state.phase !== 'submitted') return state
      if (state.index + 1 >= state.questions.length) return { ...state, phase: 'finished' }
      const index = state.index + 1
      return { ...state, phase: 'answering', index, selected: null, usedHint: false, frameReady: state.questions[index].kind === 'sequence' }
    }
    case 'finish': return state.phase === 'ready' ? state : { ...state, phase: 'finished' }
  }
}

export type QuizOutcome = 'independent' | 'assisted' | 'wrong' | 'unknown' | 'unanswered'
export function quizOutcome(question: QuizQuestion, answer?: QuizAnswer): QuizOutcome {
  if (!answer) return 'unanswered'
  if (answer.selected === UNKNOWN_ANSWER) return 'unknown'
  if (answer.selected !== question.correct) return 'wrong'
  return answer.usedHint ? 'assisted' : 'independent'
}
export const quizOutcomeLabels: Record<QuizOutcome, string> = { independent: '独立答对', assisted: '提示后答对', wrong: '答错了', unknown: '想不起来', unanswered: '未作答' }
export function summarizeQuiz(questions: QuizQuestion[], answers: QuizAnswer[]) {
  const counts = { independent: 0, assisted: 0, wrong: 0, unknown: 0, unanswered: 0 }
  for (const question of questions) counts[quizOutcome(question, answers.find(answer => answer.questionId === question.id))]++
  return counts
}
// Running rounds expose only submission state, never correctness or running scores.
export function finishedQuizSummary(state: RouteQuizState) {
  return state.phase === 'finished' ? summarizeQuiz(state.questions, state.answers) : null
}
