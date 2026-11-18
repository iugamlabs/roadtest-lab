# 路考练习室

汕头大学路科目三实景路线记忆与视频学习工具。面向约60岁的C2学员，电脑优先，兼顾手机和平板。

主线是把真实路线认熟、把前后项目接起来，逐渐能在脑中走完整条路线。首页三张路线卡直接进入对应的路线记忆页。

- **跟着学**：沿实景视频走一段，在关键位置暂停，看位置、教学动作和下一项目，再手动继续。
- **自己回忆**：先看道路，口头或在心里说出这里是哪里、接下来怎么走、需要准备什么，再揭晓讲解。回忆时静音、隐藏教学字幕并按学习设置遮住原片字幕，支持两级提示。
- **分段练到全程**：默认连练5处，可选起点、一直练到终点，或只重练需要提示的项目；单项重练带入前文实景。
- **自评回顾**：标记“自己想起来了 / 提示后想起来了 / 这段再练一次”。用过提示不能算独立回忆；不计考试分数、不录音、不自动判定掌握。自评保存在本机，来源或项目内容更新后重新核对。
- **路线小测**：三条路线共30道精选走向题和项目顺序题，每轮最多5题。先选答案再提交，首次答案锁定、整轮后统一揭晓；提示后答对单独记录。支持刚学路段小测、错题实景回看、薄弱题重测及最近12次本机结果，不把自评当成客观答题成绩。

入口为 `/memory` 和 `/memory/$routeId`。三条路线使用现有已发布视频项目，共62处（22、18、22），不补造六号线受阻节点。详见[实景路线记忆](docs/route-memory.md)。

原路线场景考试已退出主流程，首页和侧栏不再提供入口；旧 `/exam`、`/exam/$routeId` 链接会转到记忆模块。历史实现、测试和本机数据保留，不与记忆自评混用，见[历史2D说明](docs/map-training.md)。原型与早期透视页保留原链接兼容。

视频操作练习 `/train` 继续提供完整教学视频、成稿字幕、局部字幕模糊、统一倍速、全屏、学习设置及62项暂停操作练习。可练全程或单项，支持独立计时、纠正提示、重练、回看和人工暂停点校准；不计分、不设操作超时。详见[训练引擎](docs/training-engine.md)、[人工校准](docs/event-calibration.md)和[界面约定](docs/ui-workspace.md)。

灯光口令考核 `/exam/lighting` 独立保留，首页与侧栏直接进入：从12条口令抽取5题，每题20分、不限时，支持语音、重听、文字回退和逐题回顾；结果仅保留本页会话。属于教学自测，不使用图片中的时限和扣分规则。[学习资料](docs/ui-workspace.md)页面提供路线图与字幕、考试流程、灯光口令操作对照，保留资料来源与C2差异提示。

字幕以ASR为主、OCR辅助校对，前端仅展示一份成稿。已完成文字校对与抽样画面定位，尚未逐段独立听音或核实现行考规，不能据此发布正式考试评分。原文、修订、指纹与疑点保留在仓库，详见[内容维护](docs/content-workflow.md)。

## 启动

需要 Node.js 22.12+、pnpm 12.4.2（见 `packageManager`）。

```sh
pnpm install
pnpm prepare:media
pnpm dev
```

`prepare:media` 需要本机安装 FFmpeg（含 `ffprobe`），从 `raw/` 准备三段视频和三张路线图到 `public/media/`。视频统一使用 H.264 / yuv420p + AAC，避免 Linux Chrome 无法解码 H.265 时只有声音没有画面；已有兼容原片直接复制，其余转码并将 MP4 索引前置，保留尺寸、帧率和时间轴，校验各轨起点、时长及视频帧数。原始素材和校准来源指纹不会被修改。首次转码需等待，后续通过原片、发布文件 SHA-256 与转码版本复用结果，记录位于被 Git 忽略的 `public/media/*.prepare.json`。素材缺失时会报告对应文件。媒体文件与 `raw/` 均不提交 Git；另一台设备可以准备素材或同步已准备的视频。Vite 构建会将已准备的媒体复制到 `dist/media/`，部署应从这里同步，不直接修改部署文件。

```sh
pnpm import:ocr  # 原始 SRT 有变化时，重新生成可追溯的 OCR JSON
pnpm import:asr  # ASR 素材有变化时，更新原文快照
pnpm prepare:subtitles # 应用人工修订，生成唯一成稿、SRT 与校对记录
pnpm test        # 字幕、数据边界、训练状态机与媒体控制检查
pnpm build       # 生成路由、生产构建、TypeScript 检查
pnpm typecheck   # 首次请先运行 dev 或 build，生成 routeTree.gen.ts
pnpm preview
```

## 结构

```text
src/routes/             TanStack Router 文件路由与页面
src/components/ui/      shadcn/ui 组件
src/features/content/   路线、字幕查询及 Zod 数据契约
src/features/settings/  学习设置与本机持久化
src/features/training/  训练引擎、媒体控制、操作面板与项目重练
src/features/memory/    主用路线记忆、媒体控制、分级提示与本机自评
src/features/exam/      独立灯光考核、语音，以及保留的历史路线场景代码
src/features/exam/map/  历史2D实现，轨迹卡片仍供首页复用
src/lib/                通用工具及按需加载的 Motion 特性
public/data/            前端使用的统一字幕 JSON，以及保留的 OCR 来源快照
content/subtitle-sources/ 可提交的 ASR 原文快照
content/subtitle-reviews/ 人工修订、来源引用与待核实项
content/subtitles/      同一成稿的标准 SRT 导出
public/media/           本机准备的视频和路线图，Git 忽略
scripts/                素材准备与字幕导入
docs/content-workflow.md 字幕与事件校对约定
```

React + TypeScript + Vite；Tailwind CSS；shadcn/ui；TanStack Router + Query；React Hook Form + Zod；Motion 使用 LazyMotion 异步加载，尊重减少动态效果设置。无后端、无账号、无远程转写服务。

## UI 与主题

应用沿用官方shadcn sidebar-07布局，桌面导航默认折叠且保留明显展开入口，手机使用Sheet抽屉。主页优先提供路线记忆，另有视频练习、灯光考核和学习资料。记忆页桌面视频与回忆区并排，窄屏到点后滚动到问题；设置与离开确认会暂停，关闭后手动继续。

复用TrainingVideoPlayer、Button、Tabs、Select、Sheet、Dialog等现有组件，保留约20px基础字号和至少56px主要按钮。主题集中于src/styles.css的标准shadcn语义变量。布局与维护约定见[UI工作台](docs/ui-workspace.md)。

## 当前边界

- 路线记忆检查的是主动回忆与自评，不检测实际驾驶动作，不代表官方考试成绩；记熟路线不能代替现场交通判断。
- 回忆位置使用既有动作区间起点，未逐段保证位于所有教练提示之前。字幕遮罩仅覆盖设置范围，需对照画面调整；原声、字幕成稿和原始素材不修改。
- 自评与学习设置本机保存，进行中的播放位置不跨页面恢复。存储不可用时可继续本次学习并查看回顾，页面会说明保存失败。
- 视频操作练习仍使用独立校准暂停点与独立操作计时，变速不影响打灯等待；原始校准、来源指纹、受阻节点与空examEvents不变。
- 无账号、业务后端或远程语音识别。当前修改仅在仓库内，未配置或发布线上托管；静态部署需准备媒体文件并支持SPA回退。
