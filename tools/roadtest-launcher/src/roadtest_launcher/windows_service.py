from __future__ import annotations

import os
import shutil
import socket
import subprocess
from pathlib import Path
from queue import Empty, Queue
from threading import RLock, Thread
from typing import BinaryIO

from roadtest_launcher.paths import repo_root, runtime_dir
from roadtest_launcher.service import ServiceError, ServiceState, ServiceStatus

PORT = 19237
URL = f"http://127.0.0.1:{PORT}/"


class WindowsRoadtestService:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or repo_root()
        self.log_file = runtime_dir() / "preview.log"
        self._preview: subprocess.Popen[bytes] | None = None
        self._ready = False
        self._lock = RLock()

    def status(self) -> ServiceStatus:
        with self._lock:
            preview = self._preview
            if preview is not None and preview.poll() is None:
                if self._ready:
                    return self._status("running", "练习室服务运行中。", preview.pid)
                return self._status("starting", "练习室正在启动，请稍候。", preview.pid)
            self._clear_preview()
            try:
                connection = socket.create_connection(("127.0.0.1", PORT), timeout=0.3)
            except OSError:
                return self._status("stopped", "练习室尚未启动。")
            connection.close()
            return self._status("error", f"端口 {PORT} 已被其他程序占用，请先在原终端停止该程序。")

    def start(self, *, open_browser: bool = True) -> ServiceStatus:
        with self._lock:
            current = self.status()
            if current.state == "error":
                raise self._error(current.message)
            if current.state == "stopped":
                pnpm = shutil.which("pnpm")
                node = shutil.which("node")
                if not pnpm or not node:
                    raise self._error("未找到 Node.js 或 pnpm，请安装后重试。")
                try:
                    with self.log_file.open("wb") as log:
                        self._build(pnpm, log)
                        self._start_preview(node, log)
                except OSError as exc:
                    raise self._error(f"无法启动练习室：{exc}") from exc
            if open_browser:
                self.open_browser()
            return self.status()

    def stop(self) -> ServiceStatus:
        with self._lock:
            self._stop_preview()
            return self.status()

    def open_browser(self) -> None:
        with self._lock:
            status = self.status()
            if not status.is_running:
                raise self._error(status.message)
            try:
                os.startfile(URL)
            except OSError as exc:
                raise self._error(f"请在浏览器打开 {URL}") from exc

    def _build(self, pnpm: str, log: BinaryIO) -> None:
        try:
            result = subprocess.run(
                [pnpm, "build"],
                cwd=self.root,
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NO_WINDOW,
                timeout=20 * 60,
            )
        except subprocess.TimeoutExpired as exc:
            raise self._error(f"构建超时，请查看 {self.log_file}") from exc
        if result.returncode:
            raise self._error(f"构建失败，请查看 {self.log_file}")

    def _start_preview(self, node: str, log: BinaryIO) -> None:
        script = self.root / "scripts" / "preview-roadtest-lab.mjs"
        preview = subprocess.Popen(
            [node, str(script), str(PORT)],
            cwd=self.root,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        self._preview = preview
        ready: Queue[bytes] = Queue()

        def read_ready_signal() -> None:
            assert preview.stdout is not None
            with preview.stdout:
                ready.put(preview.stdout.read(1))

        Thread(target=read_ready_signal, daemon=True).start()
        try:
            self._ready = ready.get(timeout=20) == b"1" and preview.poll() is None
        except Empty:
            pass
        if not self._ready:
            self._stop_preview()
            raise self._error(f"预览启动失败，请查看 {self.log_file}")

    def _stop_preview(self) -> None:
        preview = self._preview
        if preview is not None and preview.poll() is None:
            try:
                preview.terminate()
                preview.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise self._error(f"停止预览失败：{exc}") from exc
        self._clear_preview()

    def _clear_preview(self) -> None:
        if self._preview is not None and self._preview.stdin is not None:
            self._preview.stdin.close()
        self._preview = None
        self._ready = False

    def _status(self, state: ServiceState, message: str, pid: int | None = None) -> ServiceStatus:
        return ServiceStatus(state, URL, str(self.log_file), message, pid)

    def _error(self, message: str) -> ServiceError:
        return ServiceError(message, log_file=str(self.log_file))
