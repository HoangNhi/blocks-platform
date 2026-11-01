from typing import Any, Generic, TypeVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    Success: bool
    StatusCode: int
    Data: T | None = None
    Message: str | None = None


def success_response(data: Any = None, message: str | None = None) -> JSONResponse:
    payload = {
        "Success": True,
        "StatusCode": 200,
        "Data": data,
        "Message": message,
    }
    return JSONResponse(content=payload, status_code=200)


def error_response(status_code: int, message: str) -> JSONResponse:
    payload = {
        "Success": False,
        "StatusCode": status_code,
        "Data": None,
        "Message": message,
    }
    return JSONResponse(content=payload, status_code=200)


def setup_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        return error_response(400, "Dữ liệu yêu cầu không hợp lệ")

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        msg = "Yêu cầu không hợp lệ"
        if exc.status_code == 404:
            msg = "Không tìm thấy tài nguyên"
        elif exc.status_code == 405:
            msg = "Phương thức không được hỗ trợ"
        elif isinstance(exc.detail, str) and exc.detail:
            msg = exc.detail
        return error_response(exc.status_code, msg)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        payload = {
            "Success": False,
            "StatusCode": 500,
            "Data": None,
            "Message": "Đã xảy ra lỗi hệ thống",
        }
        return JSONResponse(content=payload, status_code=500)
