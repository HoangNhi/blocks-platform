namespace Blocks.SystemService.Services.CoreFeature.Registration;

public interface IBootstrapAdvisoryLock
{
    Task AcquireAsync(CancellationToken cancellationToken = default);
}
