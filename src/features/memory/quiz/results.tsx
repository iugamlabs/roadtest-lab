import { BookOpen, Check, CircleHelp, ClipboardCheck, Lightbulb, Minus, RotateCcw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { quizKindLabels, type QuizQuestion } from './bank'
import { quizOutcome, quizOutcomeLabels, summarizeQuiz, UNKNOWN_ANSWER, type QuizAnswer } from './model'

const outcomeIcons = { independent: Check, assisted: Lightbulb, wrong: X, unknown: CircleHelp, unanswered: CircleHelp }
const outcomeStyles = {
  independent: 'border-success/30 bg-success/10 text-success',
  assisted: 'border-success/30 bg-success/10 text-success',
  wrong: 'border-destructive/30 bg-destructive/10 text-destructive',
  unknown: 'bg-muted text-muted-foreground',
  unanswered: 'bg-muted text-muted-foreground',
}

export function QuizResults({ questions, answers, date, onRetry, onReplay }: {
  questions: QuizQuestion[]
  answers: QuizAnswer[]
  date?: string
  onRetry: (questions?: QuizQuestion[]) => void
  onReplay: (questions: QuizQuestion[], trigger: HTMLButtonElement) => void
}) {
  const tally = summarizeQuiz(questions, answers)
  const items = questions.map((question, index) => {
    const answer = answers.find(item => item.questionId === question.id)
    return { question, index, answer, outcome: quizOutcome(question, answer) }
  })
  const review = items.filter(item => item.outcome !== 'independent' && item.outcome !== 'assisted')
  const correct = items.filter(item => item.outcome === 'independent' || item.outcome === 'assisted')
  const weak = items.filter(item => item.outcome !== 'independent').map(item => item.question)

  return <section className="space-y-5" aria-label={date ? '历史小测结果' : '本轮小测结果'}>
    <div className="space-y-4 rounded-lg border p-4">
      {date && <p className="text-base text-muted-foreground">{date}</p>}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: '答对', count: correct.length, icon: Check, style: outcomeStyles.independent },
          { label: '答错', count: tally.wrong, icon: X, style: outcomeStyles.wrong },
          { label: '想不起来', count: tally.unknown, icon: CircleHelp, style: outcomeStyles.unknown },
          { label: '未作答', count: tally.unanswered, icon: Minus, style: outcomeStyles.unanswered },
        ].map(({ label, count, icon: Icon, style }) => <div key={label} className={`rounded-md border p-3 ${style}`}>
          <dt className="flex flex-wrap items-center gap-1.5 text-base font-medium"><Icon className="size-5" aria-hidden />{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{count}<span className="ml-1 text-base font-normal">题</span></dd>
        </div>)}
      </dl>
      {tally.assisted > 0 && <p className="text-base text-muted-foreground">答对的题目中，有 {tally.assisted} 题使用过提示。</p>}
      <div className="flex flex-wrap gap-2 text-base">{Object.entries(quizKindLabels).map(([kind, label]) => {
        const ofKind = items.filter(item => item.question.kind === kind)
        if (!ofKind.length) return null
        return <Badge key={kind} variant="outline" className="text-sm">{label} · 答对 {correct.filter(item => item.question.kind === kind).length} / {ofKind.length}</Badge>
      })}</div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onRetry()}><RotateCcw aria-hidden />再抽一组小测</Button>
        {weak.length > 0 && <>
          <Button variant="outline" onClick={event => onReplay(weak, event.currentTarget)}><BookOpen aria-hidden />回看待复习实景</Button>
          <Button variant="outline" onClick={() => onRetry(weak)}><ClipboardCheck aria-hidden />重测薄弱题</Button>
        </>}
      </div>
    </div>
    {[
      { title: '错题与未答', items: review },
      { title: '答对的题目', items: correct },
    ].filter(group => group.items.length).map(group => <section key={group.title} className="space-y-2">
      <h3 className="text-xl font-semibold">{group.title} · {group.items.length} 题</h3>
      {group.items.map(({ question, index, answer, outcome }) => {
        const Icon = outcomeIcons[outcome]
        const chosen = answer?.selected === UNKNOWN_ANSWER ? '想不起来' : question.options.find(option => option.id === answer?.selected)?.label ?? '未作答'
        return <article key={question.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-semibold">第 {index + 1} 题 · {quizKindLabels[question.kind]}</p>
            <Badge variant="outline" className={`text-sm ${outcomeStyles[outcome]}`}><Icon className="size-4" aria-hidden />{quizOutcomeLabels[outcome]}</Badge>
          </div>
          <p className="font-semibold leading-relaxed">{question.prompt}</p>
          <dl className="grid gap-2 text-base sm:grid-cols-2">
            <div className={`rounded-md border p-3 ${outcomeStyles[outcome]}`}><dt>你的答案</dt><dd className="font-semibold">{chosen}</dd></div>
            <div className="rounded-md border p-3"><dt className="text-muted-foreground">正确答案</dt><dd className="font-semibold">{question.options.find(option => option.id === question.correct)?.label}</dd></div>
          </dl>
          <p className="text-base leading-relaxed">{question.explanation}</p>
          <Button variant="outline" onClick={event => onReplay([question], event.currentTarget)}><BookOpen aria-hidden />回看这段实景<span className="sr-only">，第 {index + 1} 题</span></Button>
        </article>
      })}
    </section>)}
  </section>
}
