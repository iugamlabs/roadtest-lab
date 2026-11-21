from __future__ import annotations

import atexit
import errno
import os
from dataclasses import dataclass
from typing import BinaryIO

from roadtest_launcher.paths import gui_lock_path

if os.name == "nt":
    import msvcrt
else:
    import fcntl


@dataclass
class InstanceLock:
    handle: BinaryIO

    def release(self) -> None:
        # 关闭文件会释放系统锁，进程异常退出时同样如此。
        self.handle.close()


def acquire_instance_lock() -> InstanceLock | None:
    """获取 GUI 单实例锁。已被占用时返回 None。"""
    # 不截断文件。Windows 可以锁定空文件开头的一个字节。
    handle = gui_lock_path().open("a+b")
    try:
        if os.name == "nt":
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        handle.close()
        if exc.errno in {errno.EACCES, errno.EAGAIN}:
            return None
        raise

    lock = InstanceLock(handle)
    atexit.register(lock.release)
    return lock
