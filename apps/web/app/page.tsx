import { APP_NAME } from "@askwell/shared";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <h1 className="rounded-2xl border border-white/15 bg-white/5 px-10 py-8 text-4xl font-medium tracking-tight backdrop-blur-xl sm:text-5xl">
        {APP_NAME}
      </h1>
    </main>
  );
}
