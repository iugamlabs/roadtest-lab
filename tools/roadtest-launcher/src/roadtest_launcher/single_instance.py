from __future__ import annotations

import atexit
import fcntl
import os
from dataclasses import dataclass
from typing import TextIO

from roadtest_launcher.paths import gui_lock_path


@dataclass
class InstanceLock:
    path: str
    handle: TextIO

    def release(self) -> None:
        try:
            fcntl.flock(self.handle.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            self.handle.close()
        except OSError:
            pass


def acquire_instance_lock() -> InstanceLock | None:
    """获取 GUI 单实例锁。已被占用时返回 None。"""
    path = gui_lock_path()
    handle = path.open("w", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None

    handle.seek(0)
    handle.truncate()
    handle.write(str(os.getpid()))
    handle.flush()

    lock = InstanceLock(path=str(path), handle=handle)

    def _cleanup() -> None:
        lock.release()

    atexit.register(_cleanup)
    return lock
