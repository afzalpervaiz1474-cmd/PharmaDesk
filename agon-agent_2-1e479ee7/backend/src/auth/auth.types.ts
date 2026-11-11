/** The authenticated caller, taken from a verified access token. */
export interface AuthUser {
  userId: string;
  pharmacyId: string;
  role: 'owner' | 'staff';
}

/** Claims stored in the access token. */
export interface JwtPayload {
  sub: string;
  pharmacyId: string;
  role: 'owner' | 'staff';
}

/** Public profile returned by the auth endpoints. Never includes the hash. */
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'staff';
  pharmacyId: string;
  pharmacyName: string;
  currencyCode: string;
}

export interface AuthResponse {
  accessToken: string;
  user: UserProfile;
}
