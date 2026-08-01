using System;

namespace Blocks.AiVideoService.Importing;

internal class ChecksumConflictException : Exception
{
    public ChecksumConflictException(string message) : base(message)
    {
    }
}
