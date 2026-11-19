import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/auth/crypto";

const PROTECTED = ["/dashboard", "/course", "/generating"];
const AUTH_PAGES = ["/login", "/signup", "/recover"];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.includes(pathname);
}

/**
 * Next 16 calls this "proxy" (the old middleware). The signature check here
 * is a pure HMAC over the cookie — no database — so it stays cheap, but it
 * must actually verify: trusting mere presence would bounce an invalid
 * cookie between `/login` and `/dashboard` forever, since the pages verify
 * the session themselves. A cookie that fails is cleared on the way out.
 * Account existence is still re-checked in server code before anything
 * private is rendered or written.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = verifySession(token) !== null;
  const stale = Boolean(token) && !signedIn;

  if (!signedIn && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    const response = NextResponse.redirect(url);
    if (stale) response.cookies.set(SESSION_COOKIE, "", { maxAge: 0 });
    return response;
  }

  if (signedIn && isAuthPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (stale) {
    const response = NextResponse.next();
    response.cookies.set(SESSION_COOKIE, "", { maxAge: 0 });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
