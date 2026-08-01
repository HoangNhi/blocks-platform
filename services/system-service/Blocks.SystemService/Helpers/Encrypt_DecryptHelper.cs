using Microsoft.AspNetCore.Cryptography.KeyDerivation;
using System.Security.Cryptography;
using System.Text;

namespace Blocks.SystemService.Helpers
{
    public class Encrypt_DecryptHelper
    {
        public static string GenerateSalt()
        {
            var salt = RandomNumberGenerator.GetBytes(128 / 8);
            return Convert.ToBase64String(salt);
        }

        public static string EncodePassword(string pass, string salt)
        {
            string hashed = Convert.ToBase64String(KeyDerivation.Pbkdf2(
                            password: pass!,
                            salt: Encoding.Unicode.GetBytes(salt),
                            prf: KeyDerivationPrf.HMACSHA256,
                            iterationCount: 100000,
                            numBytesRequested: 256 / 8));
            return hashed;
        }
    }
}
