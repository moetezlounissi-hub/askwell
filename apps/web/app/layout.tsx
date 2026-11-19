import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import "./globals.css";

export const metadata: Metadata = { title: APP_NAME };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
          afterSignOutUrl="/sign-in"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
