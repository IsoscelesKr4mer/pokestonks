# Isosceles Insights: Auth and Photo Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a login on the app, then get photos from Michael's phone into the system: uploaded, deduplicated, converted, grouped into sessions, paired front-to-back and confirmed, with a job queued for the agent to scan.

**Architecture:** Google OAuth through Supabase, mirroring the pokestonks pattern so the same identity carries over. Photos land in Supabase Storage keyed by content hash. All image processing happens in a worker rather than the web app, because the app runs on Vercel and the worker runs on Michael's machine where there is a real filesystem. The queue is a database table; the Discord ping is only a doorbell.

**Tech Stack:** Next.js 16, Supabase Auth and Storage, Drizzle, Postgres, sharp, exifr, Vitest.

**Spec:** `../specs/2026-10-05-card-app-design.md`

**Plan 2 of 8.** Plan 1 (foundation and checklist registry) shipped on 2026-10-05; see
`2026-10-05-isosceles-insights-foundation-OUTCOME.md`. The spec's build order step 3
is "ingest, job queue and worker", which is too large for one plan, so it is split:
**this plan gets photos in, paired and queued**, and plan 3 does the model-driven
scan, checklist verification routing and the review queue. The later plans shift
up by one accordingly.

## Global Constraints

- **Nothing in this repository may ever call an LLM API.** There is no API key and there never will be. Model work is a job row drained by the agent session. This plan adds the queue, not a model call.
- **No em dashes** in any user-facing copy.
- **Money is always integer cents, never floats.** Format only at render time.
- **Dates are ISO `YYYY-MM-DD` strings or `date` columns**, never a datetime where time is not meaningful.
- **Read Postgres `DATE` columns as `::text`**, never through a JS `Date`, which renders a day early in Pacific.
- **Never run `drizzle-kit push`.** The live database holds Michael's real ledger in 17 tables absent from this schema; push would propose dropping them. Use `db:generate` then `db:migrate`, and read the SQL before applying it.
- **Drizzle is service-role only.** Files using it carry `import 'server-only'`. User-facing queries go through the Supabase client with RLS.
- **`npm run build` must pass**, not merely `tsc --noEmit` and Vitest.
- Repo: `C:\Users\Michael\Documents\Claude\Isosceles_Insights`, branch `main`, remote `origin` on GitHub, deployed at `https://isosceles-insights.vercel.app`.

---

## Decisions this plan locks in

**Auth is Google OAuth through Supabase**, mirroring pokestonks exactly. Same
Supabase project, so Michael's existing identity and `user_id`
`66200525-2237-4cc3-948f-aaafd3253d4b` carry over with no migration. Plan 1's
`lib/current-user.ts` reads `SEED_USER_ID` from the environment; this plan replaces
that with the real session user and leaves the environment variable for scripts only.

**Photos live in Supabase Storage.** Known risk, stated rather than hidden: a
billing lapse takes the bucket offline, which is exactly what happened to the old
app's images. The mitigation is that the originals on Michael's disk remain the
source of truth and are never deleted, so storage is a cache that can be rebuilt.

**All image work happens in the worker, not the web app.** The phone shoots HEIC,
which browsers cannot display and Vercel cannot convert without libheif. So the
upload path stores the original untouched, and the worker produces a JPEG
derivative plus extracted EXIF. The pairing UI waits for derivatives. This keeps one
code path for both intake routes instead of two.

**Two job types, one queue.** `normalise` runs after upload; `scan` is queued after
Michael confirms pairing and is drained in plan 3. Jobs are claimed atomically so a
duplicate Discord ping cannot cause duplicate work.

---

## File Structure

```
lib/supabase/
  browser.ts            # browser client
  server.ts             # server component client
  middleware.ts         # session refresh for middleware
lib/
  current-user.ts       # MODIFIED: session user, not env var
middleware.ts           # route gate
app/
  login/page.tsx
  login/login-button.tsx
  auth/callback/route.ts
  ingest/page.tsx       # upload + pairing confirm
  api/upload/route.ts
lib/db/schema/
  photos.ts             # uploaded originals and derivatives
  ingestBatches.ts      # a session of photos, becomes a rip
  ingestJobs.ts         # the queue
core/ingest/
  hash.ts               # content hashing
  storage.ts            # Supabase Storage read and write
  exif.ts               # EXIF extraction
  grouping.ts           # timestamp clustering into batches
  pairing.ts            # front/back pairing
  jobs.ts               # claim, complete, fail, sweep
  notify.ts             # Discord enqueue ping
scripts/
  watch-card-drop.ts    # local folder uploader
  worker.ts             # drains normalise jobs
```

---

### Task 1: Supabase auth helpers and the route gate

**Files:**
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `middleware.ts`
- Modify: `package.json`
- Test: `tests/unit/auth/middleware.test.ts`

**Interfaces:**
- Produces:
  - `createClient()` from `lib/supabase/browser.ts`, returning a browser Supabase client
  - `createClient()` from `lib/supabase/server.ts`, async, returning a server Supabase client
  - `updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }>`
  - `isPublicPath(path: string): boolean` from `middleware.ts`, exported for testing

**Context:** `@supabase/ssr` and `@supabase/supabase-js` were removed from
`package.json` in plan 1 because nothing used them. They come back here.

- [ ] **Step 1: Reinstall the Supabase packages**

```bash
npm install @supabase/ssr @supabase/supabase-js
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/auth/middleware.test.ts
import { describe, it, expect } from 'vitest';
import { isPublicPath } from '@/middleware';

describe('isPublicPath', () => {
  it('allows the login page', () => {
    expect(isPublicPath('/login')).toBe(true);
  });

  it('allows the oauth callback', () => {
    expect(isPublicPath('/auth/callback')).toBe(true);
  });

  it('gates the products page', () => {
    expect(isPublicPath('/products')).toBe(false);
  });

  it('gates a product detail page', () => {
    expect(isPublicPath('/products/48')).toBe(false);
  });

  it('gates the root', () => {
    expect(isPublicPath('/')).toBe(false);
  });

  it('gates the ingest page', () => {
    expect(isPublicPath('/ingest')).toBe(false);
  });

  it('does not treat a path that merely starts with the same letters as public', () => {
    expect(isPublicPath('/loginsomething')).toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/auth/middleware.test.ts`
Expected: FAIL, cannot resolve `@/middleware`.

- [ ] **Step 4: Write the three Supabase helpers**

```typescript
// lib/supabase/browser.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read only.
            // The middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    }
  );
}
```

```typescript
// lib/supabase/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 5: Write `middleware.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/auth/callback'];

/** Exported for testing. A path is public only on an exact match or a real
 *  sub-path, so "/loginsomething" stays gated. */
export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const { response, user } = await updateSession(request);

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/auth/middleware.test.ts`
Expected: all 7 PASS.

- [ ] **Step 7: Add the two public Supabase env vars to Vercel**

These are not secret, but the app will not build without them. The values are in
`.env.local` already.

```bash
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
```

- [ ] **Step 8: Commit**

```bash
git add lib/supabase middleware.ts tests/unit/auth package.json package-lock.json
git commit -m "feat(auth): supabase session helpers and the route gate"
```

---

### Task 2: Login page, OAuth callback, and the session user

**Files:**
- Create: `app/login/page.tsx`, `app/login/login-button.tsx`, `app/auth/callback/route.ts`, `app/logout/route.ts`
- Modify: `lib/current-user.ts`, `app/page.tsx`
- Test: `tests/unit/auth/current-user.test.ts`

**Interfaces:**
- Consumes: `createClient` from `lib/supabase/server.ts` and `lib/supabase/browser.ts` (Task 1)
- Produces:
  - `requireUserId(): Promise<string>` from `lib/current-user.ts`, now session-based and async
  - `getSessionUserId(client): Promise<string | null>`, the pure part, exported for testing

**Why Google:** pokestonks already uses Supabase Google OAuth against this same
project, so Michael's existing account and `user_id`
`66200525-2237-4cc3-948f-aaafd3253d4b` carry over with no migration and no new
password.

**Breaking change to be aware of:** plan 1's `requireUserId()` is synchronous and
reads `process.env.SEED_USER_ID`. It becomes async. Every caller must be updated.
`scripts/seed-checklists.ts` keeps using the environment variable directly, because
a script has no session.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/auth/current-user.test.ts
import { describe, it, expect } from 'vitest';
import { getSessionUserId } from '@/lib/current-user';

const clientWith = (user: { id: string } | null) =>
  ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) as never;

describe('getSessionUserId', () => {
  it('returns the id of the signed-in user', async () => {
    await expect(getSessionUserId(clientWith({ id: 'abc-123' }))).resolves.toBe('abc-123');
  });

  it('returns null when nobody is signed in', async () => {
    await expect(getSessionUserId(clientWith(null))).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/auth/current-user.test.ts`
Expected: FAIL, `getSessionUserId` is not exported.

- [ ] **Step 3: Rewrite `lib/current-user.ts`**

```typescript
import 'server-only';
import { createClient } from '@/lib/supabase/server';

type MinimalAuthClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

/** The pure part, so it can be tested without a real Supabase client. */
export async function getSessionUserId(
  client: MinimalAuthClient
): Promise<string | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.id ?? null;
}

/**
 * The signed-in user's id. Throws rather than falling back to a default, so a
 * missing session can never silently return another user's rows.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId(await createClient());
  if (!userId) throw new Error('Not signed in');
  return userId;
}
```

- [ ] **Step 4: Update the callers**

`app/products/page.tsx` and `app/products/[id]/page.tsx` already call
`requireUserId()`. It is now async, so each call site needs `await`. Search for it:

```bash
grep -rn "requireUserId" app/ core/ lib/ scripts/
```

Update every call in `app/` to `await requireUserId()`. **Do not change
`scripts/seed-checklists.ts`**, which reads `process.env.SEED_USER_ID` directly and
must keep doing so.

- [ ] **Step 5: Write the login page and button**

