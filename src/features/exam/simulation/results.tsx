import { useEffect, useRef, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CourseResults } from '@/features/memory/course/workspace'
import type { MemorySource } from '@/features/memory/progress'
import { usePromptSpeech } from '../use-prompt-speech'
import type { ScoredAttempt } from './model'
import { examRule, projectRule, ruleApplicability, subject3Rules } from './rules'
import { simulationStages } from './scenarios'

const stageName = (id: string) => simulationStages.find(stage => stage.id === id)?.title

export function ScoredResults({ attempt, source, voice, suspended, restart }: {
  attempt: ScoredAttempt
  source: MemorySource
  voice: boolean
  suspended: boolean
  restart: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { outcome, score, evidence } = attempt
  const title = outcome === 'direct-fail' ? '本次模拟不合格' : outcome === 'below-threshold'
    ? '本次模拟低于 90 分' : '本次模拟已完成'
  const faults = evidence.filter(entry => entry.violated)
  const firstFault = faults[0]
  const stoppingFault = faults.find(entry => examRule(entry.clause).penalty === 'fail')
  const hasReboardingFault = faults.some(entry => entry.clause === projectRule(1, 'a') || entry.clause === projectRule(1, 'b'))
  const prompt = outcome === 'direct-fail'
    ? `${title}。${stoppingFault ? `本轮在${stageName(stoppingFault.stage)}终止。${stoppingFault.evidence}` : ''}`
    : `${title}。已评项目得分 ${score} 分。${firstFault ? `请回顾操作。` : ''}`
  const speech = usePromptSpeech(prompt, voice, suspended)
  useEffect(() => { heading.current?.focus() }, [])

  const reviewed = new Set(evidence.flatMap(entry => [entry.clause, ...(entry.relatedClauses ?? [])]))
  const violated = new Set(faults.flatMap(entry => [entry.clause, ...(entry.relatedClauses ?? [])]))
  const unassessed = subject3Rules.rules.filter(rule => !reviewed.has(rule.clause) && !ruleApplicability(rule))

  return <>
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{title}</h2>
            <p className="mt-2 text-base tabular-nums">{stoppingFault
              ? `本轮在「${stageName(stoppingFault.stage)}」触发直接不合格，考试结束。`
              : `已评项目得分 ${score} / 100 分`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!voice || suspended} onClick={speech.replay}><Volume2 aria-hidden />重听结果</Button>
            {restart}
          </div>
        </div>
        {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请查看下方结果。</p>}
        <p className="text-base text-muted-foreground">依据 {subject3Rules.standard}。当前覆盖部分 C2 操作，结果仅在本页查看。</p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="各阶段结果">
          {simulationStages.map(stage => {
            const stageFaults = faults.filter(entry => entry.stage === stage.id)
            const status = attempt.completed.includes(stage.id) ? '已完成'
              : evidence.some(entry => entry.stage === stage.id) ? '进行部分操作' : '未进行'
            return <li className="rounded-md border p-2 text-base" key={stage.id}>
              {stage.title} · {status}{stageFaults.length > 0 && ` · ${stageFaults.length} 项违规`}
            </li>
          })}
        </ul>
      </CardContent>
    </Card>

    <section className="space-y-3 rounded-lg border p-4" aria-label="扣分与判定">
      <h3 className="text-xl font-semibold">扣分与判定</h3>
      {hasReboardingFault && <p>从左前出发，依次点「检查左后」「检查右后」「检查右前」，再点「回到左前车门」。确认页面显示「已记录后方观察」后，再开门上车。</p>}
      {faults.length === 0 ? <p>已评项目未触发扣分。</p> : <ol className="divide-y">
        {faults.map(entry => {
          const rule = examRule(entry.clause)
          return <li key={`${entry.occurrence}:${entry.clause}`} className="space-y-1 py-3">
            <p className="font-semibold">{stageName(entry.stage)}{entry.context && ` · ${entry.context}`} · {rule.penalty === 'fail' ? '直接不合格' : `扣 ${rule.penalty} 分`}</p>
            <p>{entry.evidence}</p>
            <p className="text-base text-muted-foreground">§{entry.clause}　{rule.text}</p>
            {entry.relatedClauses && <p className="text-base text-muted-foreground">同一操作关联 {entry.relatedClauses.map(clause => `§${clause}`).join('、')}</p>}
          </li>
        })}
      </ol>}
    </section>

    {attempt.lightAnswers.length > 0 && <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">灯光逐题回顾 · 已确认 {attempt.lightAnswers.length} / {attempt.lighting.length} 题</summary>
      <ol className="mt-2 divide-y">
        {attempt.lightAnswers.map((answer, index) => <li key={answer.scenario.id} className="space-y-1 py-2 text-base">
          <p className="font-medium">{index + 1}. {answer.scenario.prompt}</p>
          <p>{answer.status}</p>
          <p>参考操作 · {answer.scenario.expected}</p>
          <p className="text-muted-foreground">{answer.checks.some(entry => entry.violated) ? '触发评判，详见扣分明细'
            : answer.checks.length ? '已评，未触发违规条款' : '本题操作组合暂未评判'}</p>
        </li>)}
      </ol>
    </details>}

    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">查看规则覆盖 · 已评 {reviewed.size} 条</summary>
      <p className="my-3 text-base text-muted-foreground">「已评」表示本轮至少检查过一次对应操作。未抽到的灯光、未进行的阶段和缺少证据的操作均可能列为未评。当前未评 {unassessed.length} 条。</p>
      <ul className="divide-y">
        {subject3Rules.rules.map(rule => <li key={rule.id} className="py-2 text-base">
          <p className="font-medium">§{rule.clause} · {violated.has(rule.clause) ? '已评 · 有违规'
            : reviewed.has(rule.clause) ? '已评 · 未触发' : ruleApplicability(rule) ?? '本轮未评'}</p>
          <p className="text-muted-foreground">{rule.text}</p>
        </li>)}
      </ul>
    </details>
    {attempt.course && <>
      <h3 className="text-xl font-semibold">实景路线回顾</h3>
      <CourseResults source={source} {...attempt.course} />
    </>}
  </>
}
