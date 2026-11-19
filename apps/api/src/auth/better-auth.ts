import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins/admin";
import type { PrismaClient } from "@prisma/client";
import { sendResetPasswordEmail, type MailerConfig } from "./mailer";
import { invalidateChangedVolunteerIdentity } from "../volunteers/verified-identity";

/**
 * Creates the better-auth instance used by both the NestJS AuthModule
 * and the JWT guard (via BETTER_AUTH_SECRET).
 *
 * basePath must match the path the frontend proxies to:
 *   apps/web/lib/auth.ts → ${API_BASE_URL}/api/v1/auth/*
 */
export function createBetterAuth(
  prisma: PrismaClient,
  secret: string,
  trustedOrigin?: string,
  corsOrigins?: string,
  baseURL?: string,
  mailerConfig?: MailerConfig,
) {
  // Build trusted origins from all configured sources.
  const fromCors = (corsOrigins ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origins = Array.from(
    new Set([
      ...(trustedOrigin ? [trustedOrigin] : ["http://localhost:3000"]),
      ...fromCors,
    ]),
  );
  const resolvedBaseURL = baseURL ?? "http://localhost:4000";
  return betterAuth({
    basePath: "/api/v1/auth",
    baseURL: resolvedBaseURL,
    advanced: {
      useSecureCookies: resolvedBaseURL.startsWith("https://"),
    },
    trustedOrigins: origins,
    database: prismaAdapter(prisma as Parameters<typeof prismaAdapter>[0], {
      provider: "postgresql",
    }),
    secret,
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        if (mailerConfig) {
          void sendResetPasswordEmail(user.email, url, mailerConfig);
        }
      },
    },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 15 },
    databaseHooks: {
      user: { update: { after: async (user) => { await invalidateChangedVolunteerIdentity(prisma, user); } } },
    },
    plugins: [
      admin(),
    ],
  });
}
