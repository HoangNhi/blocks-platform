using Blocks.SystemService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using Npgsql;
using System.Data;

namespace Blocks.SystemService.Helpers
{
    public static class DBContextHelper
    {
        public static async Task<TModel> ExecuteFunction<TModel>(this SystemContext _context, string functionName, NpgsqlParameter[]? parameters) where TModel : new()
        {
            if (_context.Database.GetDbConnection().State != ConnectionState.Open)
            {
                _context.Database.OpenConnection();
            }

            await using var dbCommand = _context.Database.GetDbConnection().CreateCommand();
            dbCommand.CommandTimeout = 180;
            dbCommand.CommandType = CommandType.Text;
            string paramList = parameters != null && parameters.Length > 0
                ? string.Join(", ", parameters.Select(p => p.ParameterName + ":=@" + p.ParameterName.TrimStart('@')))
                : "";

            dbCommand.CommandText = $"SELECT {functionName}({paramList});";

            if (parameters != null)
                dbCommand.Parameters.AddRange(parameters);

            var result = await dbCommand.ExecuteScalarAsync();

            if (result == null || result == DBNull.Value)
                return new TModel();

            string json = result.ToString()!;
            try
            {
                var settings = new JsonSerializerSettings
                {
                    ContractResolver = new DefaultContractResolver
                    {
                        NamingStrategy = new SnakeCaseNamingStrategy()
                    }
                };
                var pagingResponse = JsonConvert.DeserializeObject<TModel>(json, settings);

                return pagingResponse ?? new TModel();
            }
            catch (Exception ex)
            {
                throw new Exception($"Error parsing JSON from PostgreSQL: {ex.Message}\nData: {json}");
            }
        }
    }
}
