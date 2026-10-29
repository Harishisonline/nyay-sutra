import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isProtectedPath, tokenLooksValid } from "./lib/session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (tokenLooksValid(token)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/signin";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  const res = NextResponse.redirect(url, 307);
  if (token) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
