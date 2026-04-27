import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION = "gd_session";

export function middleware(req: NextRequest) {
  if (!req.cookies.get(SESSION)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/library/:path*", "/projects/:path*"],
};
