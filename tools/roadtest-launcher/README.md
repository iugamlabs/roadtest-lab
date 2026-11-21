# 路考练习室桌面启动器

本机小控制台：启动/停止预览服务、打开浏览器，并在系统托盘显示运行状态。

## 依赖

- Python 3.12+（需系统 `python3-tk`，Debian/Ubuntu：`sudo apt install python3-tk`）
- [uv](https://github.com/astral-sh/uv)
- 仓库根目录已准备好 Node.js、pnpm、依赖与视频素材

## 开发

```sh
cd tools/roadtest-launcher
uv sync
uv run roadtest-launcher
```

也可在仓库根目录：

```sh
bash scripts/start-roadtest-lab-gui.sh
```

## 与启停脚本的关系

启动器通过 `scripts/start-roadtest-lab.sh` 管理服务：

- `--status`：JSON 状态
- （无参数）：构建并启动预览
- `--open`：已运行时打开浏览器
- `--stop`：停止本项目预览

进程归属、端口与会话回收仍由该脚本负责。
