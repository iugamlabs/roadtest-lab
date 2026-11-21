from __future__ import annotations

import os
from pathlib import Path


def repo_root() -> Path:
    """定位仓库根目录（含 scripts/start-roadtest-lab.sh）。"""
    env = os.environ.get("ROADTEST_LAB_ROOT", "").strip()
    if env:
        candidate = Path(env).expanduser().resolve()
        if (candidate / "scripts" / "start-roadtest-lab.sh").is_file():
            return candidate

    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "scripts" / "start-roadtest-lab.sh").is_file():
            return parent

    cwd = Path.cwd().resolve()
    for parent in (cwd, *cwd.parents):
        if (parent / "scripts" / "start-roadtest-lab.sh").is_file():
            return parent

    raise FileNotFoundError(
        "找不到路考练习室仓库根目录。请从项目目录启动，或设置 ROADTEST_LAB_ROOT。"
    )


def ctl_script(root: Path | None = None) -> Path:
    root = root or repo_root()
    script = root / "scripts" / "start-roadtest-lab.sh"
    if not script.is_file():
        raise FileNotFoundError(f"找不到启停脚本：{script}")
    return script


def runtime_dir() -> Path:
    base = os.environ.get("XDG_RUNTIME_DIR") or os.environ.get(
        "XDG_CACHE_HOME", str(Path.home() / ".cache")
    )
    path = Path(base) / "roadtest-lab"
    path.mkdir(parents=True, exist_ok=True)
    return path


def gui_lock_path() -> Path:
    return runtime_dir() / "gui.lock"
