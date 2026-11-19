-- better-auth Prisma adapter tables
-- https://www.better-auth.com/docs/installation#configure-database

CREATE TABLE "user" (
  "id"            TEXT        NOT NULL,
  "name"          TEXT,
  "email"         TEXT        NOT NULL,
  "emailVerified" BOOLEAN     NOT NULL DEFAULT false,
  "image"         TEXT,
  "role"          TEXT,
  "isAnonymous"   BOOLEAN     DEFAULT false,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_key" ON "user" ("email");

CREATE TABLE "session" (
  "id"          TEXT        NOT NULL,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "token"       TEXT        NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT        NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "session_token_key" ON "session" ("token");

CREATE TABLE "account" (
  "id"                      TEXT        NOT NULL,
  "accountId"               TEXT        NOT NULL,
  "providerId"              TEXT        NOT NULL,
  "userId"                  TEXT        NOT NULL,
  "accessToken"             TEXT,
  "refreshToken"            TEXT,
  "idToken"                 TEXT,
  "accessTokenExpiresAt"    TIMESTAMPTZ,
  "refreshTokenExpiresAt"   TIMESTAMPTZ,
  "scope"                   TEXT,
  "password"                TEXT,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE "verification" (
  "id"          TEXT        NOT NULL,
  "identifier"  TEXT        NOT NULL,
  "value"       TEXT        NOT NULL,
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