```tsx
// app/login/page.tsx
import { LoginButton } from './login-button';

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center px-6">
      <div className="w-full max-w-sm grid gap-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Isosceles Insights</h1>
        <p className="text-sm text-neutral-500">
          Sports card checklist and collection catalogue.
        </p>
        <LoginButton />
      </div>
    </main>
  );
}
```

```tsx
// app/login/login-button.tsx
'use client';
import { createClient } from '@/lib/supabase/browser';

export function LoginButton() {
  const handleClick = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <button
      onClick={handleClick}
      className="w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
    >
      Continue with Google
    </button>
  );
}
```

- [ ] **Step 6: Write the OAuth callback and logout routes**

```typescript
// app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
```

```typescript
// app/logout/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
```

- [ ] **Step 7: Run tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass. The build is the one that catches a missed `await` on
`requireUserId()` in a server component.

- [ ] **Step 8: Verify the Google provider is enabled in Supabase**

The provider must be on, and the callback URL registered. pokestonks already uses it
on this project, so it should be enabled; confirm the new app's callback URL is in
the allowed redirect list:

```
https://isosceles-insights.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

**If you cannot confirm this non-interactively, say so in your report and do not
guess.** Michael can add it in the Supabase dashboard in a few seconds.

- [ ] **Step 9: Commit**

```bash
git add app/login app/auth app/logout lib/current-user.ts app tests/unit/auth
git commit -m "feat(auth): google sign-in and session-scoped queries"
```

---

### Task 3: Photos, batches and jobs schema

**Files:**
- Create: `lib/db/schema/photos.ts`, `lib/db/schema/ingestBatches.ts`, `lib/db/schema/ingestJobs.ts`
- Modify: `lib/db/schema/index.ts`
- Test: `tests/unit/db/schema-ingest.test.ts`

**Interfaces:**
- Produces: `photos`, `ingestBatches`, `ingestJobs` tables, plus `JOB_TYPES`, `JOB_STATUSES`, `PHOTO_SIDES_PENDING`

**The hard rules this schema encodes:**
- A photo is identified by the **content hash of its bytes**, so re-dropping the same folder can never create a second row. That is what makes intake safe to re-run.
- A job is claimed with an atomic update, so a duplicated Discord ping cannot cause the same work twice.
- `ingest_jobs.payload` is deliberately small: a batch id, never the photo bytes. The queue is a doorbell, not a transport.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/db/schema-ingest.test.ts
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { photos } from '@/lib/db/schema/photos';
import { ingestBatches } from '@/lib/db/schema/ingestBatches';
import { ingestJobs, JOB_TYPES, JOB_STATUSES } from '@/lib/db/schema/ingestJobs';

const cols = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name);

describe('photos schema', () => {
  it('identifies a photo by its content hash', () => {
    expect(cols(photos)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'batch_id', 'content_hash', 'original_path',
        'original_filename', 'storage_path', 'derivative_path', 'side',
        'shot_at', 'width', 'height', 'bytes',
      ])
    );
  });

  it('makes the content hash unique per user, so a re-drop cannot duplicate', () => {
    const names = getTableConfig(photos).uniqueConstraints.map((u) => u.name);
    expect(names).toContain('photos_user_hash_unique');
  });
});

describe('ingest_batches schema', () => {
  it('records the window a session of photos was shot in', () => {
    expect(cols(ingestBatches)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'label', 'shot_from', 'shot_to', 'confirmed_at', 'rip_id',
      ])
    );
  });
});

describe('ingest_jobs schema', () => {
  it('has the two job types this plan and the next one need', () => {
    expect(JOB_TYPES).toEqual(['normalise', 'scan']);
  });

  it('has a status lifecycle that supports atomic claiming', () => {
    expect(JOB_STATUSES).toEqual(['queued', 'claimed', 'done', 'failed']);
  });

  it('carries a claim owner and timestamp', () => {
    expect(cols(ingestJobs)).toEqual(
      expect.arrayContaining([
        'id', 'user_id', 'type', 'status', 'batch_id', 'claimed_by',
        'claimed_at', 'attempts', 'last_error',
      ])
    );
  });

  it('indexes the queue scan', () => {
    const idx = getTableConfig(ingestJobs).indexes.map((i) => i.config.name);
    expect(idx).toContain('ingest_jobs_status_idx');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/db/schema-ingest.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Write the three schema files**

```typescript
// lib/db/schema/ingestBatches.ts
import {
  pgTable, bigserial, bigint, uuid, text, timestamp, index,
} from 'drizzle-orm/pg-core';

export const ingestBatches = pgTable(
  'ingest_batches',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    /** Human label, e.g. "2026-10-04 evening". Derived from the shot window. */
    label: text('label'),
    shotFrom: timestamp('shot_from', { withTimezone: true }),
    shotTo: timestamp('shot_to', { withTimezone: true }),
    /** Set when Michael has confirmed the front/back pairing. */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    /** The sealed-side rip this batch came from. No FK: rips is ported later. */
    ripId: bigint('rip_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('ingest_batches_user_idx').on(t.userId),
    confirmedIdx: index('ingest_batches_confirmed_idx').on(t.confirmedAt),
  })
);

export type IngestBatch = typeof ingestBatches.$inferSelect;
export type NewIngestBatch = typeof ingestBatches.$inferInsert;
```

```typescript
// lib/db/schema/photos.ts
import {
  pgTable, bigserial, bigint, uuid, text, integer, timestamp, index, unique, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ingestBatches } from './ingestBatches';

/** A photo's side before a card exists. 'unknown' until pairing decides. */
export const PHOTO_SIDES_PENDING = ['front', 'back', 'unknown'] as const;

export const photos = pgTable(
  'photos',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    batchId: bigint('batch_id', { mode: 'number' }).references(() => ingestBatches.id),

    /**
     * SHA-256 of the file bytes. This is the identity of a photo. Re-dropping
     * the same folder re-computes the same hash and conflicts, which is what
     * makes intake safe to re-run.
     */
    contentHash: text('content_hash').notNull(),
    /** Where it came from on Michael's disk, for tracing back to the original. */
    originalPath: text('original_path'),
    originalFilename: text('original_filename').notNull(),
    /** The untouched upload in Supabase Storage. */
    storagePath: text('storage_path'),
    /** A browser-displayable JPEG the worker produced. Null until normalised. */
    derivativePath: text('derivative_path'),

    side: text('side').notNull().default('unknown'),
    /** EXIF capture time. Null if the file carried none. */
    shotAt: timestamp('shot_at', { withTimezone: true }),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('photos_user_idx').on(t.userId),
    batchIdx: index('photos_batch_idx').on(t.batchId),
    shotAtIdx: index('photos_shot_at_idx').on(t.shotAt),
    userHashUnique: unique('photos_user_hash_unique').on(t.userId, t.contentHash),
    sideCheck: check(
      'photos_side_valid',
      sql`${t.side} IN ('front', 'back', 'unknown')`
    ),
  })
);

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
```

```typescript
// lib/db/schema/ingestJobs.ts
import {
  pgTable, bigserial, bigint, uuid, text, integer, timestamp, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ingestBatches } from './ingestBatches';

export const JOB_TYPES = ['normalise', 'scan'] as const;
export const JOB_STATUSES = ['queued', 'claimed', 'done', 'failed'] as const;

export const ingestJobs = pgTable(
  'ingest_jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('queued'),
    /** The only payload a job carries. Never the photo bytes. */
    batchId: bigint('batch_id', { mode: 'number' })
      .notNull()
      .references(() => ingestBatches.id),

    /** Identifies the worker holding the claim, for diagnosis. */
    claimedBy: text('claimed_by'),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index('ingest_jobs_status_idx').on(t.status),
    userIdx: index('ingest_jobs_user_idx').on(t.userId),
    batchIdx: index('ingest_jobs_batch_idx').on(t.batchId),
    typeCheck: check('ingest_jobs_type_valid', sql`${t.type} IN ('normalise', 'scan')`),
    statusCheck: check(
      'ingest_jobs_status_valid',
      sql`${t.status} IN ('queued', 'claimed', 'done', 'failed')`
    ),
    attemptsCheck: check('ingest_jobs_attempts_nonneg', sql`${t.attempts} >= 0`),
  })
);

export type IngestJob = typeof ingestJobs.$inferSelect;
export type NewIngestJob = typeof ingestJobs.$inferInsert;
```

- [ ] **Step 4: Extend `lib/db/schema/index.ts`**

Append the three new exports to the existing list:

```typescript
export * from './ingestBatches';
export * from './photos';
export * from './ingestJobs';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/db/schema-ingest.test.ts`
Expected: all 6 PASS.

- [ ] **Step 6: Generate and apply the migration**

```bash
npm run db:generate
```

**Read the generated SQL in full before applying it.** It must contain only
`CREATE TABLE`, `CREATE INDEX`, constraint and foreign-key statements for
`ingest_batches`, `photos` and `ingest_jobs`. **If it contains any `DROP`, or any
`ALTER` or `TRUNCATE` touching a table you did not create in this task, STOP, do not
migrate, and report it with the SQL quoted.** The database holds Michael's live
ledger in tables this repo does not model.

```bash
npm run db:migrate
```

- [ ] **Step 7: Commit**

```bash
git add lib/db drizzle tests/unit/db/schema-ingest.test.ts
git commit -m "feat(db): photos, ingest batches and the job queue"
```

---

### Task 4: Content hashing and storage

**Files:**
- Create: `core/ingest/hash.ts`, `core/ingest/storage.ts`
- Test: `tests/unit/ingest/hash.test.ts`

**Interfaces:**
- Produces:
  - `hashBytes(bytes: Buffer | Uint8Array): string`, a lowercase hex SHA-256
  - `storageKeyFor(userId: string, hash: string, ext: string): string`
  - `derivativeKeyFor(userId: string, hash: string): string`
  - `uploadOriginal(userId, hash, ext, bytes): Promise<string>`
  - `uploadDerivative(userId, hash, bytes): Promise<string>`
  - `downloadObject(key: string): Promise<Buffer>`
  - `signedDerivativeUrl(key: string, seconds?: number): Promise<string>`
  - `BUCKET = 'card-photos'`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/hash.test.ts
import { describe, it, expect } from 'vitest';
import { hashBytes, storageKeyFor, derivativeKeyFor } from '@/core/ingest/hash';

describe('hashBytes', () => {
  it('produces the known SHA-256 of an empty input', () => {
    expect(hashBytes(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('produces the known SHA-256 of "abc"', () => {
    expect(hashBytes(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('gives identical bytes an identical hash, which is what makes re-drop safe', () => {
    expect(hashBytes(Buffer.from('same'))).toBe(hashBytes(Buffer.from('same')));
  });

  it('gives different bytes a different hash', () => {
    expect(hashBytes(Buffer.from('a'))).not.toBe(hashBytes(Buffer.from('b')));
  });
});

describe('storage keys', () => {
  it('namespaces originals by user and hash', () => {
    expect(storageKeyFor('user-1', 'deadbeef', '.heic')).toBe(
      'user-1/originals/deadbeef.heic'
    );
  });

  it('lowercases and normalises the extension', () => {
    expect(storageKeyFor('user-1', 'deadbeef', 'JPG')).toBe(
      'user-1/originals/deadbeef.jpg'
    );
  });

  it('always gives a derivative a .jpg key', () => {
    expect(derivativeKeyFor('user-1', 'deadbeef')).toBe(
      'user-1/derivatives/deadbeef.jpg'
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/hash.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/ingest/hash.ts`**

