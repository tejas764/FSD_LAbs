import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Server-side: use internal localhost URL to avoid Codespaces tunnel auth redirects.
// Falls back to NEXT_PUBLIC_API_BASE_URL (works in standard deployments).
const API_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";
const AUTH_PROXY_PREFIX = "/api/v1/auth";

const SessionUserSchema = z.object({
  email: z.string().email(),
  role: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

const SessionEnvelopeSchema = z.object({
  session: z.record(z.string(), z.unknown()).nullable().optional(),
  user: SessionUserSchema.nullable().optional(),
  // fallback for wrapped responses
  data: z.object({ user: SessionUserSchema }).nullable().optional(),
});

function buildAuthUrl(pathname: string, search: string): string {
  const suffix = pathname.replace(/^\/api\/auth/, "");
  return `${API_BASE_URL}${AUTH_PROXY_PREFIX}${suffix}${search}`;
}

async function proxyAuthRequest(request: NextRequest): Promise<NextResponse> {
  let upstream: Response;
  try {
    upstream = await fetch(buildAuthUrl(request.nextUrl.pathname, request.nextUrl.search), {
      method: request.method,
      headers: request.headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { message: "Auth service unavailable" },
      { status: 503 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
}

export const auth = {
  api: {
    async getSession({ headers }: { headers: Headers }) {
      const cookie = headers.get("cookie");
      const response = await fetch(`${API_BASE_URL}${AUTH_PROXY_PREFIX}/get-session`, {
        method: "GET",
        headers: cookie ? { cookie } : undefined,
        cache: "no-store",
      });

      if (!response.ok) {
        return null;
      }

      const parsed = SessionEnvelopeSchema.safeParse(await response.json());
      if (!parsed.success) {
        return null;
      }

      const user = parsed.data.user ?? parsed.data.data?.user ?? null;
      if (!user) return null;
      return { user };
    },
  },
};

export async function authGET(request: NextRequest): Promise<NextResponse> {
  return proxyAuthRequest(request);
}

export async function authPOST(request: NextRequest): Promise<NextResponse> {
  return proxyAuthRequest(request);
}
