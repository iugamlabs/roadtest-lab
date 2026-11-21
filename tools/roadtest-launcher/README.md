# 路考练习室桌面启动器

本机小控制台：启动/停止预览服务、打开浏览器，并在系统托盘显示运行状态。

支持 Linux 和原生 Windows。

## 依赖

- Python 3.12+，需包含 Tkinter。Debian/Ubuntu 可安装 `python3-tk`，Windows 使用带 Tcl/Tk 的 Python。
- [uv](https://github.com/astral-sh/uv)
- 仓库根目录已准备好 Node.js、pnpm、依赖与视频素材

## 开发

```sh
cd tools/roadtest-launcher
uv sync
uv run roadtest-launcher
```

也可在仓库根目录运行 `uv run --project tools/roadtest-launcher roadtest-launcher`。Linux 还可运行：

```sh
bash scripts/start-roadtest-lab-gui.sh
```

## 与启停脚本的关系

Linux 启动器通过 `scripts/start-roadtest-lab.sh` 管理服务：

- `--status`：JSON 状态
- （无参数）：构建并启动预览
- `--open`：已运行时打开浏览器
- `--stop`：停止本项目预览

进程归属、端口与会话回收仍由该脚本负责。

Windows 启动器直接运行 `pnpm build`，再启动由当前窗口及托盘程序管理的 Vite 预览，地址为 `http://127.0.0.1:19237/`。关闭窗口到托盘时服务继续运行；退出启动器或启动器异常退出后，服务随之停止。若端口被其他程序占用，请在原终端停止该程序。构建与预览日志位于 `%LOCALAPPDATA%\roadtest-lab\preview.log`。
