// auth.ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth; // Requires a valid session to access protected routes
    },
    async signIn({ user }) {
      const allowedEmails = (process.env.ALLOWED_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLowerCase());

      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        return true;
      }
      return false;
    },
  },
});