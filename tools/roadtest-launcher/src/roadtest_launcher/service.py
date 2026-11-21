from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from roadtest_launcher.paths import ctl_script, repo_root

ServiceState = Literal["stopped", "starting", "running", "error"]


@dataclass(frozen=True)
class ServiceStatus:
    state: ServiceState
    url: str
    log_file: str
    message: str = ""
    pid: int | None = None

    @property
    def is_running(self) -> bool:
        return self.state == "running"

    @property
    def is_busy(self) -> bool:
        return self.state in {"starting", "running"}


class ServiceError(RuntimeError):
    def __init__(self, message: str, *, log_file: str = "") -> None:
        super().__init__(message)
        self.log_file = log_file


class RoadtestService:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or repo_root()
        self.script = ctl_script(self.root)

    def status(self) -> ServiceStatus:
        completed = self._run(["--status"], timeout=15)
        return self._parse_status(completed.stdout)

    def start(self, *, open_browser: bool = True) -> ServiceStatus:
        env = os.environ.copy()
        env["ROADTEST_OPEN_BROWSER"] = "1" if open_browser else "0"
        # 构建可能较久；预览就绪后脚本自行退出。
        completed = self._run([], timeout=60 * 20, env=env, check=False)
        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout or "启动失败").strip()
            status = self._safe_status()
            raise ServiceError(message or status.message, log_file=status.log_file)
        return self.status()

    def stop(self) -> ServiceStatus:
        completed = self._run(["--stop"], timeout=60, check=False)
        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout or "停止失败").strip()
            status = self._safe_status()
            raise ServiceError(message or status.message, log_file=status.log_file)
        return self.status()

    def open_browser(self) -> None:
        completed = self._run(["--open"], timeout=30, check=False)
        if completed.returncode != 0:
            message = (completed.stderr or completed.stdout or "无法打开浏览器").strip()
            status = self._safe_status()
            raise ServiceError(message or status.message, log_file=status.log_file)

    def _safe_status(self) -> ServiceStatus:
        try:
            return self.status()
        except Exception:
            return ServiceStatus(
                state="error",
                url="http://127.0.0.1:19237/",
                log_file=str(
                    Path(
                        os.environ.get("XDG_RUNTIME_DIR")
                        or os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))
                    )
                    / "roadtest-lab"
                    / "preview.log"
                ),
                message="无法读取服务状态。",
            )

    def _run(
        self,
        args: list[str],
        *,
        timeout: int,
        env: dict[str, str] | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        command = ["bash", str(self.script), *args]
        try:
            return subprocess.run(
                command,
                cwd=self.root,
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=check,
            )
        except subprocess.TimeoutExpired as exc:
            raise ServiceError(f"操作超时：{' '.join(args) or 'start'}") from exc
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or str(exc)).strip()
            raise ServiceError(message or "启停脚本执行失败") from exc

    @staticmethod
    def _parse_status(raw: str) -> ServiceStatus:
        text = raw.strip()
        if not text:
            raise ServiceError("状态输出为空")
        try:
            payload = json.loads(text.splitlines()[-1])
        except json.JSONDecodeError as exc:
            raise ServiceError(f"无法解析状态：{text[:200]}") from exc

        state = payload.get("state")
        if state not in {"stopped", "starting", "running", "error"}:
            raise ServiceError(f"未知状态：{state!r}")

        pid = payload.get("pid")
        return ServiceStatus(
            state=state,
            url=str(payload.get("url") or "http://127.0.0.1:19237/"),
            log_file=str(payload.get("logFile") or ""),
            message=str(payload.get("message") or ""),
            pid=int(pid) if pid is not None else None,
        )
