from __future__ import annotations

import queue
import threading
import traceback
from collections.abc import Callable
from tkinter import messagebox
from typing import Any

import customtkinter as ctk
import pystray

from roadtest_launcher.icons import tray_icon, window_icon
from roadtest_launcher.service import (
    RoadtestService,
    ServiceError,
    ServiceState,
    ServiceStatus,
)
from roadtest_launcher.single_instance import InstanceLock, acquire_instance_lock

_STATE_LABELS: dict[ServiceState, str] = {
    "stopped": "已停止",
    "starting": "正在准备…",
    "running": "运行中",
    "error": "出错了",
}

_POLL_MS = 2500
_BUTTON_HEIGHT = 56


class LauncherApp(ctk.CTk):
    def __init__(self, service: RoadtestService) -> None:
        super().__init__()
        self.service = service
        self.status = ServiceStatus(
            state="stopped",
            url="http://127.0.0.1:19237/",
            log_file="",
            message="正在读取状态…",
        )
        self._busy = False
        self._ui_queue: queue.Queue[Callable[[], None]] = queue.Queue()
        self._tray: pystray.Icon | None = None
        self._tray_thread: threading.Thread | None = None
        self._tray_available = False
        self._closing = False

        ctk.set_appearance_mode("system")
        ctk.set_default_color_theme("blue")

        self.title("路考练习室")
        self.geometry("440x360")
        self.minsize(400, 320)
        self.resizable(False, False)

        try:
            self.iconphoto(True, self._ctk_image(window_icon()))
        except Exception:
            pass

        self.protocol("WM_DELETE_WINDOW", self._on_close_window)

        root = ctk.CTkFrame(self, corner_radius=12)
        root.pack(fill="both", expand=True, padx=20, pady=20)

        ctk.CTkLabel(
            root,
            text="路考练习室",
            font=ctk.CTkFont(size=26, weight="bold"),
        ).pack(anchor="w", pady=(4, 2))

        ctk.CTkLabel(
            root,
            text="启动练习服务，并在浏览器中打开。",
            font=ctk.CTkFont(size=15),
            text_color=("gray30", "gray70"),
        ).pack(anchor="w", pady=(0, 16))

        status_card = ctk.CTkFrame(root, corner_radius=10)
        status_card.pack(fill="x", pady=(0, 16))

        self.state_dot = ctk.CTkLabel(
            status_card,
            text="●",
            font=ctk.CTkFont(size=18),
            width=28,
        )
        self.state_dot.pack(side="left", padx=(14, 4), pady=14)

        text_col = ctk.CTkFrame(status_card, fg_color="transparent")
        text_col.pack(side="left", fill="x", expand=True, padx=(0, 14), pady=10)

        self.state_label = ctk.CTkLabel(
            text_col,
            text="状态：读取中",
            font=ctk.CTkFont(size=18, weight="bold"),
            anchor="w",
        )
        self.state_label.pack(fill="x")

        self.message_label = ctk.CTkLabel(
            text_col,
            text="",
            font=ctk.CTkFont(size=14),
            text_color=("gray30", "gray70"),
            anchor="w",
            justify="left",
            wraplength=340,
        )
        self.message_label.pack(fill="x", pady=(2, 0))

        self.open_button = ctk.CTkButton(
            root,
            text="打开练习室",
            height=_BUTTON_HEIGHT,
            font=ctk.CTkFont(size=18, weight="bold"),
            command=self._on_open_clicked,
        )
        self.open_button.pack(fill="x", pady=(0, 10))

        self.stop_button = ctk.CTkButton(
            root,
            text="停止服务",
            height=_BUTTON_HEIGHT,
            font=ctk.CTkFont(size=18),
            fg_color=("gray75", "gray35"),
            hover_color=("gray65", "gray45"),
            text_color=("gray10", "gray90"),
            command=self._on_stop_clicked,
        )
        self.stop_button.pack(fill="x", pady=(0, 10))

        footer = ctk.CTkFrame(root, fg_color="transparent")
        footer.pack(fill="x", side="bottom")

        self.quit_button = ctk.CTkButton(
            footer,
            text="退出",
            height=40,
            width=100,
            font=ctk.CTkFont(size=15),
            fg_color="transparent",
            border_width=1,
            text_color=("gray20", "gray80"),
            command=self._on_quit_clicked,
        )
        self.quit_button.pack(side="right")

        self.hint_label = ctk.CTkLabel(
            footer,
            text="关闭窗口后仍可在托盘找到本程序",
            font=ctk.CTkFont(size=13),
            text_color=("gray40", "gray60"),
            anchor="w",
        )
        self.hint_label.pack(side="left", fill="x", expand=True)

        self.after(50, self._drain_ui_queue)
        self.after(100, self._bootstrap)
        self.after(_POLL_MS, self._poll_status)

    @staticmethod
    def _ctk_image(image: Any) -> Any:
        # CustomTkinter 6 使用 CTkImage；失败时退回 PIL 图。
        try:
            return ctk.CTkImage(light_image=image, dark_image=image, size=image.size)
        except Exception:
            return image

    def _bootstrap(self) -> None:
        self._refresh_status(blocking=False)
        self._start_tray()

    def _drain_ui_queue(self) -> None:
        if self._closing:
            return
        while True:
            try:
                callback = self._ui_queue.get_nowait()
            except queue.Empty:
                break
            try:
                callback()
            except Exception:
                traceback.print_exc()
        self.after(50, self._drain_ui_queue)

    def _call_ui(self, callback: Callable[[], None]) -> None:
        self._ui_queue.put(callback)

    def _set_busy(self, busy: bool) -> None:
        self._busy = busy
        self._sync_controls()

    def _apply_status(self, status: ServiceStatus) -> None:
        self.status = status
        self._sync_controls()
        self._update_tray_icon()

    def _sync_controls(self) -> None:
        state = self.status.state
        color = {
            "stopped": ("#6b7280", "#9ca3af"),
            "starting": ("#d97706", "#fbbf24"),
            "running": ("#059669", "#34d399"),
            "error": ("#dc2626", "#f87171"),
        }[state]
        self.state_dot.configure(text_color=color)
        self.state_label.configure(text=f"状态：{_STATE_LABELS[state]}")
        message = self.status.message or {
            "stopped": "点击下方按钮开始准备。",
            "starting": "正在构建并启动，请稍候。",
            "running": "可以开始练习了。",
            "error": "出了点问题，可把日志路径告诉帮忙安装的人。",
        }[state]
        if self.status.log_file and state == "error":
            message = f"{message}\n日志：{self.status.log_file}"
        self.message_label.configure(text=message)

        can_open = not self._busy
        can_stop = (not self._busy) and state in {"running", "starting", "error"}
        self.open_button.configure(
            state="normal" if can_open else "disabled",
            text="正在准备…" if self._busy and state == "starting" else "打开练习室",
        )
        self.stop_button.configure(state="normal" if can_stop else "disabled")
        self.quit_button.configure(state="normal" if not self._busy else "disabled")

    def _refresh_status(self, *, blocking: bool = False) -> None:
        if self._busy and not blocking:
            return

        def work() -> None:
            try:
                status = self.service.status()
            except Exception as exc:
                status = ServiceStatus(
                    state="error",
                    url=self.status.url,
                    log_file=self.status.log_file,
                    message=str(exc),
                )
            self._call_ui(lambda: self._apply_status(status))

        if blocking:
            work()
        else:
            threading.Thread(target=work, daemon=True).start()

    def _poll_status(self) -> None:
        if self._closing:
            return
        if not self._busy:
            self._refresh_status(blocking=False)
        self.after(_POLL_MS, self._poll_status)

    def _run_job(
        self,
        *,
        starting_message: str,
        job: Callable[[], ServiceStatus],
        afterwards: Callable[[ServiceStatus], None] | None = None,
    ) -> None:
        if self._busy:
            return
        self._set_busy(True)
        self._apply_status(
            ServiceStatus(
                state="starting",
                url=self.status.url,
                log_file=self.status.log_file,
                message=starting_message,
                pid=self.status.pid,
            )
        )

        def work() -> None:
            try:
                status = job()
            except ServiceError as exc:
                status = ServiceStatus(
                    state="error",
                    url=self.status.url,
                    log_file=exc.log_file or self.status.log_file,
                    message=str(exc),
                )
            except Exception as exc:
                status = ServiceStatus(
                    state="error",
                    url=self.status.url,
                    log_file=self.status.log_file,
                    message=str(exc),
                )

            def done() -> None:
                self._set_busy(False)
                self._apply_status(status)
                if afterwards and status.state != "error":
                    afterwards(status)
                elif status.state == "error":
                    messagebox.showerror("路考练习室", status.message or "操作失败")

            self._call_ui(done)

        threading.Thread(target=work, daemon=True).start()

    def _on_open_clicked(self) -> None:
        if self._busy:
            return
        self._set_busy(True)

        def work() -> None:
            try:
                current = self.service.status()
                if current.is_running:
                    self._call_ui(
                        lambda: self._apply_status(
                            ServiceStatus(
                                state="running",
                                url=current.url,
                                log_file=current.log_file,
                                message="正在打开浏览器…",
                                pid=current.pid,
                            )
                        )
                    )
                    self.service.open_browser()
                    status = self.service.status()
                else:
                    self._call_ui(
                        lambda: self._apply_status(
                            ServiceStatus(
                                state="starting",
                                url=current.url,
                                log_file=current.log_file,
                                message="正在准备练习室，请稍候。",
                                pid=current.pid,
                            )
                        )
                    )
                    status = self.service.start(open_browser=True)
            except ServiceError as exc:
                status = ServiceStatus(
                    state="error",
                    url=self.status.url,
                    log_file=exc.log_file or self.status.log_file,
                    message=str(exc),
                )
            except Exception as exc:
                status = ServiceStatus(
                    state="error",
                    url=self.status.url,
                    log_file=self.status.log_file,
                    message=str(exc),
                )

            def done() -> None:
                self._set_busy(False)
                self._apply_status(status)
                if status.state == "error":
                    messagebox.showerror("路考练习室", status.message or "操作失败")

            self._call_ui(done)

        threading.Thread(target=work, daemon=True).start()

    def _on_stop_clicked(self) -> None:
        if self._busy:
            return
        self._run_job(
            starting_message="正在停止服务…",
            job=self.service.stop,
        )

    def _on_quit_clicked(self) -> None:
        self._quit_app()

    def _on_close_window(self) -> None:
        if self._tray_available and self._tray is not None:
            self.withdraw()
            return
        self._quit_app()

    def _quit_app(self) -> None:
        if self._busy:
            messagebox.showinfo("路考练习室", "正在处理中，请稍后再退出。")
            return

        try:
            current = self.service.status()
        except Exception:
            current = self.status

        if current.state in {"running", "starting"}:
            if not messagebox.askyesno(
                "退出路考练习室",
                "退出后将停止练习室服务。确定退出吗？",
            ):
                return
            try:
                self.service.stop()
            except ServiceError as exc:
                if not messagebox.askyesno(
                    "停止失败",
                    f"{exc}\n\n仍要退出启动器吗？",
                ):
                    return

        self._closing = True
        self._stop_tray()
        self.destroy()

    def _start_tray(self) -> None:
        def on_show(icon: pystray.Icon, item: pystray.MenuItem) -> None:  # noqa: ARG001
            self._call_ui(self._show_window)

        def on_open(icon: pystray.Icon, item: pystray.MenuItem) -> None:  # noqa: ARG001
            self._call_ui(self._on_open_clicked)

        def on_stop(icon: pystray.Icon, item: pystray.MenuItem) -> None:  # noqa: ARG001
            self._call_ui(self._on_stop_clicked)

        def on_quit(icon: pystray.Icon, item: pystray.MenuItem) -> None:  # noqa: ARG001
            self._call_ui(self._quit_app)

        menu = pystray.Menu(
            pystray.MenuItem("显示窗口", on_show, default=True),
            pystray.MenuItem("打开练习室", on_open),
            pystray.MenuItem("停止服务", on_stop),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出", on_quit),
        )

        try:
            icon = pystray.Icon(
                "roadtest-lab",
                tray_icon(self.status.state),
                "路考练习室",
                menu,
            )
        except Exception:
            self._tray_available = False
            self.hint_label.configure(text="当前桌面无法显示托盘图标")
            return

        self._tray = icon
        self._tray_available = True
        self.hint_label.configure(text="关闭窗口后仍可在托盘找到本程序")

        def run_tray() -> None:
            try:
                icon.run()
            except Exception:
                self._tray_available = False
                self._call_ui(
                    lambda: self.hint_label.configure(text="托盘不可用，请保留本窗口")
                )

        self._tray_thread = threading.Thread(target=run_tray, daemon=True)
        self._tray_thread.start()

    def _stop_tray(self) -> None:
        tray = self._tray
        self._tray = None
        if tray is not None:
            try:
                tray.stop()
            except Exception:
                pass

    def _update_tray_icon(self) -> None:
        tray = self._tray
        if tray is None or not self._tray_available:
            return
        try:
            tray.icon = tray_icon(self.status.state)
            tray.title = f"路考练习室 · {_STATE_LABELS[self.status.state]}"
        except Exception:
            pass

    def _show_window(self) -> None:
        self.deiconify()
        self.lift()
        self.focus_force()


def _notify_already_running(service: RoadtestService) -> None:
    try:
        status = service.status()
        if status.is_running:
            service.open_browser()
            messagebox.showinfo(
                "路考练习室",
                "启动器已经在运行。若看不到窗口，请查看托盘图标。\n已尝试打开浏览器。",
            )
            return
    except Exception:
        pass
    messagebox.showinfo(
        "路考练习室",
        "启动器已经在运行。若看不到窗口，请查看托盘图标。",
    )


def main() -> None:
    ctk.set_appearance_mode("system")
    lock: InstanceLock | None = acquire_instance_lock()
    service = RoadtestService()

    if lock is None:
        # 无主窗口时也尽量弹出提示；tk 需要短生命周期 root。
        root = ctk.CTk()
        root.withdraw()
        _notify_already_running(service)
        root.destroy()
        return

    app = LauncherApp(service)
    app.mainloop()


if __name__ == "__main__":
    main()