```typescript
import { createHash } from 'node:crypto';

/**
 * SHA-256 of the file bytes, lowercase hex. This is a photo's identity:
 * re-dropping the same folder recomputes the same hash and conflicts on
 * photos_user_hash_unique, so intake is safe to re-run any number of times.
 */
export function hashBytes(bytes: Buffer | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normaliseExt(ext: string): string {
  const lower = ext.toLowerCase();
  const withDot = lower.startsWith('.') ? lower : `.${lower}`;
  return withDot === '.jpeg' ? '.jpg' : withDot;
}

export function storageKeyFor(userId: string, hash: string, ext: string): string {
  return `${userId}/originals/${hash}${normaliseExt(ext)}`;
}

export function derivativeKeyFor(userId: string, hash: string): string {
  return `${userId}/derivatives/${hash}.jpg`;
}
```

- [ ] **Step 4: Implement `core/ingest/storage.ts`**

```typescript
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { storageKeyFor, derivativeKeyFor } from './hash';

export const BUCKET = 'card-photos';

/**
 * Service-role client. Storage writes happen server side only, so the anon key
 * is never used here and no RLS policy is needed on the bucket.
 */
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service credentials are not set');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function upload(key: string, bytes: Buffer, contentType: string) {
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(key, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed for ${key}: ${error.message}`);
  return key;
}

export async function uploadOriginal(
  userId: string,
  hash: string,
  ext: string,
  bytes: Buffer
): Promise<string> {
  return upload(storageKeyFor(userId, hash, ext), bytes, 'application/octet-stream');
}

export async function uploadDerivative(
  userId: string,
  hash: string,
  bytes: Buffer
): Promise<string> {
  return upload(derivativeKeyFor(userId, hash), bytes, 'image/jpeg');
}

