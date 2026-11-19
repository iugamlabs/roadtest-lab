import { QUIZ_ROUND_SIZE, type QuizQuestion } from './bank'

export const UNKNOWN_ANSWER = 'unknown'
export interface QuizAnswer { questionId: string; selected: string; usedHint: boolean }
export interface RouteQuizState {
  phase: 'ready' | 'answering' | 'finished'
  questions: QuizQuestion[]
  index: number
  selected: string | null
  frameReady: boolean
  optionsVisible: boolean
  answers: QuizAnswer[]
}
export type RouteQuizAction =
  | { type: 'start'; questions: QuizQuestion[] }
  | { type: 'frame-ready'; questionId: string; ready: boolean }
  | { type: 'reveal-options' }
  | { type: 'select'; selected: string }
  | { type: 'submit' }
  | { type: 'finish' }
  | { type: 'reset' }

export const initialRouteQuizState: RouteQuizState = { phase: 'ready', questions: [], index: 0, selected: null, frameReady: false, optionsVisible: false, answers: [] }

const needsMedia = (question: QuizQuestion) => Boolean(question.frame || question.clip)

export function routeQuizReducer(state: RouteQuizState, action: RouteQuizAction): RouteQuizState {
  const question = state.questions[state.index]
  switch (action.type) {
    case 'reset': return initialRouteQuizState
    case 'start': {
      if (!action.questions.length || action.questions.length > QUIZ_ROUND_SIZE || new Set(action.questions.map(item => item.id)).size !== action.questions.length) return state
      return { ...initialRouteQuizState, phase: 'answering', questions: action.questions, frameReady: !needsMedia(action.questions[0]) }
    }
    case 'frame-ready': return question?.id === action.questionId && needsMedia(question) && state.phase === 'answering' ? { ...state, frameReady: action.ready } : state
    case 'reveal-options': return state.phase === 'answering' && state.frameReady ? { ...state, optionsVisible: true } : state
    case 'select': return state.phase === 'answering' && state.frameReady && state.optionsVisible && (action.selected === UNKNOWN_ANSWER || question?.options.some(option => option.id === action.selected)) ? { ...state, selected: action.selected } : state
    case 'submit': {
      if (state.phase !== 'answering' || !question || !state.frameReady || state.selected === null) return state
      const answers = [...state.answers, { questionId: question.id, selected: state.selected, usedHint: false }]
      const index = state.index + 1
      if (index === state.questions.length) return { ...state, phase: 'finished', answers }
      return { ...state, index, answers, selected: null, frameReady: !needsMedia(state.questions[index]), optionsVisible: false }
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
