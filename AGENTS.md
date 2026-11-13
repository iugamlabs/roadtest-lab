# 开发指南

本文件适用于整个仓库。后续开发应沿用以下产品方向、UI 约定和数据处理原则；实现发生变化时，同步维护本文件和相关文档。

## 项目定位

- 项目名：路考练习室，仓库名 `roadtest-lab`。
- 面向约 60 岁的学员，帮助熟悉汕头大学路科目三路线及关键操作。
- 电脑优先，兼顾手机和平板；第一阶段仅支持 C2 自动挡。
- 使用五、六、七号线真实教学视频。核心方向是实景视频自动行驶，学员练习打灯、观察、制动等关键动作，不模拟驾驶物理。
- 保持纯前端架构，设置和学习数据优先本机保存。引入账号、跨设备同步或业务后端前，先与用户讨论需求。
- 当前已实现视频学习、路线图、字幕遮罩、统一教学字幕、学习设置，以及三条路线共 62 项暂停练习。通用训练引擎支持步骤判断、车辆状态、独立操作计时、单项重练和回看；详见 `docs/training-engine.md`。字幕以 ASR 为主、OCR 辅助校对，前端只显示一份成稿。独立听音、考规与正式评分尚未完成，暂停练习不能描述成完整模拟考试。

## 技术栈与工具

- React + TypeScript + Vite，使用严格类型检查。
- UI：shadcn/ui、Tailwind CSS，图标使用 Lucide。
- 路由：TanStack Router 文件路由；异步数据加载和缓存：TanStack Query。
- 表单：React Hook Form + Zod；外部数据和持久化数据在边界处通过 Zod 校验。
- Motion 按需加载，沿用 `LazyMotion`，尊重减少动态效果设置；一般交互优先使用 Tailwind CSS。
- 播放速度由 `src/features/settings/settings.tsx` 的 `playbackRates` / `playbackRateSchema` 统一定义，播放器、默认设置和持久化校验共用，当前为 0.75–2 倍的六档速度；不影响独立操作计时。
- **包管理器统一使用 pnpm**，不使用 npm/yarn/bun 安装依赖或生成其他锁文件。版本以 `package.json` 的 `packageManager` 为准，依赖改动同步更新 `pnpm-lock.yaml`。
- Node.js 版本要求以 `package.json` 的 `engines` 为准。

## UI 风格：优先使用 shadcn

- **先查找并复用 shadcn 官方 blocks 和组件，再考虑自定义实现。** 不要只模仿外观、另写一套等价控件；先复用 `src/components/ui/` 中的现有组件。
- 新增组件通过 `pnpm dlx shadcn@latest add <组件名>` 安装。沿用 `components.json` 的 `new-york`、`neutral`、CSS variables 配置。
- 官方 block 中的示例导航、账户、业务数据必须替换为本项目内容；路由适配 TanStack Router，不引入 Next.js 专用 API。
- 安装后检查差异，保留已有的可访问性和尺寸调整。`cn` 统一从 `@/lib/utils` 导入，避免 CLI 额外加入重复工具依赖。
- 视觉采用中性、扁平、清晰的工具型界面：小圆角、简单边框、无卡片装饰阴影，避免渐变、大面积装饰色、过多嵌套卡片及占空间的展示区。Dialog、Select 等浮层可保留标准组件的阴影。
- 优先使用 Card、Badge、Alert、Button、Input、Label、Switch、Select、Dialog、Sheet 等标准组件组合页面。
- 文案使用简明中文，围绕学员当前要做的动作；不要把开发状态、技术实现细节堆到产品流程中。

## 布局与交互

