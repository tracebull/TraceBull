import type { UserRole } from './UserRole';

export interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}
