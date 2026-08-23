export type LoginRequest = {
  username: string
  password: string
}

export type RegistrationAvailability = {
  isAvailable: boolean
}

export type RegistrationRequest = {
  username: string
  email: string
  fullname: string
  password: string
  invitationToken?: string | null
}

export type RegistrationResponse = {
  id: string
  username: string
  email: string
  fullname: string
  workspaceId: string
}

export type AuthUser = {
  id: string
  username: string
  fullname: string
  roleId: string
  roleName?: string | null
  email: string
  avatar?: string | null
}

export type LoginResponse = AuthUser & {
  accessToken: string
  refreshToken: string
}

export type RefreshTokenRequest = {
  refreshToken: string
}

export type TokenPair = {
  accessToken: string
  refreshToken: string
}

export type AuthSession = {
  user: AuthUser
  tokens: TokenPair
}

export type EditProfileRequest = {
  fullName: string
  email: string
  avatar?: string | null
}

export type ChangePasswordRequest = {
  oldPassword: string
  newPassword: string
  confirmNewPassword: string
}
