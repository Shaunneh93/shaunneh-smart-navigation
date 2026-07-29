// auth.ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const allowedEmails = (process.env.ALLOWED_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase());

      // Only allow sign in if their email is in your whitelist
      if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
        return true;
      }
      
      return false; // Blocks access for anyone else
    },
  },
});