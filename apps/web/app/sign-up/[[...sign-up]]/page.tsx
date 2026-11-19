import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-3 py-8">
      <Suspense fallback={<p role="status">Loading sign-up…</p>}>
        <SignUp />
      </Suspense>
    </main>
  );
}
