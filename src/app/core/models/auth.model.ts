export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  username: string;
  role: string;
  personaId: number;
  nombre: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface CurrentUser {
  username: string;
  role: string;
  personaId: number;
  nombre: string;
}
