import type { NextAuthOptions, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { getServerSession } from "next-auth";

// ---------------------------------------------------------------------------
// Type extensions
// ---------------------------------------------------------------------------

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      has_paid: boolean;
      free_analysis_used: boolean;
    };
  }

  interface User {
    id: string;
    has_paid?: boolean;
    free_analysis_used?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    user_id?: string;
    has_paid?: boolean;
    free_analysis_used?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Backend URL
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Auth config
// ---------------------------------------------------------------------------

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${BACKEND_URL}/v1/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const data = await res.json();
          return {
            id: data.user_id,
            email: data.email,
            name: data.name || null,
            has_paid: data.has_paid ?? false,
            free_analysis_used: data.free_analysis_used ?? false,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user, account }) {
      // For OAuth providers, register/update the user in the backend
      if (account?.provider === "google" && user.email) {
        try {
          const res = await fetch(`${BACKEND_URL}/v1/auth/register-oauth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: user.email,
              name: user.name,
              provider: account.provider,
              provider_account_id: account.providerAccountId,
              image: user.image,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            user.id = data.user_id;
            user.has_paid = data.has_paid ?? false;
            user.free_analysis_used = data.free_analysis_used ?? false;
          }
        } catch {
          // Allow sign-in even if backend is temporarily unavailable
        }
      }
      return true;
    },

    async jwt({ token, user }) {
      if (user) {
        token.user_id = user.id;
        token.has_paid = user.has_paid ?? false;
        token.free_analysis_used = user.free_analysis_used ?? false;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.user_id ?? "";
        session.user.has_paid = token.has_paid ?? false;
        session.user.free_analysis_used = token.free_analysis_used ?? false;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export async function getAuthSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}
