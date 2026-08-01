namespace Blocks.Shared.Exceptions
{
    public class BusinessException : Exception
    {
        public int StatusCode { get; }

        public BusinessException(string message, int statusCode = 400)
            : base(message)
        {
            StatusCode = statusCode;
        }

        public BusinessException(string message, Exception innerException, int statusCode = 400)
            : base(message, innerException)
        {
            StatusCode = statusCode;
        }
    }
}
