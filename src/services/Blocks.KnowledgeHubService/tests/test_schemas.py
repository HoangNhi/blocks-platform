from datetime import datetime, timezone
import unittest
from uuid import UUID, uuid4

from pydantic import ValidationError

from knowledgehub.models import CollectionModel
from knowledgehub.schemas import (
    CollectionCreateRequest,
    CollectionListQuery,
    CollectionListResponse,
    CollectionResponse,
    CollectionUpdateRequest,
    validate_nonzero_uuid,
)


class TestSchemas(unittest.TestCase):
    def test_create_valid_request(self):
        req = CollectionCreateRequest(
            Name="  Hệ thống phân tán  ",
            Description="  Tài liệu nghiên cứu  ",
        )
        self.assertEqual(req.Name, "Hệ thống phân tán")
        self.assertEqual(req.Description, "Tài liệu nghiên cứu")

    def test_create_blank_description_normalized_to_none(self):
        req1 = CollectionCreateRequest(Name="Kho tri thức", Description="")
        self.assertIsNone(req1.Description)

        req2 = CollectionCreateRequest(Name="Kho tri thức", Description="   ")
        self.assertIsNone(req2.Description)

        req3 = CollectionCreateRequest(Name="Kho tri thức")
        self.assertIsNone(req3.Description)

    def test_create_whitespace_or_empty_name_rejected(self):
        for invalid_name in ["", "   ", "\t\n  "]:
            with self.subTest(name=invalid_name):
                with self.assertRaises(ValidationError):
                    CollectionCreateRequest(Name=invalid_name)

    def test_create_nul_character_rejected(self):
        with self.assertRaises(ValidationError):
            CollectionCreateRequest(Name="Clean\0Architecture")
        with self.assertRaises(ValidationError):
            CollectionCreateRequest(Name="Clean Architecture", Description="Notes\0bad")

    def test_create_name_length_boundaries(self):
        # Exactly 200 characters -> OK
        name_200 = "a" * 200
        req = CollectionCreateRequest(Name=name_200)
        self.assertEqual(len(req.Name), 200)

        # 201 characters -> Error
        name_201 = "a" * 201
        with self.assertRaises(ValidationError):
            CollectionCreateRequest(Name=name_201)

    def test_create_unicode_code_point_counting(self):
        # Vietnamese diacritics and supplementary characters (emoji/astral plane)
        # Python len() measures Unicode code points
        vietnamese_name = "Bộ sưu tập Kiến trúc Hệ thống Phân tán Đám mây & Trí tuệ Nhân tạo"
        req = CollectionCreateRequest(Name=vietnamese_name)
        self.assertEqual(req.Name, vietnamese_name)

        # Supplementary character (astral plane character U+2070E = 𠜎)
        astral_200 = "𠜎" * 200
        self.assertEqual(len(astral_200), 200)
        req_astral = CollectionCreateRequest(Name=astral_200)
        self.assertEqual(len(req_astral.Name), 200)

        astral_201 = "𠜎" * 201
        with self.assertRaises(ValidationError):
            CollectionCreateRequest(Name=astral_201)

    def test_create_description_length_boundaries(self):
        desc_2000 = "d" * 2000
        req = CollectionCreateRequest(Name="Valid Name", Description=desc_2000)
        self.assertEqual(len(req.Description or ""), 2000)

        desc_2001 = "d" * 2001
        with self.assertRaises(ValidationError):
            CollectionCreateRequest(Name="Valid Name", Description=desc_2001)

    def test_create_forbidden_extra_fields_rejected(self):
        forbidden_payloads = [
            {"Name": "Test", "Id": str(uuid4())},
            {"Name": "Test", "OwnerId": str(uuid4())},
            {"Name": "Test", "DeletedAt": datetime.now(timezone.utc).isoformat()},
            {"Name": "Test", "DocumentCount": 10},
            {"Name": "Test", "extra_field": "disallowed"},
        ]
        for payload in forbidden_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValidationError):
                    CollectionCreateRequest(**payload)

    def test_update_valid_request_and_omitted_description(self):
        req = CollectionUpdateRequest(Name="New Name")
        self.assertEqual(req.Name, "New Name")
        self.assertIsNone(req.Description)

        req_with_desc = CollectionUpdateRequest(Name="New Name", Description="Updated Desc")
        self.assertEqual(req_with_desc.Description, "Updated Desc")

    def test_update_whitespace_or_empty_name_rejected(self):
        with self.assertRaises(ValidationError):
            CollectionUpdateRequest(Name="   ")

    def test_update_forbidden_extra_fields_rejected(self):
        with self.assertRaises(ValidationError):
            CollectionUpdateRequest(Name="Test", OwnerId=str(uuid4()))
        with self.assertRaises(ValidationError):
            CollectionUpdateRequest(Name="Test", Id=str(uuid4()))
        with self.assertRaises(ValidationError):
            CollectionUpdateRequest(Name="Test", DeletedAt=datetime.now(timezone.utc).isoformat())

    def test_collection_response_from_model(self):
        col_id = uuid4()
        now = datetime(2026, 11, 14, 10, 0, 0, tzinfo=timezone.utc)

        class FakeModel:
            id = col_id
            name = "Backend Engineering"
            description = "Tài liệu kỹ thuật"
            created_at = now
            updated_at = now

        resp = CollectionResponse.from_model(FakeModel())
        self.assertEqual(resp.Id, str(col_id))
        self.assertEqual(resp.Name, "Backend Engineering")
        self.assertEqual(resp.Description, "Tài liệu kỹ thuật")
        self.assertEqual(resp.CreatedAt, now.isoformat())
        self.assertEqual(resp.UpdatedAt, now.isoformat())
        self.assertEqual(resp.DocumentCount, 0)

    def test_collection_list_response(self):
        col_resp = CollectionResponse(
            Id=str(uuid4()),
            Name="Test",
            Description=None,
            CreatedAt=datetime.now(timezone.utc).isoformat(),
            UpdatedAt=datetime.now(timezone.utc).isoformat(),
            DocumentCount=0,
        )
        list_resp = CollectionListResponse(
            Data=[col_resp],
            TotalRow=1,
            PageIndex=1,
            PageSize=50,
        )
        self.assertEqual(list_resp.TotalRow, 1)
        self.assertEqual(len(list_resp.Data), 1)

    def test_validate_nonzero_uuid(self):
        valid = uuid4()
        self.assertEqual(validate_nonzero_uuid(str(valid)), valid)
        self.assertEqual(validate_nonzero_uuid(valid), valid)

        zero_uuid = "00000000-0000-0000-0000-000000000000"
        with self.assertRaises(ValueError) as ctx:
            validate_nonzero_uuid(zero_uuid)
        self.assertIn("zero UUID", str(ctx.exception))

        with self.assertRaises(ValueError):
            validate_nonzero_uuid("invalid-uuid-string")

        with self.assertRaises(TypeError):
            validate_nonzero_uuid(12345)  # type: ignore

    def test_collection_list_query_paging_validation(self):
        # Valid defaults
        q = CollectionListQuery()
        self.assertEqual(q.page_index, 1)
        self.assertEqual(q.page_size, 50)

        # Custom valid
        q_custom = CollectionListQuery(page_index=2, page_size=100)
        self.assertEqual(q_custom.page_index, 2)
        self.assertEqual(q_custom.page_size, 100)

        # Invalid page_index (< 1)
        with self.assertRaises(ValidationError):
            CollectionListQuery(page_index=0)

        # Invalid page_size (< 1 or > 100)
        with self.assertRaises(ValidationError):
            CollectionListQuery(page_size=0)
        with self.assertRaises(ValidationError):
            CollectionListQuery(page_size=101)

    def test_collection_model_mapping(self):
        self.assertEqual(CollectionModel.__tablename__, "collections")
        self.assertEqual(CollectionModel.__table_args__, {"schema": "public"})
        cols = {c.name for c in CollectionModel.__table__.columns}
        expected = {"id", "owner_id", "name", "description", "created_at", "updated_at", "deleted_at"}
        self.assertEqual(cols, expected)