export async function downloadObject(key: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from(BUCKET).download(key);
  if (error || !data) {
    throw new Error(`Storage download failed for ${key}: ${error?.message ?? 'no data'}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** A signed URL for the pairing UI. Derivatives only; originals stay private. */
export async function signedDerivativeUrl(key: string, seconds = 3600): Promise<string> {
  const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(key, seconds);
  if (error || !data) {
    throw new Error(`Signed URL failed for ${key}: ${error?.message ?? 'no data'}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 5: Create the storage bucket**

The bucket must exist and must be **private**. Create it with a one-off script:

```bash
npx tsx -e "
async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { createClient } = await import('@supabase/supabase-js');
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await c.storage.createBucket('card-photos', { public: false });
  console.log(error ? 'error: ' + error.message : 'created: ' + JSON.stringify(data));
  const { data: list } = await c.storage.listBuckets();
  console.log('buckets:', list?.map((b) => b.name + (b.public ? ' (PUBLIC)' : ' (private)')).join(', '));
}
main();
"
```

Expected: the bucket is created, or reports that it already exists, and the listing
shows it as **private**. **If it reports public, stop and report it** rather than
uploading photos into a world-readable bucket.

- [ ] **Step 6: Run tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add core/ingest tests/unit/ingest
git commit -m "feat(ingest): content hashing and private photo storage"
```

---

### Task 5: EXIF extraction and session grouping

**Files:**
- Create: `core/ingest/exif.ts`, `core/ingest/grouping.ts`
- Modify: `package.json`
- Test: `tests/unit/ingest/grouping.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `readCaptureTime(bytes: Buffer): Promise<Date | null>`
  - `type Groupable = { id: number; shotAt: Date | null }`
  - `groupByShotAt<T extends Groupable>(items: T[], gapMinutes?: number): T[][]`
  - `labelForWindow(from: Date | null, to: Date | null): string`

**Why timestamp clustering:** Michael shoots a whole rip in one sitting. A gap in
capture times is the natural boundary between one session and the next, and it
reconstructs his past rips from the backfill for free. The default gap is 45
minutes, chosen so a pause to open more packs does not split a rip.

- [ ] **Step 1: Install the EXIF reader**

```bash
npm install exifr
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/ingest/grouping.test.ts
import { describe, it, expect } from 'vitest';
import { groupByShotAt, labelForWindow } from '@/core/ingest/grouping';

const at = (iso: string) => new Date(iso);

describe('groupByShotAt', () => {
  it('keeps photos shot minutes apart in one group', () => {
    const groups = groupByShotAt([
      { id: 1, shotAt: at('2026-10-04T19:00:00Z') },
      { id: 2, shotAt: at('2026-10-04T19:03:00Z') },
      { id: 3, shotAt: at('2026-10-04T19:07:00Z') },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('splits on a gap longer than the threshold', () => {
    const groups = groupByShotAt([
      { id: 1, shotAt: at('2026-10-04T19:00:00Z') },
      { id: 2, shotAt: at('2026-10-04T21:00:00Z') },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('sorts out-of-order input before grouping', () => {
    const groups = groupByShotAt([
      { id: 3, shotAt: at('2026-10-04T19:07:00Z') },
      { id: 1, shotAt: at('2026-10-04T19:00:00Z') },
      { id: 2, shotAt: at('2026-10-04T19:03:00Z') },
    ]);
    expect(groups[0].map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('puts photos with no timestamp in their own trailing group', () => {
    const groups = groupByShotAt([
      { id: 1, shotAt: at('2026-10-04T19:00:00Z') },
      { id: 2, shotAt: null },
      { id: 3, shotAt: null },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1].map((p) => p.id)).toEqual([2, 3]);
  });

  it('returns nothing for an empty input', () => {
    expect(groupByShotAt([])).toEqual([]);
  });

  it('honours a custom gap', () => {
    const items = [
      { id: 1, shotAt: at('2026-10-04T19:00:00Z') },
      { id: 2, shotAt: at('2026-10-04T19:30:00Z') },
    ];
    expect(groupByShotAt(items, 15)).toHaveLength(2);
    expect(groupByShotAt(items, 60)).toHaveLength(1);
  });
});

describe('labelForWindow', () => {
  it('labels a window by its ISO date', () => {
    expect(labelForWindow(at('2026-10-04T19:00:00Z'), at('2026-10-04T20:00:00Z')))
      .toBe('2026-10-04');
  });

  it('shows a range when a session crosses midnight UTC', () => {
    expect(labelForWindow(at('2026-10-04T23:00:00Z'), at('2026-10-05T01:00:00Z')))
      .toBe('2026-10-04 to 2026-10-05');
  });

  it('falls back when there is no timestamp at all', () => {
    expect(labelForWindow(null, null)).toBe('undated');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/grouping.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `core/ingest/grouping.ts`**

```typescript
export type Groupable = { id: number; shotAt: Date | null };

const DEFAULT_GAP_MINUTES = 45;

/**
 * Cluster photos into shooting sessions by capture-time gap. Michael shoots a
 * whole rip in one sitting, so a long gap is the natural boundary between one
 * session and the next. 45 minutes is wide enough that pausing to open more
 * packs does not split a rip in two.
 *
 * Photos with no EXIF timestamp cannot be placed in time, so they are kept
 * together in a single trailing group rather than guessed at.
 */
export function groupByShotAt<T extends Groupable>(
  items: T[],
  gapMinutes: number = DEFAULT_GAP_MINUTES
): T[][] {
  if (items.length === 0) return [];

  const dated = items
    .filter((i) => i.shotAt !== null)
    .sort((a, b) => a.shotAt!.getTime() - b.shotAt!.getTime());
  const undated = items.filter((i) => i.shotAt === null);

  const gapMs = gapMinutes * 60 * 1000;
  const groups: T[][] = [];
  let current: T[] = [];

  for (const item of dated) {
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const previous = current[current.length - 1];
    if (item.shotAt!.getTime() - previous.shotAt!.getTime() > gapMs) {
      groups.push(current);
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) groups.push(current);
  if (undated.length > 0) groups.push(undated);

  return groups;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** A human label for a batch. ISO dates, per the project's date rule. */
export function labelForWindow(from: Date | null, to: Date | null): string {
  if (!from || !to) return 'undated';
  const a = isoDate(from);
  const b = isoDate(to);
  return a === b ? a : `${a} to ${b}`;
}
```

- [ ] **Step 5: Implement `core/ingest/exif.ts`**

```typescript
import exifr from 'exifr';

/**
 * The capture time from EXIF, or null if the file carries none. Tries the
 * original capture tags before falling back to the generic DateTime, because a
 * photo edited on the phone can carry a later DateTime than when it was shot.
 */
export async function readCaptureTime(bytes: Buffer): Promise<Date | null> {
  try {
    const tags = await exifr.parse(bytes, {
      pick: ['DateTimeOriginal', 'CreateDate', 'DateTime'],
    });
    const value = tags?.DateTimeOriginal ?? tags?.CreateDate ?? tags?.DateTime;
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    // A file with no readable EXIF is normal, not an error.
    return null;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ingest/grouping.test.ts`
Expected: all 9 PASS.

- [ ] **Step 7: Verify EXIF reading against Michael's real photos**

```bash
npx tsx -e "
async function main() {
  const { readCaptureTime } = await import('./core/ingest/exif');
  const { readdir, readFile } = await import('node:fs/promises');
  const DIR = 'C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/card drop';
  const files = (await readdir(DIR)).filter((f) => /\.(heic|jpe?g)\$/i.test(f)).slice(0, 12);
  let withTime = 0;
  for (const f of files) {
    const t = await readCaptureTime(await readFile(DIR + '/' + f));
    if (t) withTime++;
    console.log(f.padEnd(18), t ? t.toISOString() : 'no EXIF time');
  }
  console.log('read a capture time from', withTime, 'of', files.length);
}
main();
"
```

Expected: most files report a real timestamp. **HEIC is the important case**, since
that is what his phone shoots. If HEIC files all report no EXIF time, say so in your
report, because session grouping depends on it.

- [ ] **Step 8: Commit**

```bash
git add core/ingest/exif.ts core/ingest/grouping.ts tests/unit/ingest/grouping.test.ts package.json package-lock.json
git commit -m "feat(ingest): exif capture time and session grouping"
```

---

### Task 6: Front and back pairing

**Files:**
- Create: `core/ingest/pairing.ts`
- Test: `tests/unit/ingest/pairing.test.ts`

**Interfaces:**
- Consumes: `Groupable` shape from Task 5
- Produces:
  - `type Pairable = { id: number; shotAt: Date | null; side: string }`
  - `type Pair = { front: Pairable; back: Pairable | null }`
  - `pairPhotos<T extends Pairable>(photos: T[]): { pairs: { front: T; back: T | null }[]; confident: boolean }`

**Why this needs a confirm step.** Michael shoots a card's front then its back, so
alternating order is the common case. But he also sometimes shoots a run of fronts
then a run of backs. The two are indistinguishable from timestamps alone, so this
function makes its best guess, reports whether it is confident, and the UI always
asks. The spec is explicit that the confirm step is not optional.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/pairing.test.ts
import { describe, it, expect } from 'vitest';
import { pairPhotos } from '@/core/ingest/pairing';

const p = (id: number, seconds: number) => ({
  id,
  shotAt: new Date(Date.UTC(2026, 9, 4, 19, 0, seconds)),
  side: 'unknown',
});

describe('pairPhotos', () => {
  it('pairs alternating front and back shots in order', () => {
    const { pairs } = pairPhotos([p(1, 0), p(2, 4), p(3, 20), p(4, 24)]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].front.id).toBe(1);
    expect(pairs[0].back?.id).toBe(2);
    expect(pairs[1].front.id).toBe(3);
    expect(pairs[1].back?.id).toBe(4);
  });

  it('leaves a trailing odd photo with no back', () => {
    const { pairs } = pairPhotos([p(1, 0), p(2, 4), p(3, 20)]);
    expect(pairs).toHaveLength(2);
    expect(pairs[1].back).toBeNull();
  });

  it('reports low confidence when the gaps give no alternating rhythm', () => {
    // Evenly spaced shots look the same whether they alternate or not.
    const { confident } = pairPhotos([p(1, 0), p(2, 10), p(3, 20), p(4, 30)]);
    expect(confident).toBe(false);
  });

  it('reports confidence when within-pair gaps are much shorter than between-pair gaps', () => {
    const { confident } = pairPhotos([p(1, 0), p(2, 2), p(3, 30), p(4, 32)]);
    expect(confident).toBe(true);
  });

  it('respects a side already assigned rather than overriding it', () => {
    const photos = [
      { id: 1, shotAt: new Date('2026-10-04T19:00:00Z'), side: 'back' },
      { id: 2, shotAt: new Date('2026-10-04T19:00:02Z'), side: 'front' },
    ];
    const { pairs } = pairPhotos(photos);
    expect(pairs[0].front.id).toBe(2);
    expect(pairs[0].back?.id).toBe(1);
  });

  it('handles an empty input', () => {
    expect(pairPhotos([])).toEqual({ pairs: [], confident: false });
  });

  it('handles a single photo', () => {
    const { pairs } = pairPhotos([p(1, 0)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].back).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/pairing.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/ingest/pairing.ts`**

```typescript
export type Pairable = { id: number; shotAt: Date | null; side: string };

/**
 * Pair photos front-to-back in capture order.
 *
 * The common case is front, back, front, back, so consecutive pairs are the
 * best guess. Michael also sometimes shoots a run of fronts then a run of
 * backs, and from timestamps alone the two are indistinguishable. So this
 * reports `confident` and the UI ALWAYS asks him to confirm. The spec is
 * explicit that the confirm step is not optional.
 *
 * Confidence is measured by rhythm: if the gap inside a pair is consistently
 * much shorter than the gap between pairs, the alternating reading is right.
 */
export function pairPhotos<T extends Pairable>(
  photos: T[]
): { pairs: { front: T; back: T | null }[]; confident: boolean } {
  if (photos.length === 0) return { pairs: [], confident: false };

  const ordered = [...photos].sort((a, b) => {
    const at = a.shotAt?.getTime() ?? 0;
    const bt = b.shotAt?.getTime() ?? 0;
    return at - bt || a.id - b.id;
  });

  const pairs: { front: T; back: T | null }[] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    const first = ordered[i];
    const second = ordered[i + 1] ?? null;

    // An explicitly assigned side wins over position.
    if (second && first.side === 'back' && second.side === 'front') {
      pairs.push({ front: second, back: first });
    } else {
      pairs.push({ front: first, back: second });
    }
  }

  return { pairs, confident: hasAlternatingRhythm(ordered) };
}

function hasAlternatingRhythm(ordered: Pairable[]): boolean {
  if (ordered.length < 4) return false;

  const within: number[] = [];
  const between: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1].shotAt?.getTime();
    const curr = ordered[i].shotAt?.getTime();
    if (prev === undefined || curr === undefined) return false;
    // Odd index closes a pair; even index opens the next one.
    (i % 2 === 1 ? within : between).push(curr - prev);
  }
  if (within.length === 0 || between.length === 0) return false;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  // A real alternating rhythm shows a clear step between the two populations.
  return mean(between) > mean(within) * 2;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ingest/pairing.test.ts`
Expected: all 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add core/ingest/pairing.ts tests/unit/ingest/pairing.test.ts
git commit -m "feat(ingest): front and back pairing with a confidence signal"
```

---

### Task 7: The job queue, with atomic claiming

**Files:**
- Create: `core/ingest/jobs.ts`
- Test: `tests/unit/ingest/jobs.test.ts`

**Interfaces:**
- Consumes: `ingestJobs` (Task 3)
- Produces:
  - `enqueueJob(userId, type, batchId): Promise<IngestJob>`
  - `claimNextJob(type, workerId): Promise<IngestJob | null>`
  - `completeJob(jobId): Promise<void>`
  - `failJob(jobId, message): Promise<void>`
  - `sweepStaleClaims(olderThanMinutes?): Promise<number>`
  - `countQueued(type): Promise<number>`

**Why the claim must be atomic:** the spec makes the Discord ping a doorbell, not a
transport, and says plainly that a duplicated ping must never cause duplicate work.
A read-then-write claim would allow two workers to take the same job. A single
conditional `UPDATE ... WHERE status = 'queued'` cannot.

- [ ] **Step 1: Write the failing test**

These assert on the compiled SQL rather than hitting the database, matching the
pattern already used for the `userId` filter tests in `core/products/service.ts`.

```typescript
// tests/unit/ingest/jobs.test.ts
import { describe, it, expect } from 'vitest';
import { claimNextJobQuery, sweepStaleClaimsQuery } from '@/core/ingest/jobs';

describe('claimNextJobQuery', () => {
  it('only ever claims a job that is still queued', () => {
    const { sql } = claimNextJobQuery('normalise', 'worker-1').toSQL();
    expect(sql).toContain('update');
    expect(sql).toMatch(/status/);
    // The guard that makes a double ping harmless.
    expect(sql).toMatch(/where/i);
  });

  it('records which worker took it', () => {
    const { params } = claimNextJobQuery('normalise', 'worker-1').toSQL();
    expect(params).toContain('worker-1');
  });

  it('filters by the job type asked for', () => {
    const { params } = claimNextJobQuery('scan', 'worker-1').toSQL();
    expect(params).toContain('scan');
  });
});

describe('sweepStaleClaimsQuery', () => {
  it('returns claimed jobs to the queue', () => {
    const { sql } = sweepStaleClaimsQuery(30).toSQL();
    expect(sql).toContain('update');
    expect(sql).toMatch(/where/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/jobs.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/ingest/jobs.ts`**

```typescript
import 'server-only';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { ingestJobs, type IngestJob } from '@/lib/db/schema/ingestJobs';

export async function enqueueJob(
  userId: string,
  type: (typeof ingestJobs.$inferInsert)['type'],
  batchId: number
): Promise<IngestJob> {
  const [row] = await db
    .insert(ingestJobs)
    .values({ userId, type, batchId, status: 'queued' })
    .returning();
  return row;
}

/**
 * The claim query, exported so its SQL can be asserted without a database.
 *
 * A single conditional UPDATE is what makes a duplicated Discord ping harmless:
 * two workers racing both run this, and only one can match `status = 'queued'`.
 * A read-then-write claim would let both take the same job.
 */
export function claimNextJobQuery(type: string, workerId: string) {
  return db
    .update(ingestJobs)
    .set({
      status: 'claimed',
      claimedBy: workerId,
      claimedAt: new Date(),
      attempts: sql`${ingestJobs.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ingestJobs.status, 'queued'),
        eq(ingestJobs.type, type),
        eq(
          ingestJobs.id,
          sql`(SELECT id FROM ${ingestJobs} WHERE status = 'queued' AND type = ${type} ORDER BY id LIMIT 1)`
        )
      )
    )
    .returning();
}

export async function claimNextJob(
  type: string,
  workerId: string
): Promise<IngestJob | null> {
  const rows = await claimNextJobQuery(type, workerId);
  return rows[0] ?? null;
}

export async function completeJob(jobId: number): Promise<void> {
  await db
    .update(ingestJobs)
    .set({ status: 'done', updatedAt: new Date() })
    .where(eq(ingestJobs.id, jobId));
}

export async function failJob(jobId: number, message: string): Promise<void> {
  await db
    .update(ingestJobs)
    .set({ status: 'failed', lastError: message.slice(0, 2000), updatedAt: new Date() })
    .where(eq(ingestJobs.id, jobId));
}

/**
 * Return claims that were never completed to the queue. This is the startup
 * sweep the spec requires: a job queued while no session was alive, or claimed
 * by a worker that died, must not be stranded.
 */
export function sweepStaleClaimsQuery(olderThanMinutes: number) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return db
    .update(ingestJobs)
    .set({ status: 'queued', claimedBy: null, claimedAt: null, updatedAt: new Date() })
    .where(and(eq(ingestJobs.status, 'claimed'), lt(ingestJobs.claimedAt, cutoff)))
    .returning({ id: ingestJobs.id });
}

export async function sweepStaleClaims(olderThanMinutes = 30): Promise<number> {
  const rows = await sweepStaleClaimsQuery(olderThanMinutes);
  return rows.length;
}

export async function countQueued(type: string): Promise<number> {
  const rows = await db
    .select({ id: ingestJobs.id })
    .from(ingestJobs)
    .where(and(eq(ingestJobs.status, 'queued'), eq(ingestJobs.type, type)));
  return rows.length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ingest/jobs.test.ts`
Expected: all 4 PASS.

- [ ] **Step 5: Prove the claim is actually atomic, against the real database**

Unit tests cannot show a race. Run two claims concurrently and confirm only one
wins. This writes to `ingest_jobs` and `ingest_batches`, both empty, inside a
transaction that rolls back.

```bash
npx tsx -e "
async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const postgres = (await import('postgres')).default;
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL, { prepare: false });
  const U = process.env.SEED_USER_ID;
  const [b] = await sql\`INSERT INTO ingest_batches (user_id, label) VALUES (\${U}, 'claim probe') RETURNING id\`;
  const [j] = await sql\`INSERT INTO ingest_jobs (user_id, type, batch_id) VALUES (\${U}, 'normalise', \${b.id}) RETURNING id\`;
  const claim = (who) => sql\`UPDATE ingest_jobs SET status='claimed', claimed_by=\${who}, claimed_at=now() WHERE id=\${j.id} AND status='queued' RETURNING claimed_by\`;
  const [a, c] = await Promise.all([claim('worker-A'), claim('worker-B')]);
  console.log('worker-A rows:', a.length, '| worker-B rows:', c.length, '| exactly one winner:', (a.length + c.length) === 1);
  await sql\`DELETE FROM ingest_jobs WHERE id=\${j.id}\`;
  await sql\`DELETE FROM ingest_batches WHERE id=\${b.id}\`;
  const [{ n }] = await sql\`SELECT COUNT(*)::int n FROM ingest_jobs\`;
  console.log('ingest_jobs rows after cleanup:', n);
  await sql.end();
}
main();
"
```

Expected: exactly one winner, and zero rows left behind. **If both claims succeed,
stop and report it**, because the whole duplicate-ping guarantee rests on this.

- [ ] **Step 6: Commit**

```bash
git add core/ingest/jobs.ts tests/unit/ingest/jobs.test.ts
git commit -m "feat(ingest): job queue with atomic claiming and a stale sweep"
```

---

### Task 8: The Discord enqueue ping

**Files:**
- Create: `core/ingest/notify.ts`
- Modify: `.env.local.example`
- Test: `tests/unit/ingest/notify.test.ts`

**Interfaces:**
- Produces:
  - `buildEnqueueMessage(input: { batchLabel: string; photoCount: number; jobType: string }): string`
  - `notifyEnqueued(input): Promise<boolean>`

**What this is and is not.** The spec is explicit: the ping is a **trigger, not a
transport**. The job lives in the database. The message exists only to wake the
agent sooner than its next sweep. So a failed send must never fail the upload, and
the message carries no payload beyond a human summary.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/notify.test.ts
import { describe, it, expect } from 'vitest';
import { buildEnqueueMessage } from '@/core/ingest/notify';

describe('buildEnqueueMessage', () => {
  it('summarises the batch for a phone screen', () => {
    expect(
      buildEnqueueMessage({ batchLabel: '2026-10-04', photoCount: 62, jobType: 'normalise' })
    ).toBe('Ingest: 62 photos queued for normalise, batch 2026-10-04.');
  });

  it('uses the singular for one photo', () => {
    expect(
      buildEnqueueMessage({ batchLabel: '2026-10-04', photoCount: 1, jobType: 'normalise' })
    ).toBe('Ingest: 1 photo queued for normalise, batch 2026-10-04.');
  });

  it('contains no em dash, per the project copy rule', () => {
    const msg = buildEnqueueMessage({ batchLabel: 'undated', photoCount: 3, jobType: 'scan' });
    expect(msg).not.toContain('\u2014');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/notify.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/ingest/notify.ts`**

```typescript
import 'server-only';

export function buildEnqueueMessage(input: {
  batchLabel: string;
  photoCount: number;
  jobType: string;
}): string {
  const noun = input.photoCount === 1 ? 'photo' : 'photos';
  return `Ingest: ${input.photoCount} ${noun} queued for ${input.jobType}, batch ${input.batchLabel}.`;
}

/**
 * Ring the doorbell. The job already exists in the database before this is
 * called, so a failure here only delays pickup until the agent's next sweep.
 * It must never fail the upload, which is why it swallows everything and
 * returns a boolean instead of throwing.
 */
export async function notifyEnqueued(input: {
  batchLabel: string;
  photoCount: number;
  jobType: string;
}): Promise<boolean> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: buildEnqueueMessage(input) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Document the variable**

Append to `.env.local.example`:

```
DISCORD_WEBHOOK_URL=
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ingest/notify.test.ts`
Expected: all 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add core/ingest/notify.ts tests/unit/ingest/notify.test.ts .env.local.example
git commit -m "feat(ingest): discord enqueue ping, a doorbell not a transport"
```

---

### Task 9: The upload endpoint

**Files:**
- Create: `app/api/upload/route.ts`, `core/ingest/intake.ts`
- Test: `tests/unit/ingest/intake.test.ts`

**Interfaces:**
- Consumes: `hashBytes` and `uploadOriginal` (Task 4), `readCaptureTime` (Task 5), `enqueueJob` (Task 7), `notifyEnqueued` (Task 8), `requireUserId` (Task 2)
- Produces:
  - `type IntakeFile = { filename: string; bytes: Buffer; originalPath?: string }`
  - `type IntakeBatch = { batchId: number; jobId: number; label: string; photoCount: number }`
  - `type IntakeResult = { accepted: number; duplicates: number; batches: IntakeBatch[] }`
  - `ingestFiles(userId: string, files: IntakeFile[]): Promise<IntakeResult>`
  - `extensionOf(filename: string): string`
  - `ACCEPTED_EXTENSIONS: readonly string[]`

**Both intake paths land here.** The watched folder and the in-app bulk upload both
post to this endpoint, so there is one code path and one set of rules.

**One upload can produce several batches.** A drop folder routinely holds more than
one sitting's photos, and the spec wants each session to become its own batch so
that past rips reconstruct themselves. So this calls `groupByShotAt` from Task 5 and
creates one batch, and one normalise job, per cluster. An upload of 160 photos
spanning two evenings yields two batches, not one.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/intake.test.ts
import { describe, it, expect } from 'vitest';
import { extensionOf, ACCEPTED_EXTENSIONS } from '@/core/ingest/intake';

describe('extensionOf', () => {
  it('reads a simple extension', () => {
    expect(extensionOf('IMG_0152.HEIC')).toBe('.heic');
  });

  it('reads the last extension of a multi-dotted name', () => {
    expect(extensionOf('photo.backup.jpg')).toBe('.jpg');
  });

  it('returns an empty string when there is no extension', () => {
    expect(extensionOf('README')).toBe('');
  });

  it('normalises jpeg to jpg', () => {
    expect(extensionOf('IMG_0152.JPEG')).toBe('.jpg');
  });
});

describe('ACCEPTED_EXTENSIONS', () => {
  it('accepts what his phone and camera actually produce', () => {
    expect(ACCEPTED_EXTENSIONS).toEqual(['.heic', '.heif', '.jpg', '.png', '.webp']);
  });

  it('does not accept video, which the card drop folder also contains', () => {
    expect(ACCEPTED_EXTENSIONS).not.toContain('.mov');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/intake.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/ingest/intake.ts`**

```typescript
import 'server-only';
import { db } from '@/lib/db/client';
import { photos } from '@/lib/db/schema/photos';
import { ingestBatches } from '@/lib/db/schema/ingestBatches';
import { hashBytes } from './hash';
import { uploadOriginal } from './storage';
import { readCaptureTime } from './exif';
import { groupByShotAt, labelForWindow } from './grouping';
import { enqueueJob } from './jobs';
import { notifyEnqueued } from './notify';

/** What his phone and camera actually produce. .MOV is deliberately absent:
 *  the card drop folder contains video too, and it is not a card photo. */
export const ACCEPTED_EXTENSIONS = ['.heic', '.heif', '.jpg', '.png', '.webp'] as const;

export type IntakeFile = { filename: string; bytes: Buffer; originalPath?: string };
export type IntakeBatch = {
  batchId: number;
  jobId: number;
  label: string;
  photoCount: number;
};
export type IntakeResult = {
  accepted: number;
  duplicates: number;
  batches: IntakeBatch[];
};

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return '';
  const ext = filename.slice(dot).toLowerCase();
  return ext === '.jpeg' ? '.jpg' : ext;
}

export async function ingestFiles(
  userId: string,
  files: IntakeFile[]
): Promise<IntakeResult> {
  const usable = files.filter((f) =>
    (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(f.filename))
  );
  if (usable.length === 0) throw new Error('No files with a supported image extension');

  const prepared = await Promise.all(
    usable.map(async (f) => ({
      ...f,
      hash: hashBytes(f.bytes),
      shotAt: await readCaptureTime(f.bytes),
    }))
  );

  // One upload can span several sittings. Each cluster becomes its own batch,
  // which is what makes a past rip reconstruct itself from its photos.
  const clusters = groupByShotAt(
    prepared.map((p, index) => ({ id: index, shotAt: p.shotAt }))
  );

  let accepted = 0;
  let duplicates = 0;
  const batches: IntakeBatch[] = [];

  for (const cluster of clusters) {
    const members = cluster.map((c) => prepared[c.id]);
    const times = members.map((m) => m.shotAt).filter((d): d is Date => d !== null);
    const from = times.length ? new Date(Math.min(...times.map((d) => d.getTime()))) : null;
    const to = times.length ? new Date(Math.max(...times.map((d) => d.getTime()))) : null;

    const [batch] = await db
      .insert(ingestBatches)
      .values({ userId, label: labelForWindow(from, to), shotFrom: from, shotTo: to })
      .returning();

    let batchAccepted = 0;
    for (const file of members) {
      const storagePath = await uploadOriginal(
        userId,
        file.hash,
        extensionOf(file.filename),
        file.bytes
      );
      const inserted = await db
        .insert(photos)
        .values({
          userId,
          batchId: batch.id,
          contentHash: file.hash,
          originalPath: file.originalPath ?? null,
          originalFilename: file.filename,
          storagePath,
          shotAt: file.shotAt,
          bytes: file.bytes.length,
        })
        // Re-dropping the same folder is normal and must be a no-op, not an error.
        .onConflictDoNothing()
        .returning({ id: photos.id });

      if (inserted.length > 0) {
        accepted++;
        batchAccepted++;
      } else {
        duplicates++;
      }
    }

    const job = await enqueueJob(userId, 'normalise', batch.id);
    await notifyEnqueued({
      batchLabel: batch.label ?? 'undated',
      photoCount: batchAccepted,
      jobType: 'normalise',
    });

    batches.push({
      batchId: batch.id,
      jobId: job.id,
      label: batch.label ?? 'undated',
      photoCount: batchAccepted,
    });
  }

  return { accepted, duplicates, batches };
}
```

- [ ] **Step 4: Implement `app/api/upload/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/current-user';
import { ingestFiles } from '@/core/ingest/intake';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const form = await request.formData();
  const entries = form.getAll('files').filter((f): f is File => f instanceof File);
  if (entries.length === 0) {
    return NextResponse.json({ error: 'No files supplied' }, { status: 400 });
  }

  const files = await Promise.all(
    entries.map(async (f) => ({
      filename: f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
    }))
  );

  try {
    const result = await ingestFiles(userId, files);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
```

- [ ] **Step 5: Run tests, typecheck and build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add core/ingest/intake.ts app/api/upload tests/unit/ingest/intake.test.ts
git commit -m "feat(ingest): upload endpoint shared by both intake paths"
```

---

### Task 10: The normalise worker

**Files:**
- Create: `scripts/worker.ts`, `core/ingest/normalise.ts`
- Modify: `package.json`
- Test: `tests/unit/ingest/normalise.test.ts`

**Interfaces:**
- Consumes: `claimNextJob`, `completeJob`, `failJob`, `sweepStaleClaims` (Task 7), `downloadObject` and `uploadDerivative` (Task 4)
- Produces:
  - `toDisplayJpeg(bytes: Buffer): Promise<{ jpeg: Buffer; width: number; height: number }>`
  - `normaliseBatch(batchId: number): Promise<{ converted: number; failed: number }>`

**Why this runs on Michael's machine.** The phone shoots HEIC. Browsers cannot
display it and Vercel cannot convert it without libheif. The worker runs locally
where `sharp` has what it needs, so the web app never has to.

**Two runtime facts this script must carry, both found the hard way:**

1. **`server-only` throws under plain `tsx`.** It only no-ops under the
   `react-server` export condition, which Next's bundler sets and a bare node
   process does not. `core/ingest/storage.ts` and `core/ingest/jobs.ts` both
   import it, so the worker needs
   `NODE_OPTIONS=--conditions=react-server`. The npm script below sets it via
   `cross-env` so it works on Windows too. Install it with
   `npm install -D cross-env` if it is not already present.
2. **`@supabase/supabase-js` needs a global `WebSocket`,** which Node 20 does
   not provide. Task 4 polyfills `ws` at the top of `storage.ts`, so this is
   already handled; do not remove that polyfill.

- [ ] **Step 1: Install sharp**

```bash
npm install sharp
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/ingest/normalise.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { toDisplayJpeg } from '@/core/ingest/normalise';

describe('toDisplayJpeg', () => {
  it('converts a PNG to a JPEG and reports its dimensions', async () => {
    const png = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();

    const { jpeg, width, height } = await toDisplayJpeg(png);
    expect(width).toBe(120);
    expect(height).toBe(80);
    // JPEG files begin with the SOI marker.
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
  });

  it('downsizes a very large image so the pairing grid stays fast', async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer();

    const { width } = await toDisplayJpeg(big);
    expect(width).toBeLessThanOrEqual(1600);
  });

  it('rejects bytes that are not an image, naming the failure', async () => {
    await expect(toDisplayJpeg(Buffer.from('not an image'))).rejects.toThrow(
      /could not be read as an image/i
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/normalise.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `core/ingest/normalise.ts`**

```typescript
import 'server-only';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { photos } from '@/lib/db/schema/photos';
import { downloadObject, uploadDerivative } from './storage';

/** Wide enough to judge a card in the pairing grid, small enough to load fast. */
const MAX_EDGE = 1600;

export async function toDisplayJpeg(
  bytes: Buffer
): Promise<{ jpeg: Buffer; width: number; height: number }> {
  try {
    const pipeline = sharp(bytes, { failOn: 'none' })
      .rotate() // honour the EXIF orientation flag
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch (cause) {
    throw new Error('These bytes could not be read as an image', { cause });
  }
}

export async function normaliseBatch(
  batchId: number
): Promise<{ converted: number; failed: number }> {
  const rows = await db.select().from(photos).where(eq(photos.batchId, batchId));
  let converted = 0;
  let failed = 0;

  for (const photo of rows) {
    if (photo.derivativePath || !photo.storagePath) continue;
    try {
      const original = await downloadObject(photo.storagePath);
      const { jpeg, width, height } = await toDisplayJpeg(original);
      const key = await uploadDerivative(photo.userId, photo.contentHash, jpeg);
      await db
        .update(photos)
        .set({ derivativePath: key, width, height })
        .where(eq(photos.id, photo.id));
      converted++;
    } catch {
      // One unreadable file must not abandon the rest of the batch.
      failed++;
    }
  }

  return { converted, failed };
}
```

- [ ] **Step 5: Implement `scripts/worker.ts`**

```typescript
import { config } from 'dotenv';
config({ path: '.env.local' });

import { hostname } from 'node:os';
import { claimNextJob, completeJob, failJob, sweepStaleClaims } from '@/core/ingest/jobs';
import { normaliseBatch } from '@/core/ingest/normalise';

const WORKER_ID = `${hostname()}-${process.pid}`;

async function main() {
  // The startup sweep the spec requires: a job claimed by a worker that died
  // must not be stranded for ever.
  const swept = await sweepStaleClaims(30);
  if (swept > 0) console.log(`returned ${swept} stale claim(s) to the queue`);

  let drained = 0;
  for (;;) {
    const job = await claimNextJob('normalise', WORKER_ID);
    if (!job) break;

    console.log(`claimed job ${job.id}, batch ${job.batchId}`);
    try {
      const { converted, failed } = await normaliseBatch(job.batchId);
      await completeJob(job.id);
      console.log(`  converted ${converted}, failed ${failed}`);
      drained++;
    } catch (err) {
      await failJob(job.id, (err as Error).message);
      console.log(`  FAILED: ${(err as Error).message}`);
    }
  }

  console.log(drained === 0 ? 'nothing queued' : `drained ${drained} job(s)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Add the script**

```json
"worker": "cross-env NODE_OPTIONS=--conditions=react-server tsx scripts/worker.ts"
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ingest/normalise.test.ts`
Expected: all 3 PASS.

- [ ] **Step 8: Commit**

```bash
git add core/ingest/normalise.ts scripts/worker.ts package.json package-lock.json tests/unit/ingest/normalise.test.ts
git commit -m "feat(ingest): normalise worker, heic to displayable jpeg"
```

---

### Task 11: The local drop-folder uploader

**Files:**
- Create: `scripts/watch-card-drop.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the `/api/upload` endpoint (Task 9)
- Produces: an `upload:drop` npm script

**Why this exists.** Vercel has no filesystem, so a watched folder needs something
running locally. This is the "drop folder" half of the spec's two intake paths; the
other half is the in-app bulk upload in Task 12. Both post to the same endpoint.

**Authentication:** the endpoint requires a session, which a script does not have.
This uploader therefore talks to a **local** dev server where it can send the
service-role header instead. Keep it simple: the script posts to
`http://localhost:3000/api/upload` and the route accepts a service-role bearer token
as an alternative to a session.

- [ ] **Step 1: Allow a service-role bearer on the upload route**

Modify `app/api/upload/route.ts`, replacing the auth block:

```typescript
async function resolveUserId(request: Request): Promise<string | null> {
  // A local script has no session, so it presents the service-role key and
  // names the user it is acting for. This path is only reachable by something
  // that already holds the service key, which is equivalent to database access.
  const auth = request.headers.get('authorization');
  const onBehalfOf = request.headers.get('x-ingest-user');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (auth && serviceKey && auth === `Bearer ${serviceKey}` && onBehalfOf) {
    // This value is CALLER SUPPLIED, unlike the session path, and it flows
    // into storageKeyFor, which builds an object key by concatenation. Require
    // a UUID so nothing but a real user id can ever reach a storage prefix.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(onBehalfOf)) {
      return null;
    }
    return onBehalfOf;
  }

  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
```

and use it:

```typescript
  const userId = await resolveUserId(request);
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
```

- [ ] **Step 1b: Add a test for the identifier guard**

```typescript
// tests/unit/ingest/resolve-user.test.ts
import { describe, it, expect } from 'vitest';
import { isValidUserId } from '@/app/api/upload/route';

describe('isValidUserId', () => {
  it('accepts a real uuid', () => {
    expect(isValidUserId('66200525-2237-4cc3-948f-aaafd3253d4b')).toBe(true);
  });

  it('rejects anything that could escape a storage prefix', () => {
    expect(isValidUserId('../../other-user')).toBe(false);
    expect(isValidUserId('/absolute')).toBe(false);
    expect(isValidUserId('')).toBe(false);
  });

  it('rejects a plausible but non-uuid identifier', () => {
    expect(isValidUserId('admin')).toBe(false);
  });
});
```

Export the guard from the route as `isValidUserId` so it can be tested, and use
it inside `resolveUserId`.

- [ ] **Step 2: Write `scripts/watch-card-drop.ts`**

```typescript
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DROP_DIR =
  process.env.CARD_DROP_DIR ??
  'C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/card drop';
const ENDPOINT = process.env.INGEST_ENDPOINT ?? 'http://localhost:3000/api/upload';
const BATCH_SIZE = 25;

const ACCEPTED = ['.heic', '.heif', '.jpg', '.jpeg', '.png', '.webp'];

async function main() {
  const userId = process.env.SEED_USER_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!userId || !serviceKey) {
    throw new Error('SEED_USER_ID and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const names = (await readdir(DROP_DIR)).filter((n) =>
    ACCEPTED.includes(n.slice(n.lastIndexOf('.')).toLowerCase())
  );
  if (names.length === 0) {
    console.log(`no images in ${DROP_DIR}`);
    process.exit(0);
  }
  console.log(`${names.length} image(s) in ${DROP_DIR}`);

  let accepted = 0;
  let duplicates = 0;

  // Chunked so a large drop does not build one enormous request body.
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const chunk = names.slice(i, i + BATCH_SIZE);
    const form = new FormData();
    for (const name of chunk) {
      const path = join(DROP_DIR, name);
      const bytes = await readFile(path);
      form.append('files', new Blob([bytes]), name);
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${serviceKey}`, 'x-ingest-user': userId },
      body: form,
    });
    const body = await res.json();
    if (!res.ok) {
      console.log(`  chunk ${i / BATCH_SIZE + 1}: FAILED, ${body.error}`);
      continue;
    }
    accepted += body.accepted;
    duplicates += body.duplicates;
    console.log(
      `  chunk ${i / BATCH_SIZE + 1}: ${body.accepted} accepted, ${body.duplicates} already known, ` +
        `${body.batches.length} batch(es): ${body.batches.map((b) => b.label).join(', ')}`
    );
  }

  console.log(`\n${accepted} new, ${duplicates} already known`);
  console.log('re-running this is safe: a photo is identified by its content hash');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Add the script and document the variables**

```json
"upload:drop": "cross-env NODE_OPTIONS=--conditions=react-server tsx scripts/watch-card-drop.ts"
```

Append to `.env.local.example`:

```
CARD_DROP_DIR=
INGEST_ENDPOINT=
```

- [ ] **Step 4: Verify re-running is genuinely a no-op**

With `npm run dev` running in another terminal:

```bash
npm run upload:drop
npm run upload:drop
```

Expected: the first run reports new photos; **the second reports zero new and the
same number already known.** That is the content-hash guarantee working. If the
second run reports new photos, stop and report it.

- [ ] **Step 5: Commit**

```bash
git add scripts/watch-card-drop.ts app/api/upload package.json .env.local.example
git commit -m "feat(ingest): local drop-folder uploader"
```

---

### Task 12: The ingest page, upload and pairing confirm

**Files:**
- Create: `app/ingest/page.tsx`, `app/ingest/upload-form.tsx`, `app/ingest/[batchId]/page.tsx`, `app/ingest/[batchId]/pairing-grid.tsx`, `app/api/batches/[batchId]/confirm/route.ts`
- Create: `core/ingest/batches.ts`
- Test: `tests/unit/ingest/batches.test.ts`

**Interfaces:**
- Consumes: `pairPhotos` (Task 6), `signedDerivativeUrl` (Task 4), `enqueueJob` and `notifyEnqueued` (Tasks 7 and 8)
- Produces:
  - `listBatches(userId): Promise<BatchSummary[]>`
  - `getBatchPhotos(userId, batchId): Promise<PhotoWithUrl[]>`
  - `confirmPairing(userId, batchId, assignments): Promise<{ jobId: number }>`
  - `summariseBatch(input): { ready: boolean; label: string }`

**Signed URLs expire.** `signedDerivativeUrl` defaults to one hour, and the owner
may leave a pairing grid open longer than that on a big rip. Pass a longer window
when building the grid, and if an image fails to load the page should offer a
refresh rather than showing a broken thumbnail.

**The confirm step is not optional.** The spec says so plainly, and Task 6 explains
why: a run of fronts followed by a run of backs is indistinguishable from
alternating shots by timestamp alone. The grid shows the proposed pairs and offers
a swap, exactly like the Wax Cache "check your photos" step Michael asked for.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingest/batches.test.ts
import { describe, it, expect } from 'vitest';
import { summariseBatch } from '@/core/ingest/batches';

describe('summariseBatch', () => {
  it('is not ready while any photo lacks a derivative', () => {
    expect(
      summariseBatch({ label: '2026-10-04', photoCount: 10, derivativeCount: 7, confirmedAt: null })
    ).toEqual({ ready: false, label: '2026-10-04, converting 7 of 10' });
  });

  it('is ready once every photo has a derivative', () => {
    expect(
      summariseBatch({ label: '2026-10-04', photoCount: 10, derivativeCount: 10, confirmedAt: null })
    ).toEqual({ ready: true, label: '2026-10-04, 10 photos ready to pair' });
  });

  it('reports a confirmed batch as done', () => {
    expect(
      summariseBatch({
        label: '2026-10-04',
        photoCount: 10,
        derivativeCount: 10,
        confirmedAt: new Date('2026-10-05T00:00:00Z'),
      })
    ).toEqual({ ready: true, label: '2026-10-04, 10 photos confirmed' });
  });

  it('handles an empty batch without dividing by zero', () => {
    expect(
      summariseBatch({ label: 'undated', photoCount: 0, derivativeCount: 0, confirmedAt: null })
    ).toEqual({ ready: false, label: 'undated, no photos' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ingest/batches.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/ingest/batches.ts`**

```typescript
import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { photos } from '@/lib/db/schema/photos';
import { ingestBatches } from '@/lib/db/schema/ingestBatches';
import { signedDerivativeUrl } from './storage';
import { enqueueJob } from './jobs';
import { notifyEnqueued } from './notify';

export type BatchSummaryInput = {
  label: string;
  photoCount: number;
  derivativeCount: number;
  confirmedAt: Date | null;
};

export function summariseBatch(input: BatchSummaryInput): {
  ready: boolean;
  label: string;
} {
  if (input.photoCount === 0) return { ready: false, label: `${input.label}, no photos` };
  if (input.derivativeCount < input.photoCount) {
    return {
      ready: false,
      label: `${input.label}, converting ${input.derivativeCount} of ${input.photoCount}`,
    };
  }
  const suffix = input.confirmedAt ? 'confirmed' : 'ready to pair';
  return { ready: true, label: `${input.label}, ${input.photoCount} photos ${suffix}` };
}

export async function listBatches(userId: string) {
  return db
    .select({
      id: ingestBatches.id,
      label: ingestBatches.label,
      confirmedAt: ingestBatches.confirmedAt,
      photoCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${photos}
        WHERE ${photos.batchId} = ${ingestBatches.id}
      )`,
      derivativeCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${photos}
        WHERE ${photos.batchId} = ${ingestBatches.id}
          AND ${photos.derivativePath} IS NOT NULL
      )`,
    })
    .from(ingestBatches)
    .where(eq(ingestBatches.userId, userId))
    .orderBy(sql`${ingestBatches.id} DESC`);
}

export async function getBatchPhotos(userId: string, batchId: number) {
  const rows = await db
    .select()
    .from(photos)
    .where(and(eq(photos.userId, userId), eq(photos.batchId, batchId)))
    .orderBy(photos.shotAt, photos.id);

  return Promise.all(
    rows.map(async (p) => ({
      ...p,
      url: p.derivativePath ? await signedDerivativeUrl(p.derivativePath) : null,
    }))
  );
}

export async function confirmPairing(
  userId: string,
  batchId: number,
  assignments: { photoId: number; side: 'front' | 'back' }[]
): Promise<{ jobId: number }> {
  for (const a of assignments) {
    await db
      .update(photos)
      .set({ side: a.side })
      .where(and(eq(photos.id, a.photoId), eq(photos.userId, userId)));
  }

  const [batch] = await db
    .update(ingestBatches)
    .set({ confirmedAt: new Date() })
    .where(and(eq(ingestBatches.id, batchId), eq(ingestBatches.userId, userId)))
    .returning();

  const job = await enqueueJob(userId, 'scan', batchId);
  await notifyEnqueued({
    batchLabel: batch?.label ?? 'undated',
    photoCount: assignments.length,
    jobType: 'scan',
  });

  return { jobId: job.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/ingest/batches.test.ts`
Expected: all 4 PASS.

- [ ] **Step 5: Write the ingest list page and upload form**

```tsx
// app/ingest/page.tsx
import Link from 'next/link';
import { requireUserId } from '@/lib/current-user';
import { listBatches, summariseBatch } from '@/core/ingest/batches';
import { UploadForm } from './upload-form';

export const dynamic = 'force-dynamic';

export default async function IngestPage() {
  const userId = await requireUserId();
  const batches = await listBatches(userId);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Ingest</h1>
      <UploadForm />

      <h2 className="mt-10 mb-2 text-lg font-medium">Batches</h2>
      {batches.length === 0 && (
        <p className="text-neutral-500">
          No batches yet. Upload photos above, or drop them in the card drop folder.
        </p>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {batches.map((b) => {
          const s = summariseBatch({
            label: b.label ?? 'undated',
            photoCount: b.photoCount,
            derivativeCount: b.derivativeCount,
            confirmedAt: b.confirmedAt,
          });
          return (
            <li key={b.id} className="py-3">
              <Link href={`/ingest/${b.id}`} className="hover:underline">
                <span className={s.ready ? '' : 'text-amber-600'}>{s.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
```

```tsx
// app/ingest/upload-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function UploadForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const body = await res.json();
      setMessage(
        res.ok
          ? `${body.accepted} new, ${body.duplicates} already known.`
          : `Upload failed: ${body.error}`
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <input
        type="file"
        name="files"
        multiple
        accept=".heic,.heif,.jpg,.jpeg,.png,.webp"
        className="text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="justify-self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? 'Uploading' : 'Upload photos'}
      </button>
      {message && <p className="text-sm text-neutral-500">{message}</p>}
    </form>
  );
}
```

- [ ] **Step 6: Write the pairing page and grid**

```tsx
// app/ingest/[batchId]/page.tsx
import { notFound } from 'next/navigation';
import { requireUserId } from '@/lib/current-user';
import { getBatchPhotos } from '@/core/ingest/batches';
import { pairPhotos } from '@/core/ingest/pairing';
import { PairingGrid } from './pairing-grid';

export const dynamic = 'force-dynamic';

export default async function BatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const id = Number(batchId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const userId = await requireUserId();
  const photos = await getBatchPhotos(userId, id);
  if (photos.length === 0) notFound();

  const { pairs, confident } = pairPhotos(photos);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-2xl font-semibold">Check your photos</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {confident
          ? 'These look like alternating front and back shots. Swap any pair that is wrong.'
          : 'The order was not obvious, so check these carefully before confirming.'}
      </p>
      <PairingGrid
        batchId={id}
        initialPairs={pairs.map((p) => ({
          front: { id: p.front.id, url: p.front.url },
          back: p.back ? { id: p.back.id, url: p.back.url } : null,
        }))}
      />
    </main>
  );
}
```

```tsx
// app/ingest/[batchId]/pairing-grid.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Side = { id: number; url: string | null };
type Pair = { front: Side; back: Side | null };

export function PairingGrid({
  batchId,
  initialPairs,
}: {
  batchId: number;
  initialPairs: Pair[];
}) {
  const [pairs, setPairs] = useState(initialPairs);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const swap = (index: number) =>
    setPairs((current) =>
      current.map((p, i) =>
        i === index && p.back ? { front: p.back, back: p.front } : p
      )
    );

  async function confirm() {
    setBusy(true);
    const assignments = pairs.flatMap((p) =>
      p.back
        ? [
            { photoId: p.front.id, side: 'front' as const },
            { photoId: p.back.id, side: 'back' as const },
          ]
        : [{ photoId: p.front.id, side: 'front' as const }]
    );
    await fetch(`/api/batches/${batchId}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignments }),
    });
    setBusy(false);
    router.push('/ingest');
  }

  return (
    <div className="grid gap-6">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {pairs.map((p, i) => (
          <li key={p.front.id} className="grid gap-2 rounded-lg border p-2">
            <div className="grid grid-cols-2 gap-1">
              {[p.front, p.back].map((side, j) => (
                <div key={j} className="aspect-[5/7] bg-neutral-100 dark:bg-neutral-900">
                  {side?.url ? (
                    <img
                      src={side.url}
                      alt={j === 0 ? 'Front' : 'Back'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xs text-neutral-400">
                      {j === 0 ? 'front' : 'no back'}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => swap(i)}
              disabled={!p.back}
              className="rounded border px-2 py-1 text-xs disabled:opacity-40"
            >
              Swap front and back
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={confirm}
        disabled={busy}
        className="justify-self-start rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {busy ? 'Confirming' : 'Confirm and queue for scanning'}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Write the confirm route**

```typescript
// app/api/batches/[batchId]/confirm/route.ts
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/current-user';
import { confirmPairing } from '@/core/ingest/batches';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { batchId } = await params;
  const id = Number(batchId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Bad batch id' }, { status: 400 });
  }

  const body = await request.json();
  const assignments = body?.assignments;
  if (!Array.isArray(assignments)) {
    return NextResponse.json({ error: 'assignments must be an array' }, { status: 400 });
  }

  const result = await confirmPairing(userId, id, assignments);
  return NextResponse.json(result);
}
```

- [ ] **Step 8: Link it from the home page**

Add a link to `/ingest` alongside the existing products link in `app/page.tsx`.

- [ ] **Step 9: Run everything**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add app/ingest app/api/batches core/ingest/batches.ts app/page.tsx tests/unit/ingest/batches.test.ts
git commit -m "feat(ingest): upload page and the check your photos step"
```

---

### Task 13: End to end on one real set of photos

**Files:**
- Modify: none, this task proves the pipeline

**This is the task that decides whether the plan worked.** Everything before it is
components; this runs the whole path on Michael's real files.

- [ ] **Step 1: Pick a real set of photos**

Take 20 files from
`C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/card drop`,
preferring `.HEIC` because that is what his phone shoots, and copy them to a scratch
directory so the originals are never touched:

Use an explicit Windows path. **Do not use `/tmp`**: under Git Bash it resolves
inside the Git installation directory, which cost real time earlier in this project.

```bash
PROBE="C:/Users/Michael/Documents/Claude/Isosceles_Insights/.probe"
mkdir -p "$PROBE"
cd "C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/card drop"
ls *.HEIC | head -20 | while read f; do cp "$f" "$PROBE/"; done
ls "$PROBE" | wc -l
```

`.probe` is inside the repo, so add it to `.gitignore` before committing anything.

- [ ] **Step 2: Upload them**

With `npm run dev` running:

```bash
CARD_DROP_DIR="C:/Users/Michael/Documents/Claude/Isosceles_Insights/.probe" npm run upload:drop
```

Expected: 20 accepted, 0 already known, and at least one batch. If the 20 photos
were shot in one sitting it is one batch; if they span a long gap it is several,
which is correct.

- [ ] **Step 3: Prove re-running is a no-op**

```bash
CARD_DROP_DIR="C:/Users/Michael/Documents/Claude/Isosceles_Insights/.probe" npm run upload:drop
```

Expected: **0 accepted, 20 already known.** This is the content-hash guarantee. If
it reports new photos, stop and report it.

- [ ] **Step 4: Drain the queue**

```bash
npm run worker
```

Expected: it claims the normalise job, converts 20 HEIC files to JPEG derivatives,
and reports `converted 20, failed 0`. **If HEIC conversion fails**, report the exact
sharp error rather than working around it; it means libheif is unavailable and that
is a real finding about Michael's machine.

- [ ] **Step 5: Confirm the queue is empty and the claim was released**

```bash
npx tsx -e "
async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const postgres = (await import('postgres')).default;
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL, { prepare: false });
  const jobs = await sql\`SELECT id, type, status, attempts FROM ingest_jobs ORDER BY id\`;
  console.log('jobs:', jobs);
  const [p] = await sql\`SELECT COUNT(*)::int total, COUNT(derivative_path)::int converted FROM photos\`;
  console.log('photos:', p);
  await sql.end();
}
main();
"
```

Expected: the normalise job is `done`, and `converted` equals `total`.

- [ ] **Step 6: Walk the UI**

Open `http://localhost:3000/ingest`, confirm the batch appears as ready to pair, open
it, and confirm **the photos actually render**. That is the proof the HEIC conversion
and the signed URLs both work. Swap one pair, then confirm.

- [ ] **Step 7: Confirm a scan job was queued**

Re-run the query from step 5. Expected: a second job of type `scan` with status
`queued`, and the batch's `confirmed_at` set. **That scan job is where plan 3 picks
up.** It stays queued; nothing drains it yet.

- [ ] **Step 8: Record the real numbers**

Write the actual counts into the task report: photos accepted, duplicates on
re-run, derivatives converted, any conversion failures, and whether the images
rendered in the pairing grid.

- [ ] **Step 9: Clean up the probe data**

The probe wrote real rows. Remove them so plan 3 starts clean, touching only the
three ingest tables:

```bash
npx tsx -e "
async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const postgres = (await import('postgres')).default;
  const sql = postgres(process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL, { prepare: false });
  await sql\`DELETE FROM ingest_jobs\`;
  await sql\`DELETE FROM photos\`;
  await sql\`DELETE FROM ingest_batches\`;
  const [c] = await sql\`SELECT (SELECT COUNT(*)::int FROM baseball_cards) ledger, (SELECT COUNT(*)::int FROM checklist_entries) entries\`;
  console.log('cleaned. ledger still', c.ledger, 'and checklist_entries still', c.entries);
  await sql.end();
}
main();
"
```

Expected: `ledger` is 832 and `entries` is 7540, both untouched.

**Ask the plan owner before running this if you believe the probe data is worth
keeping.**

- [ ] **Step 10: Commit the report**

```bash
git commit --allow-empty -m "test(ingest): end to end verified on 20 real HEIC photos"
```

---

## Done when

- Michael can sign in with Google, and every page is behind that login.
- Dropping photos in the card drop folder, or picking them in the browser, creates a batch and queues a normalise job.
- Re-running an upload reports zero new photos.
- `npm run worker` converts HEIC to JPEG derivatives and completes the job.
- The pairing grid displays the real photos and the swap control works.
- Confirming queues a `scan` job, which plan 3 will drain.
- `npm test`, `npm run typecheck` and `npm run build` are all clean.

## Deliberately not in this plan

- **The model-driven scan.** Plan 3. The `scan` job this plan queues is where it starts.
- **Checklist verification routing and the review queue.** Plan 3.
- **Committing cards to the `cards` table.** Plan 3.
- **The backfill of the ~2800 existing originals.** Plan 4. This plan's uploader is the tool it will use.
- **Rip linkage.** `ingest_batches.rip_id` exists and stays null until the sealed side is ported.
- **Anything about how the Cards section looks.** Plan 5, and it gets its own design pass.
