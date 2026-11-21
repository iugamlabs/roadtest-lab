from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from roadtest_launcher.single_instance import acquire_instance_lock


class SingleInstanceTest(unittest.TestCase):
    def test_lock_blocks_another_process_until_released(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"LOCALAPPDATA": directory, "XDG_RUNTIME_DIR": directory}
        ):
            command = [
                sys.executable,
                "-c",
                "from roadtest_launcher.single_instance import acquire_instance_lock; "
                "print(acquire_instance_lock() is not None)",
            ]
            lock = acquire_instance_lock()
            self.assertIsNotNone(lock)
            try:
                self.assertEqual(subprocess.check_output(command, text=True).strip(), "False")
            finally:
                lock.release()
            self.assertEqual(subprocess.check_output(command, text=True).strip(), "True")
