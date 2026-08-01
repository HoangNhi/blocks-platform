using System;

namespace Blocks.AiVideoService.Api;

public record AiVideoEnvelope<T>(
    bool Success,
    T? Data = default,
    string? Message = null,
    string? ErrorCode = null
);

public static class AiVideoResponses
{
    public static AiVideoEnvelope<T> Ok<T>(T data) => new(true, data);
    public static AiVideoEnvelope<T> Fail<T>(string message, string? errorCode = null) => new(false, default, message, errorCode);
}
