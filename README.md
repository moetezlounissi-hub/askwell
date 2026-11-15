# Askwell

Phase 0 workspace: an empty Next.js App Router application and TypeScript package scaffolds. The home page and document title read `APP_NAME` from `@askwell/shared`. No service credentials are needed to install, build, or render it.

## Local development

Use Node.js 24 LTS and the pnpm version pinned in `package.json` (Corepack can activate it).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The dev server binds to `0.0.0.0` for sandbox access. Run commands from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the web app with Turbopack |
| `pnpm typecheck` | Generate Next.js route types and strictly check all four packages |
| `pnpm lint` | ESLint with Next.js and TypeScript rules; warnings fail |
| `pnpm test` | Vitest; currently reports no tests and exits successfully |
| `pnpm build` | Check scaffold packages and create the Next.js production build |

There are no API routes or pure functions to unit test in Phase 0. Vitest is ready for `*.test.ts` / `*.test.tsx` under `apps` and `packages`; no placeholder assertions are included. Scaffold package builds currently typecheck only and emit no artifacts. The widget has no loader or bundler yet; database types and helpers arrive in Phase 1.

| Package | Contents |
| --- | --- |
| `apps/web` | Next.js, React, Tailwind CSS |
| `apps/widget` | Empty vanilla TypeScript module |
| `packages/shared` | `APP_NAME` only; future contract changes need approval |
| `packages/db` | Empty module; no database connection or schema |

`.env.example` documents the future service variables with blank values. Real env files, dependency directories, build output, and local Vercel state are ignored. Do not put the automation bypass secret in application code or a public variable. Later phases will document which variables they need and where to configure them.

## Vercel monorepo setup (product owner)

1. Import `moetezlounissi-hub/askwell` into Vercel, selecting the Next.js framework preset and Node.js 24.x.
2. Set Root Directory to `apps/web`. Enable **Include source files outside of the Root Directory in the Build Step**, so the shared workspace package is available.
3. Set Install Command to `pnpm --dir ../.. install --frozen-lockfile` and Build Command to `pnpm --dir ../.. --filter @askwell/web build`. Keep Output Directory at Next.js's `.next` default, relative to `apps/web`. Vercel should use the repository's pinned pnpm version.
4. Enable GitHub PR preview deployments. Keep `main` as the production branch but **disable automatic production promotion before deploying**. Only the product owner may merge or promote; production launches in Phase 6.
5. Enable Deployment Protection and Protection Bypass for Automation. Add `VERCEL_AUTOMATION_BYPASS_SECRET` to Dwight's and Jim's HQ App variables under **Settings → Sandbox → App variables**, then restart the developers. Never send the value in chat or commit it.
6. Allow `*.vercel.app` in both developer sandboxes through HQ access requests. No application service keys are needed for Phase 0.

Preview verification uses the successful deployment URL reported by GitHub's PR comment or deployment status, never a guessed branch URL. Supply `x-vercel-protection-bypass` from the automation secret on HTTP and browser requests; also set `x-vercel-set-bypass-cookie: true` on the browser's first request. Verify the home page at 375px and desktop widths, its title, and absence of runtime errors. Record the URL and results on the PR. Repeat on the latest applicable preview after the owner merges, without promoting production.

Tasks and status live in HQ. Keep HQ's plan export disabled: `docs/plan.md` is maintained by humans.
