import { auth } from "@/auth";

// Export the auth function directly as the Next.js middleware
export default auth;

// The matcher dictates which routes require authentication
export const config = {
  // This Regex protects all routes EXCEPT:
  // 1. Next.js static files (_next/static, _next/image)
  // 2. The favicon
  // 3. API routes (so your backend maps/auth routes don't get blocked)
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};