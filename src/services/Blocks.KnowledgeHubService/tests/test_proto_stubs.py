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

    def test_file_proto_stubs_and_source_sha256_field(self):
        from knowledgehub.rpc import file_pb2, file_pb2_grpc

        self.assertTrue(hasattr(file_pb2_grpc, "FileProtoStub"))
        req = file_pb2.UploadDataRequest(
            related_id="11111111-1111-1111-1111-111111111111",
            service_path="KnowledgeHub",
            folder_name="Documents",
            temp_folder="22222222-2222-2222-2222-222222222222",
        )
        self.assertEqual(req.service_path, "KnowledgeHub")
        self.assertEqual(req.folder_name, "Documents")

        attachment = file_pb2.ModelAttachmentProto(
            id="33333333-3333-3333-3333-333333333333",
            related_id="11111111-1111-1111-1111-111111111111",
            source_sha256="a" * 64,
        )
        self.assertEqual(attachment.source_sha256, "a" * 64)
        self.assertEqual(
            file_pb2.ModelAttachmentProto.DESCRIPTOR.fields_by_name["source_sha256"].number,
            9,
        )


if __name__ == "__main__":
    unittest.main()
