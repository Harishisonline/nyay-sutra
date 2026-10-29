import { type NextRequest, NextResponse } from "next/server";
import type { VerifyOtpResponse } from "@nyay/shared";
import { API_URL, ONBOARDING_SKIP_COOKIE, SESSION_COOKIE } from "@/lib/session";

/** Exchanges a verified OTP for an HttpOnly session cookie. The token never reaches client JS. */
export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.text();
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/api/v1/auth/verify-otp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { type: "about:blank", title: "Backend unreachable", status: 502 },
      { status: 502 },
    );
  }
  const payload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }
  const data = payload as VerifyOtpResponse;
  const res = NextResponse.json({ is_new_user: data.is_new_user, user: data.user });
  res.cookies.set(SESSION_COOKIE, data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: data.expires_in,
  });
  return res;
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await fetch(`${API_URL}/api/v1/auth/signout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(ONBOARDING_SKIP_COOKIE);
  return res;
}
