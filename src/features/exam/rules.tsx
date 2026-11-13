export function ExamRules() {
  return <section className="space-y-3 rounded-lg border p-4" aria-label="教学评分规则">
    <h2 className="font-semibold">本次考试怎么进行</h2>
    <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">
      <li>车辆自动行驶。到虚线变道区或路口前操作区时，选择正确时机执行。</li>
      <li>减速后保持慢行；需要等待时停车，准备好后点击“恢复行驶”。</li>
      <li>观察按钮会打开实时路况窗口；等候较久后，请再次观察。</li>
      <li>转弯、变道等动作按教学规则提前打灯至少3秒；完成后6秒内关灯。</li>
      <li>错误方向、未充分观察、未减速、危险通行、漏项等，每类错误扣10分；同一次动作的同类错误不重复扣分。</li>
      <li>暂停、后台或播报故障不扣分。暂停后需要手动继续。</li>
    </ul>
    <p className="border-t pt-3 text-base text-muted-foreground">场景按真实路线项目改编，距离和交通为示意；采用教学评分，不代表当地官方考试评分，也不检测实际驾驶动作。</p>
  </section>
}
