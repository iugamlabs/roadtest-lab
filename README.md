# 路考练习室

汕头大学路科目三实景学习工具。第一阶段面向约 60 岁的学员，电脑优先，兼顾手机和平板，仅支持 C2 自动挡。

当前为项目框架：三条实景路线、视频播放与回看、操作按钮熟悉、局部字幕模糊、学习设置、OCR 原文查看。尚未接入经核对的考试事件、操作状态机或评分；不会把旧 DEMO 时间点用于训练。

## 启动

需要 Node.js 22.12+、pnpm 12.4.2（见 `packageManager`）。

```sh
pnpm install
pnpm prepare:media
pnpm dev
```

`prepare:media` 从 `raw/` 复制三段视频和三张路线图到 `public/media/`，原始素材不会被修改。素材缺失时会报告对应文件。媒体文件与 `raw/` 均不提交 Git；另一台设备需要自行准备素材。Vite 构建会将已准备的媒体复制到 `dist/media/`。

```sh
pnpm import:ocr  # 原始 SRT 有变化时，重新生成可追溯的 OCR JSON
pnpm test        # 字幕解析及数据边界检查
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
src/lib/                通用工具及按需加载的 Motion 特性
public/data/            可提交的原始 OCR JSON，保留来源与待校对状态
public/media/           本机准备的视频和路线图，Git 忽略
scripts/                素材准备与字幕导入
docs/content-workflow.md 字幕与事件校对约定
```

React + TypeScript + Vite；Tailwind CSS；shadcn/ui；TanStack Router + Query；React Hook Form + Zod；Motion 使用 LazyMotion 异步加载，尊重减少动态效果设置。无后端、无账号、无远程转写服务。

## 当前边界

- 播放以视频时间为准；操作区仅用于熟悉按钮，不影响影片车速，也不计分。
- 当前视频为教学片，有原声和画面字幕。字幕遮罩为 CSS 局部模糊，范围需要对照画面调整；默认关闭，设置暂时共用于三条路线。
- JSON 字幕不被当作考试指令；任何原文中的规则、方向、数值尚未经人工确认。
- 本次仅搭建当前仓库内的项目，未配置线上托管。静态部署需要支持 SPA 路由回退至 index.html，并准备媒体文件；不需要业务后端。