- 布局基于官方 `sidebar-07` block，实现在 `src/components/app-sidebar.tsx` 与 `src/routes/__root.tsx`。
- 桌面使用左侧 Sidebar，默认折叠为图标导航；**顶部必须有明显的收起/展开入口**，折叠后仍能方便展开。手机使用 Sheet 抽屉，选择导航后关闭抽屉。
- `/` 为学习引导主页，`/train` 为路线选择，`/train/$routeId` 为训练工作台；`/materials` 优先展示路线图，并提供字幕搜索。学习设置集成于训练页 Sheet，旧 `/settings` 链接重定向到路线选择。
- 不恢复占据较多垂直空间的桌面顶部品牌 header；手机可保留紧凑的导航工具栏。
- 页面标题保持紧凑。路线页返回按钮放在标题左侧，不另占一行。
- 保留播放器、关键操作区、学习设置的职责划分，确保窄屏布局不发生横向溢出。
- 桌面训练页采用视频与操作台并排布局，核心步骤、反馈和操作按钮优先留在首屏；完整步骤与教学说明位于视频侧。项目列表与设置按需打开 Sheet，打开时手动暂停，关闭后不自动恢复；选择单项可开始新尝试。当前步骤、打灯倒计时、观察和制动完成状态有文字及图标反馈；窄屏进入节点或选择单项时滚动到操作区。路线图支持缩放及键盘滚动。详见 `docs/ui-workspace.md`。

## 主题与可访问性

- 主题集中在 `src/styles.css` 的 `:root` / `.dark`，使用标准 shadcn 语义变量及 Tailwind `@theme inline` 映射。
- 颜色使用 `background`、`foreground`、`primary`、`muted`、`border`、`ring`、`sidebar-*` 等语义 token；圆角由 `--radius` 派生。避免页面内硬编码配色，以便后续直接应用 shadcn Themes。
- 视频底色、字幕遮罩等与媒体显示直接相关的颜色可使用必要的固定值。
- 保留约 20px 基础字号和至少 56px 的主要操作按钮，不为追求紧凑而缩小核心文字和点击区域；紧凑主要依靠去除冗余布局。
- 图标按钮提供清晰的中文可访问名称；折叠状态、开关状态、导航选中状态应可感知。
- 保留键盘操作、可见焦点、表单标签与错误提示、弹窗焦点管理；反馈不能只依赖颜色或语音。
- 动效轻量且可减少，不使用闪烁和影响阅读的长动画。

## 目录与素材

- `src/routes/`：页面与文件路由；`src/routeTree.gen.ts` 由工具生成，不手工维护。
- `src/components/ui/`：shadcn 基础组件；业务组件放在 `src/components/` 或对应 feature 内。
- `src/features/content/`：路线、字幕查询和数据契约；`src/features/settings/`：学习设置及本机持久化。
- `src/features/training/`：纯状态转换引擎、媒体控制器、React 订阅和练习操作区；状态机不直接读 DOM，媒体行为与引擎判断分别测试。
- `raw/`：原始视频、OCR SRT、ASR 素材和旧 DEMO，保留原文件，不覆盖修改。
- `raw/asr/route-5.srt`、`route-6.srt`、`route-7.srt`：ASR 文件约定位置，接入时检查实际内容；文件存在不代表已对齐或已核对。
- `public/data/route-*.ocr.json`：脚本生成的原始 OCR 记录，可以提交。人工修订应另存，避免重新导入覆盖。
- `content/subtitle-sources/` 保留可提交的 ASR 原文快照；`content/subtitle-reviews/` 保存人工修订、来源引用和疑点；`content/subtitles/` 保存成稿 SRT。
- `public/data/route-*.subtitles.json` 是前端唯一使用的字幕成稿，由脚本生成，不直接编辑；校对详情见 `docs/subtitle-review.md`。
- `content/event-calibrations/`：原片指纹、画面时间校准、证据时间、误差、情景标注与集中疑点；详见 `docs/event-calibration.md`。`public/data/route-*.events.json` 为生成的暂停练习数据，不直接编辑。
- `artifacts/calibration/`：FFmpeg 生成的本地证据工作台、逐秒帧、节点拼图和疑点原声片段，不提交 Git，不上传外部服务。
- `public/media/`：从原始素材准备的视频及路线图；与 `raw/`、`dist/` 一样不提交 Git。
- 不编辑 `dist/` 修复页面，必须修改源码后重新构建。

## 字幕校对与训练事件

