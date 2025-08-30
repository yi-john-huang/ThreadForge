/**
 * Authentication Type Definitions for OAuth2 Integration
 * Based on Chrome Extension Identity API and Threads OAuth2 flow
 */

export interface AuthenticationContext {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  userId: string;
}

export interface OAuth2Config {
  clientId: string;
  scopes: string[];
  redirectUri: string;
  authUrl?: string;
  tokenUrl?: string;
}

export interface AuthenticationResult {
  success: boolean;
  context?: AuthenticationContext;
  error?: {
    code: string;
    message: string;
    description?: string;
  };
}

export interface TokenRefreshRequest {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}

export interface TokenRefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface AuthenticationStatus {
  isAuthenticated: boolean;
  userId?: string;
  scopes?: string[];
  expiresAt?: Date;
  needsRefresh: boolean;
}