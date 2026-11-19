import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Role hierarchy (per auth.md and original_specs.md):
 *
 * REPORTER  – anonymous community member; submit reports only (no dashboard access)
 * VIEWER    – read-only UNDP staff; dashboard + view reports, no export/analytics
 * ANALYST   – UNDP field analyst; export data + analytics + all viewer access
 * ADMIN     – UNDP system admin; user management + crisis config + modular questions
 *
 * better-auth admin plugin stores this value in user.role.
 * JwtAuthGuard reads it from the Bearer JWT payload.role.
 */
export const Role = {
  REPORTER: "reporter",
  VIEWER: "viewer",
  ANALYST: "analyst",
  ADMIN: "admin",
} as const;

export type RoleValue = (typeof Role)[keyof typeof Role];
