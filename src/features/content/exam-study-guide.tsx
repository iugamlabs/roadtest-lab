import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { lightingCommands } from './lighting-commands'

const examSteps = [
  '上车调整座椅。',
  '完成人脸识别。',
  '下车、关车门、绕车，按 4 个按钮。',
  '系好安全带。',
  '启动车辆。',
  '完成模拟灯光考试。',
  '进入路面考试。',
]

export function ExamProcessGuide() {
  return <section aria-labelledby="exam-process-title">
      <h2 id="exam-process-title" className="mb-3 text-xl font-bold">考试流程</h2>
      <p className="muted mb-4 leading-relaxed">根据提供的《考试流程》图片整理。绕车按钮、口令、灯光时限及扣分说明以图片为学习参考，实际考试请以当地考场和教练确认为准。</p>
      <Card><CardContent>
        <ol className="list-decimal space-y-3 pl-7 leading-relaxed">{examSteps.map(step => <li key={step} className="pl-1">{step}</li>)}</ol>
        <div className="mt-5 border-t pt-4">
          <h3 className="font-semibold">灯光结束后的起步提示</h3>
          <blockquote className="mt-2 border-l-2 pl-3 leading-relaxed text-muted-foreground">图片原文：“请在5号线完成考试，请立即起步，按语音提示完成考试，打左转向灯，按喇叭三秒，挂一挡，放手刹”。</blockquote>
          <Alert role="note" className="mt-4"><AlertDescription className="text-base"><p>本项目面向 C2 自动挡。图片中的“挂一挡”为手动挡表述，不直接套用于 C2；挡位、驻车制动和起步顺序请按教练指导及考试车辆要求操作。</p></AlertDescription></Alert>
        </div>
      </CardContent></Card>
    </section>
}

export function LightingExamGuide() {
  return <section aria-labelledby="lighting-exam-title">
      <h2 id="lighting-exam-title" className="mb-3 text-xl font-bold">模拟灯光考试</h2>
      <p className="muted mb-4">对照灯光口令记操作，注意“照明良好”和“照明不良”的区别。</p>
      <Card className="gap-0 py-0"><CardContent className="px-0">
        <table className="w-full table-fixed text-left leading-relaxed">
          <caption className="sr-only">图片中的 12 条灯光语音与对应操作</caption>
          <thead><tr className="border-b bg-muted/50"><th scope="col" className="w-[58%] px-4 py-3 font-semibold">灯光语音</th><th scope="col" className="px-4 py-3 font-semibold">操作</th></tr></thead>
          <tbody>{lightingCommands.map(([command, action]) => <tr key={command} className="border-b last:border-0"><th scope="row" className="px-4 py-3 font-normal">{command}</th><td className="px-4 py-3 font-semibold">{action}</td></tr>)}</tbody>
        </table>
        <div className="border-t px-4 py-5">
          <h3 className="mb-3 font-semibold">图片中的考试说明</h3>
          <ul className="list-disc space-y-2 pl-6 leading-relaxed">
            <li>灯光随机抽取，考 5 个灯光。</li>
            <li>语音播报完毕后，5 秒内按提示完成相应灯光操作。</li>
            <li>抢答、超时、打错，均扣 100 分。</li>
          </ul>
          <p className="muted mt-4 leading-relaxed">上述时限和扣分说明来自图片，尚未独立核实为当地现行考规。实际考试请以当地考场和教练确认为准。</p>
        </div>
      </CardContent></Card>
    </section>
}
