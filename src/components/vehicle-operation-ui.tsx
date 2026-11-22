import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Purpose = 'access' | 'observe' | 'signal' | 'gear' | 'power' | 'brake' | 'move'
const purposeAccent = {
  access: 'position',
  observe: 'dipped',
  signal: 'main',
  gear: 'flash',
  power: 'full',
  brake: 'exit',
  move: 'full',
} as const
type Accent = typeof purposeAccent[Purpose]

export function ActionGrid({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>
}

export function Control({ children, icon: Icon, purpose = 'move', selected, onClick, disabled, className, primary = false, accent }: {
  children: ReactNode
  icon: LucideIcon
  purpose?: Purpose
  selected?: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
  primary?: boolean
  accent?: Accent
}) {
  return <Button variant="outline" aria-pressed={selected} data-kind={accent ?? purposeAccent[purpose]} data-primary={primary}
    className={cn('vehicle-control h-auto w-full min-w-0 whitespace-normal px-3 py-3 text-center', className)}
    disabled={disabled} onClick={onClick}>
    <Icon className="size-5 shrink-0" aria-hidden /><span className="min-w-0">{children}</span>
  </Button>
}

export type StatusItem = {
  label: string
  value: string
  icon: LucideIcon
  purpose: Purpose
  active?: boolean
  accent?: Accent
}

export function StatePanel({ title, items, children, compact = false }: {
  title: string; items: StatusItem[]; children?: ReactNode; compact?: boolean
}) {
  return <section aria-label={title} className={cn('space-y-2 rounded-md border bg-muted/35', compact ? 'p-2' : 'p-3')}>
    <h4 className="text-base font-semibold">{title}</h4>
    <div aria-live="polite" aria-atomic="false" className="space-y-2">
      <dl className="grid grid-cols-2 gap-2">
        {items.map(({ label, value, icon: Icon, purpose, active, accent }) =>
          <div key={label} data-kind={accent ?? purposeAccent[purpose]}
            className={cn('vehicle-state grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-md border bg-card',
              compact ? 'px-2 py-1' : 'px-2.5 py-2')}>
            <Icon aria-hidden data-active={active ?? true} className="size-5" />
            <dt className="text-sm leading-tight text-muted-foreground">{label}</dt>
            <dd className="col-start-2 break-words text-base font-semibold leading-snug">{value}</dd>
          </div>)}
      </dl>
      {children}
    </div>
  </section>
}
