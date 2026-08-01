from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def success_response(
    data: Any = None,
    *,
    status_code: int = 200,
    message: str | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "Success": True,
            "StatusCode": status_code,
            "Data": data,
            "Message": message,
        },
    )


def error_response(status_code: int, message: str, data: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "Success": False,
            "StatusCode": status_code,
            "Data": data,
            "Message": message,
        },
    )


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def _handle_http_exception(_: Request, exc: HTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "TradeLab request failed."
        return error_response(exc.status_code, message)

    @app.exception_handler(RequestValidationError)
    async def _handle_validation_exception(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        first_error = errors[0]["msg"] if errors else "Validation failed."
        return error_response(400, first_error)

    @app.exception_handler(Exception)
    async def _handle_unexpected_exception(_: Request, exc: Exception) -> JSONResponse:
        return error_response(500, "TradeLab request failed.")
