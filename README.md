This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## PWA Distribution & Architecture Policy

> **ARCHITECTURAL DECISION**: This project is **PWA-only** by deliberate decision — no native APK or IPA static build/package should be introduced or served via raw file download links.
>
> Side-loaded APK files compiled with older Android target SDKs trigger Play Protect warnings (*"built for an older version of Android and doesn't include the latest privacy protections"*).
>
> Instead, installation uses browser-native WebAPK (`beforeinstallprompt` + `.prompt()`), which engages Google Chrome's WebAPK minting service. Chrome dynamically packages and installs the WebAPK using Google's current target SDK (Android 14+ / API level 34+), guaranteeing zero security or target SDK warnings.

## Environment Variables

| Name | Where it is used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | public (Row Level Security applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | bypasses RLS. Never give it a `NEXT_PUBLIC_` name — Next.js inlines those into browser code. The old `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE` is still read as a fallback until Vercel is updated. |
| `CRON_SECRET` | server only, optional | lets a scheduled job call `/api/notifications/check-stale` with `Authorization: Bearer <secret>` |

## Multi-event (Convention every August, Congress every December)

One row in `events` is the **current event** (`is_current = true`). Every page and API route reads it through `src/lib/events/current-event.ts` — never `events[0]`. API routes check permissions through `src/lib/auth/api-guard.ts` using the caller's `profiles.role` (never `user_metadata`). Database changes live in `supabase/migrations/` (see `supabase/README.md`).

## Role-Based Access Control (RBAC) Governing Principle

> **GOVERNING PRINCIPLE**: National Coordinator's permission set must always be a strict superset of Coordinator's. Any new feature granted to National Coordinator must be deliberately evaluated for whether Coordinator also needs it — never assume inheritance.


