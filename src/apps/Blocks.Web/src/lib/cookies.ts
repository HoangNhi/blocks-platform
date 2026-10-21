import Cookies from "js-cookie";

const ACCESS_TOKEN = "access_token";
const REFRESH_TOKEN = "refresh_token";

export const saveTokens = (accessToken: string, refreshToken: string) => {
  Cookies.set(ACCESS_TOKEN, accessToken, {
    expires: new Date(
      Date.now() +
        Number(import.meta.env.VITE_ACCESS_TOKEN_EXPIRES) * 60 * 60 * 1000
    ),
    sameSite: "Lax",
    secure: window.location.protocol === "https:",
  });

  const refreshExpires =
    Number(import.meta.env.VITE_REFRESH_TOKEN_EXPIRES) || 7;
  Cookies.set(REFRESH_TOKEN, refreshToken, {
    expires: refreshExpires,
    sameSite: "Lax",
    secure: window.location.protocol === "https:",
  });
};

export const getAccessToken = () => Cookies.get(ACCESS_TOKEN);
export const getRefreshToken = () => Cookies.get(REFRESH_TOKEN);

export const clearTokens = () => {
  Cookies.remove(ACCESS_TOKEN);
  Cookies.remove(REFRESH_TOKEN);
};
