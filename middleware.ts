// middleware.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");

  // 1. If user is authenticated or accessing an auth API route, allow request
  if (isLoggedIn || isAuthRoute) {
    return NextResponse.next();
  }

  // 2. If user is NOT authenticated, redirect to the Google Sign-In page
  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  // Apply middleware to all pages except static assets and Next.js internals
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};