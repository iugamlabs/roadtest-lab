from __future__ import annotations

import unittest

from roadtest_launcher.service import RoadtestService, ServiceError


class ServiceStatusParseTest(unittest.TestCase):
    def test_parse_running(self) -> None:
        status = RoadtestService._parse_status(
            '{"state":"running","url":"http://127.0.0.1:19237/",'
            '"logFile":"/tmp/preview.log","message":"练习室服务运行中。","pid":42}'
        )
        self.assertEqual(status.state, "running")
        self.assertEqual(status.pid, 42)
        self.assertTrue(status.is_running)

    def test_parse_uses_last_json_line(self) -> None:
        status = RoadtestService._parse_status(
            "noise\n"
            '{"state":"stopped","url":"http://127.0.0.1:19237/",'
            '"logFile":"/tmp/preview.log","message":"练习室尚未启动。"}'
        )
        self.assertEqual(status.state, "stopped")
        self.assertIsNone(status.pid)

    def test_parse_rejects_unknown_state(self) -> None:
        with self.assertRaises(ServiceError):
            RoadtestService._parse_status(
                '{"state":"bogus","url":"http://127.0.0.1:19237/","logFile":"","message":""}'
            )


if __name__ == "__main__":
    unittest.main()
