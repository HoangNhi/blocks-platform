using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Blocks.Shared.Common
{
    public static class CommonFunc
    {
        public static string GetModelStateAPI(ModelStateDictionary modelState)
        {
            var errorList = (from item in modelState.Values
                             from error in item.Errors
                             select error.ErrorMessage).ToList();

            return errorList[0];
        }
    }
}
