# 开发指南

本文件适用于整个仓库。后续开发应沿用以下产品方向、UI 约定和数据处理原则；实现发生变化时，同步维护本文件和相关文档。

## 项目定位

- 项目名：路考练习室，仓库名 `roadtest-lab`。
- 面向约 60 岁的学员，帮助熟悉汕头大学路科目三路线及关键操作。
- 电脑优先，兼顾手机和平板；第一阶段仅支持 C2 自动挡。
- 使用五、六、七号线真实教学视频。核心方向是实景视频自动行驶，学员练习打灯、观察、制动等关键动作，不模拟驾驶物理。
- 保持纯前端架构，设置和学习数据优先本机保存。引入账号、跨设备同步或业务后端前，先与用户讨论需求。
- 当前已实现视频学习、操作按钮熟悉、路线图、字幕遮罩、OCR 原文查看及学习设置。经核对的考试事件、动作状态机和评分尚未接入，不能将按钮试用描述成完整模拟考试。

## 技术栈与工具

- React + TypeScript + Vite，使用严格类型检查。
- UI：shadcn/ui、Tailwind CSS，图标使用 Lucide。
- 路由：TanStack Router 文件路由；异步数据加载和缓存：TanStack Query。
- 表单：React Hook Form + Zod；外部数据和持久化数据在边界处通过 Zod 校验。
- Motion 按需加载，沿用 `LazyMotion`，尊重减少动态效果设置；一般交互优先使用 Tailwind CSS。
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
- 桌面使用左侧 Sidebar，支持折叠为图标导航；**顶部必须有明显的收起/展开入口**，折叠后仍能方便展开。手机使用 Sheet 抽屉，选择导航后关闭抽屉。
- 不恢复占据较多垂直空间的桌面顶部品牌 header；手机可保留紧凑的导航工具栏。
- 页面标题保持紧凑。路线页返回按钮放在标题左侧，不另占一行。
- 保留播放器、关键操作区、学习设置的职责划分，确保窄屏布局不发生横向溢出。

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
- `raw/`：原始视频、OCR SRT、ASR 素材和旧 DEMO，保留原文件，不覆盖修改。
- `raw/asr/route-5.srt`、`route-6.srt`、`route-7.srt`：ASR 文件约定位置，接入时检查实际内容；文件存在不代表已对齐或已核对。
- `public/data/route-*.ocr.json`：脚本生成的原始 OCR 记录，可以提交。人工修订应另存，避免重新导入覆盖。
- `public/media/`：从原始素材准备的视频及路线图；与 `raw/`、`dist/` 一样不提交 Git。
- 不编辑 `dist/` 修复页面，必须修改源码后重新构建。

## 字幕校对与训练事件

- 详细流程见 [docs/content-workflow.md](docs/content-workflow.md)。
- ASR 与 OCR 保留各自原文、来源和毫秒时间戳；校正文另存并记录理由，不覆盖 `rawText`。
- 不要求两种字幕逐条对应，允许一对多、多对一和单侧内容。冲突或缺失处回看视频与原声；不确定的内容保留待核对状态。
- 方向、数值、规则及缺失整句不能靠语境猜测后标为已核实。
- 区分考试口令、教练提前讲解、事后解释、实际操作与临时交通情景。字幕出现时间只用于候选定位，不能直接当成操作触发时间。
- `raw/shantou-kemu3-key-actions` 仅作为交互参考，不能照搬旧时间节点、操作方向、评分或训练限时。
- 只有核实的事件才能进入正式模拟；教学训练规则与真实考规应明确区分。
- 视频播放时间决定路线位置，用户操作计时独立管理；新增训练逻辑时明确暂停、缓冲、拖动、变速、页面隐藏和重练时的行为。
- 字幕遮罩采用可开关、可调整范围的局部模糊，避免挡住道路信息；画面字幕与视频原声分别控制。

## 常用命令与验证

```sh
pnpm install
pnpm prepare:media  # 从 raw 准备视频及路线图，不修改原始素材
pnpm dev
pnpm import:ocr     # OCR 原始 SRT 变化后重新导入，不用于人工校正
pnpm build         # 生成路由、生产构建及 TypeScript 检查
pnpm typecheck     # 首次需先运行 dev/build 生成路由
pnpm test
```

- 根据改动运行必要检查。字幕解析、数据边界和训练逻辑应有有意义的测试；纯文档修改无需运行应用构建。
- UI 改动在环境允许时检查桌面/手机布局、侧栏折叠、Select 与 Dialog 的键盘及焦点行为；没有浏览器验证条件时明确说明，不将构建通过描述成视觉验证通过。
- 用户要求提交时，按组件基础、布局主题、页面功能、文档等类别组织提交；检查暂存内容，避免纳入原始素材、视频副本和构建产物。
