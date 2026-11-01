import unittest


class TestProtoStubs(unittest.TestCase):
    def test_stub_imports_and_request_structure(self):
        from knowledgehub.rpc import system_pb2, system_pb2_grpc

        req = system_pb2.CheckPermissionRequest(
            user_id="11111111-1111-1111-1111-111111111111",
            controller="knowledgehub",
            action=1,
        )
        self.assertEqual(req.user_id, "11111111-1111-1111-1111-111111111111")
        self.assertEqual(req.controller, "knowledgehub")
        self.assertEqual(req.action, 1)


if __name__ == "__main__":
    unittest.main()