- 详细流程见 [docs/content-workflow.md](docs/content-workflow.md)。
- ASR 与 OCR 保留各自原文、来源和毫秒时间戳；校正文另存并记录理由，不覆盖 `rawText`。
- 前端统一显示校正文（未修改处使用原文），搜索也使用同一文本，不提供来源切换或维护状态。当前仅完成文字校对，内部 `text-reviewed` 不等于原声、画面或考规已核实。
- 更新字幕后运行 `pnpm prepare:subtitles`；构建也会生成成稿。原文与修订中的 `expectedRawText` 不符时应重新审阅，不能绕过校验强行套用旧修订。
- 不要求两种字幕逐条对应，允许一对多、多对一和单侧内容。冲突或缺失处回看视频与原声；不确定的内容保留待核对状态。
- 方向、数值、规则及缺失整句不能靠语境猜测后标为已核实。
- 区分考试口令、教练提前讲解、事后解释、实际操作与临时交通情景。字幕出现时间只用于候选定位，不能直接当成操作触发时间。
- `raw/shantou-kemu3-key-actions` 仅作为交互参考，不能照搬旧时间节点、操作方向、评分或训练限时。
- 只有核实的事件才能进入正式模拟；教学训练规则与真实考规应明确区分。
- 画面校准的 `visual-reviewed` 仅表示抽样位置复核；`audioStatus: asr-only`、`ruleStatus: unverified` 不可自动升为整体已核实。动作区间与练习暂停点不等于官方反应限时；生成文件的 `examEvents` 为空，不得直接把暂停练习 `events` 用于考试评分。
- 保留原片与字幕指纹校验、47 条口令候选的覆盖检查及疑点排除。更新素材后先审阅变化，不能通过改指纹或编造口令时间绕过校验。只从画面看到前车动作时，不得当作拍摄车辆动作。
- 视频播放时间决定路线位置，用户操作计时独立管理；新增训练逻辑时明确暂停、缓冲、拖动、变速、页面隐藏和重练时的行为。
- 暂停练习的教学顺序和默认 3 秒打灯等待独立于未核实考规；不评分、不设置操作超时淘汰。节点自动暂停视频时操作计时继续；手动暂停、实际缓冲、后台、路线图、错误与定位期间冻结。后台/弹窗返回后手动继续，拖动不算完成；全程中的本项重练保留全程模式。具体状态约定见 `docs/training-engine.md`，更改行为时同步维护与测试。
- 人工校准只覆盖本机练习暂停点，存储键为 `roadtest.practice-calibration.v1.<routeId>`。通过 Zod 校验，绑定路线、视频/字幕指纹及原始节点时间；旧来源变化时不自动套用。运行时使用独立 `manualPauseMs` 和 `pauseTimeMs()`，不改写原始 `practicePauseMs`、动作区间或核实状态，不开放受阻节点。触发、定位、重练、回看、跳过与列表展示都使用有效暂停点。编辑时间需在视频范围内，保留原项目顺序，不能与相邻项目重叠；允许超出原 AI 动作区间。进入校准会结束当前练习，保存/导入/恢复后重新建立引擎会话，退出后手动开始。
- 字幕遮罩采用可开关、可调整范围的局部模糊，避免挡住道路信息；画面字幕与视频原声分别控制。
- 字幕遮罩默认顶部位置为 82%、高度为 8%，统一定义于 `defaultSettings`；已有本机设置优先，恢复默认学习设置可应用项目默认值。

## 常用命令与验证

```sh
pnpm install
pnpm prepare:media  # 从 raw 准备视频及路线图，不修改原始素材
pnpm dev
pnpm import:ocr     # OCR 原始 SRT 变化后重新导入，不用于人工校正
pnpm import:asr     # ASR 原始 SRT 变化后更新来源快照
pnpm prepare:subtitles # 应用修订，生成前端字幕、成稿 SRT 和校对记录
pnpm prepare:events    # 校验校准来源，生成暂停练习数据和事件报告
pnpm calibrate:media   # 本机 FFmpeg/FFprobe 生成逐秒图、节点证据图、疑点片段和工作台
pnpm build         # 生成路由、生产构建及 TypeScript 检查
pnpm typecheck     # 首次需先运行 dev/build 生成路由
pnpm test
```

- 根据改动运行必要检查。字幕解析、数据边界和训练逻辑应有有意义的测试；纯文档修改无需运行应用构建。
- UI 改动在环境允许时检查桌面/手机布局、侧栏折叠、Select 与 Dialog 的键盘及焦点行为；没有浏览器验证条件时明确说明，不将构建通过描述成视觉验证通过。
- 用户要求提交时，按组件基础、布局主题、页面功能、文档等类别组织提交；检查暂存内容，避免纳入原始素材、视频副本和构建产物。
