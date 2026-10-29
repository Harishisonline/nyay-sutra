import { type NextRequest, NextResponse } from "next/server";
import { API_URL, SESSION_COOKIE } from "@/lib/session";

const PASSTHROUGH_RESPONSE_HEADERS = ["content-type", "content-disposition", "retry-after", "x-request-id"];

async function forward(request: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const target = `${API_URL}/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", request.headers.get("accept") ?? "application/json");
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      {
        type: "about:blank",
        title: "Backend unreachable",
        status: 502,
        detail: "The NYAY-SUTRA API did not respond. Is it running on API_URL?",
      },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }

  const outHeaders = new Headers();
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) outHeaders.set(name, value);
  }
  const res = new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
  if (upstream.status === 401 && token) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
