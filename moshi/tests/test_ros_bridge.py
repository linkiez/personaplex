import json
import unittest
from unittest.mock import Mock, patch

from integrations.open_claw.ros_bridge import RosBridge, RosCommand


class RosBridgeTests(unittest.TestCase):
    def test_dispatch_logs_when_http_endpoint_is_not_set(self) -> None:
        bridge = RosBridge()

        with patch('integrations.open_claw.ros_bridge.logger') as logger_mock:
            bridge.dispatch(RosCommand(action='move', params={'distance_m': 1.0}))

        logger_mock.info.assert_called()

    def test_dispatch_posts_json_when_http_endpoint_is_set(self) -> None:
        bridge = RosBridge(http_endpoint='http://localhost:9000/ros/command', timeout_s=0.5)

        response = Mock()
        response.status = 202
        opener_context = Mock()
        opener_context.__enter__ = Mock(return_value=response)
        opener_context.__exit__ = Mock(return_value=False)

        with patch('integrations.open_claw.ros_bridge.request.urlopen', return_value=opener_context) as urlopen_mock:
            bridge.dispatch(RosCommand(action='turn', params={'angle_deg': 90}))

        self.assertEqual(urlopen_mock.call_count, 1)
        req = urlopen_mock.call_args[0][0]
        payload = json.loads(req.data.decode('utf-8'))
        self.assertEqual(payload['action'], 'turn')
        self.assertEqual(payload['params']['angle_deg'], 90)


if __name__ == '__main__':
    unittest.main()
