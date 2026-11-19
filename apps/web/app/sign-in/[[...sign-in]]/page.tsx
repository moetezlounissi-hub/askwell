import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-3 py-8">
      <Suspense fallback={<p role="status">Loading sign-in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  );
}
