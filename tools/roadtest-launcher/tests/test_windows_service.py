from __future__ import annotations

import os
import socket
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from roadtest_launcher.service import ServiceError
from roadtest_launcher.windows_service import WindowsRoadtestService


@unittest.skipUnless(os.name == "nt", "Requires Windows")
class WindowsServiceTest(unittest.TestCase):
    def test_foreign_listener_blocks_start_and_survives_stop(self) -> None:
        with tempfile.TemporaryDirectory() as directory, socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            with (
                patch("roadtest_launcher.windows_service.runtime_dir", return_value=Path(directory)),
                patch("roadtest_launcher.windows_service.PORT", port),
            ):
                service = WindowsRoadtestService()
                self.assertEqual(service.status().state, "error")
                with self.assertRaisesRegex(ServiceError, str(port)):
                    service.start(open_browser=False)
                self.assertEqual(service.stop().state, "error")
                self.assertFalse(service.log_file.exists())
