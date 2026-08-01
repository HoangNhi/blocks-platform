using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Newtonsoft.Json;
using System.Net;

namespace Blocks.FileService.Middlewares
{
    public class GlobalExceptionHandler
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<GlobalExceptionHandler> _logger;
        private readonly IWebHostEnvironment _env;

        public GlobalExceptionHandler(RequestDelegate next, ILogger<GlobalExceptionHandler> logger, IWebHostEnvironment env)
        {
            _next = next;
            _logger = logger;
            _env = env;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception ex)
            {
                await HandleExceptionAsync(context, ex);
            }
        }

        private async Task HandleExceptionAsync(HttpContext context, Exception exception)
        {
            context.Response.ContentType = "application/json";
            context.Response.StatusCode = (int)HttpStatusCode.OK;

            string message;
            int statusCode;

            if (exception is BusinessException busEx)
            {
                message = busEx.Message;
                statusCode = busEx.StatusCode;
            }
            else
            {
                _logger.LogError(exception, "Lỗi hệ thống: {Message}", exception.Message);
                message = _env.IsDevelopment() ? exception.Message : "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.";
                statusCode = 500;
            }

            var response = new BaseResponse<string>
            {
                Success = false,
                StatusCode = statusCode,
                Message = message
            };

            var json = JsonConvert.SerializeObject(response);
            await context.Response.WriteAsync(json);
        }
    }
}
