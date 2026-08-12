export const AUTHENTICATION_METHODS = ['local', 'google', 'facebook'] as const;

export type AuthenticationMethod = (typeof AUTHENTICATION_METHODS)[number];

export const AUTHENTICATION_CONFIGURATION = {
  applicationSessionPath: '/api/auth/session',
  identityService: 'microsoft-entra-external-id',
  methods: AUTHENTICATION_METHODS,
  platformSessionPath: '/.auth/me',
  providerName: 'aad',
  sessionService: 'azure-static-web-apps',
  signInPath: '/.auth/login/aad',
  signOutPath: '/.auth/logout',
} as const;

declare const gameHubUserIdBrand: unique symbol;

export type GameHubUserId = string & {
  readonly [gameHubUserIdBrand]: 'GameHubUserId';
};

export interface PlatformIdentityReference {
  provider: typeof AUTHENTICATION_CONFIGURATION.providerName;
  subject: string;
}

export interface AnonymousAuthSession {
  state: 'anonymous';
}

export interface AuthenticatedAuthSession {
  state: 'authenticated';
  userId: GameHubUserId;
}

export type AuthSession = AnonymousAuthSession | AuthenticatedAuthSession;
