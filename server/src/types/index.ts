export enum Role {
  USER = "USER",
  ADMIN = "ADMIN",
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface JwtPayload {
  userId: string;
  role: Role;
}
