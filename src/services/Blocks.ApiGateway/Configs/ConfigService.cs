namespace Blocks.ApiGateway.Configs
{
    public static class ConfigService
    {
        public static void ExecuteConfigService(this WebApplicationBuilder builder)
        {
            //CORS
            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(
                    policy =>
                    {
                        var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();
                        if (origins != null && origins.Length > 0)
                        {
                            policy.WithOrigins(origins)
                                  .AllowAnyHeader()
                                  .AllowAnyMethod();
                        }
                    });
            });
        }
    }
}
