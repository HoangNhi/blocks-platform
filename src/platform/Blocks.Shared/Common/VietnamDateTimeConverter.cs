using System.Text.Json;
using System.Text.Json.Serialization;

namespace Blocks.Shared.Common
{
    public class VietnamDateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            var str = reader.GetString();
            if (string.IsNullOrEmpty(str)) return default;

            var dt = DateTime.Parse(str);

            // If string ends with "Z" or has offset, it's already UTC — return as UTC
            if (str.EndsWith("Z", StringComparison.OrdinalIgnoreCase) || str.Contains('+') || (str.Length > 19 && str[19] == '-'))
                return DateTime.SpecifyKind(dt.ToUniversalTime(), DateTimeKind.Utc);

            // Otherwise treat as UTC+7 input → convert to UTC for storage
            return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(dt, DateTimeKind.Unspecified), DateTimeHelper.VietnamTimeZone);
        }

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        {
            // Convert UTC stored value to UTC+7 for display, no "Z" suffix
            var vietnamTime = value.Kind == DateTimeKind.Utc
                ? TimeZoneInfo.ConvertTimeFromUtc(value, DateTimeHelper.VietnamTimeZone)
                : TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(value, DateTimeKind.Utc), DateTimeHelper.VietnamTimeZone);

            writer.WriteStringValue(vietnamTime.ToString("yyyy-MM-ddTHH:mm:ss"));
        }
    }

    public class VietnamNullableDateTimeConverter : JsonConverter<DateTime?>
    {
        private static readonly VietnamDateTimeConverter _inner = new();

        public override DateTime? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return null;
            return _inner.Read(ref reader, typeof(DateTime), options);
        }

        public override void Write(Utf8JsonWriter writer, DateTime? value, JsonSerializerOptions options)
        {
            if (value is null) { writer.WriteNullValue(); return; }
            _inner.Write(writer, value.Value, options);
        }
    }
}
