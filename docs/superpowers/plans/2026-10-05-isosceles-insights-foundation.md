# Isosceles Insights: Foundation and Checklist Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new Isosceles Insights repo with the full card schema live, and a working checklist registry that parses real Topps checklists and odds sheets into queryable rows.

**Architecture:** A new Next.js app whose business logic lives entirely in `core/` as plain functions, so both the web UI and the Discord agent call the same code. This plan builds the parsing layer bottom-up as pure functions (team splitting, row extraction, section naming, odds parsing) before wiring them to source adapters, the database, and a minimal UI. Nothing in this plan calls a model.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Drizzle ORM, Supabase Postgres, Vitest, `unpdf` for PDF text extraction, `exceljs` for spreadsheets.

**Spec:** `docs/superpowers/specs/2026-10-05-card-app-design.md` (in the pokestonks repo; copy it into the new repo in Task 1)

**Plan 1 of 7.** The spec's build order is split into seven plans. This is steps 1 and 2 of that order. Plan 2 (ingest) is written after this one ships.

## Global Constraints

- **No em dashes** in any user-facing copy. Standing rule across Isosceles.
- **Money is integer cents everywhere.** Never floats. Format only at render time.
- **Dates are ISO `YYYY-MM-DD` strings or `date` columns.** Never a datetime where time is not meaningful.
- **Read Postgres `DATE` columns as `::text`**, never through a JS `Date`. Reading them as `Date` renders a day early in Pacific.
- **No API key, ever.** Nothing in this repo may call an LLM API. Model work is a job row drained by the agent session. This plan adds no model calls at all.
- **Drizzle is for service-role access only.** User-facing queries go through the Supabase client with RLS.
- **`npm run build` must pass before anything is called deploy-ready.** `tsc --noEmit` and Vitest passing is not sufficient; the Next build catches prerender errors that compile fine.
- **Every review includes `tsc --noEmit` output.**
- Target repo: `C:\Users\Michael\Documents\Claude\Isosceles_Insights`, git repo name `isosceles-insights`.

---

## File Structure

```
Isosceles_Insights/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── products/
│       ├── page.tsx                      # product list
│       └── [id]/page.tsx                 # checklist viewer
├── core/
│   ├── checklist/
│   │   ├── teams.ts                      # MLB team dictionary + splitter
│   │   ├── rows.ts                       # card-code row patterns
│   │   ├── sections.ts                   # section header -> insert set name
│   │   ├── odds.ts                       # parallel + print run + odds parsing
│   │   ├── extract.ts                    # pdf/txt/xlsx -> plain text
│   │   ├── parse.ts                      # orchestrates the above
│   │   └── types.ts                      # shared parse types
│   ├── products/
│   │   ├── service.ts                    # create product, load checklist
│   │   └── verify.ts                     # card-number verification (the hard gate)
│   └── fetch/
│       └── checklist-sources.ts          # auto-fetch adapters
├── lib/db/
│   ├── client.ts
│   └── schema/
│       ├── products.ts
│       ├── checklistEntries.ts
│       ├── parallels.ts
│       ├── cards.ts
│       ├── cardPhotos.ts
│       ├── cardListings.ts
│       ├── cardSales.ts
│       └── index.ts
├── scripts/
│   └── seed-checklists.ts
├── tests/
│   ├── fixtures/checklists/              # real files copied from eBay_assets
│   ├── setup.ts
│   └── unit/
└── docs/superpowers/specs/2026-10-05-card-app-design.md
```

Responsibility split: each `core/checklist/*.ts` file owns one parsing concern and is pure and independently testable. `extract.ts` is the only file that touches binary formats. `service.ts` is the only file that writes to the database.

---

### Task 1: Scaffold the repo and test harness

**Files:**
- Create: `C:\Users\Michael\Documents\Claude\Isosceles_Insights\` (whole project)
- Create: `package.json`, `tsconfig.json`, `vitest.config.mts`, `tests/setup.ts`, `.env.local.example`, `.gitignore`
- Test: `tests/unit/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a repo where `npm run typecheck`, `npm test` and `npm run build` all pass. Path alias `@/` resolves to the project root.

- [ ] **Step 1: Create the project**

```bash
cd /c/Users/Michael/Documents/Claude
npx create-next-app@latest Isosceles_Insights \
  --typescript --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-npm
cd Isosceles_Insights
git init 2>/dev/null; true
```

- [ ] **Step 2: Install dependencies**

```bash
npm install drizzle-orm postgres @supabase/supabase-js @supabase/ssr \
  @tanstack/react-query zod unpdf exceljs
npm install -D drizzle-kit vitest @vitejs/plugin-react dotenv tsx \
  @types/node happy-dom
```

- [ ] **Step 3: Write `vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['node_modules', '.next'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      'server-only': resolve(__dirname, 'tests/mocks/server-only.ts'),
    },
  },
});
```

- [ ] **Step 4: Write `tests/setup.ts` and `tests/mocks/server-only.ts`**

```typescript
// tests/setup.ts
import { config } from 'dotenv';
config({ path: '.env.local' });
```

```typescript
// tests/mocks/server-only.ts
export {};
```

- [ ] **Step 5: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "seed:checklists": "tsx scripts/seed-checklists.ts"
  }
}
```

- [ ] **Step 6: Write the failing smoke test**

```typescript
// tests/unit/smoke.test.ts
import { describe, it, expect } from 'vitest';

describe('harness', () => {
  it('runs typescript and resolves the @ alias', async () => {
    const mod = await import('@/core/version');
    expect(mod.APP_NAME).toBe('Isosceles Insights');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, cannot resolve `@/core/version`.

- [ ] **Step 8: Create `core/version.ts`**

```typescript
export const APP_NAME = 'Isosceles Insights';
```

- [ ] **Step 9: Verify green**

Run: `npm test && npm run typecheck && npm run build`
Expected: all three pass.

- [ ] **Step 10: Copy the spec in and commit**

```bash
mkdir -p docs/superpowers/specs
cp "/c/Users/Michael/Documents/Claude/Pokemon_Portfolio/docs/superpowers/specs/2026-10-05-card-app-design.md" docs/superpowers/specs/
git add -A
git commit -m "chore: scaffold Isosceles Insights"
```

---

### Task 2: MLB team dictionary and player/team splitter

**Why this is first:** the PDF extraction glues player and team together with no separator, for example `Slater de BrunTampa Bay Rays`. Team is a required column in the spec, and MLB team names are a closed set, so a dictionary split is reliable. Everything else in the parser depends on this.

**Files:**
- Create: `core/checklist/teams.ts`
- Test: `tests/unit/checklist/teams.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MLB_TEAMS: readonly string[]`
  - `splitPlayerAndTeam(raw: string): { player: string; team: string | null; isRookie: boolean }`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/checklist/teams.test.ts
import { describe, it, expect } from 'vitest';
import { splitPlayerAndTeam } from '@/core/checklist/teams';

describe('splitPlayerAndTeam', () => {
  it('splits a glued player and team from PDF text', () => {
    expect(splitPlayerAndTeam('Slater de BrunTampa Bay Rays')).toEqual({
      player: 'Slater de Brun', team: 'Tampa Bay Rays', isRookie: false,
    });
  });

  it('splits a comma-separated player and team from TXT', () => {
    expect(splitPlayerAndTeam('Aaron Judge, New York Yankees')).toEqual({
      player: 'Aaron Judge', team: 'New York Yankees', isRookie: false,
    });
  });

  it('detects the RC suffix used in TXT checklists', () => {
    expect(splitPlayerAndTeam('Chase Burns, Cincinnati Reds RC')).toEqual({
      player: 'Chase Burns', team: 'Cincinnati Reds', isRookie: true,
    });
  });

  it('detects the Rookie suffix used in PDF checklists', () => {
    expect(splitPlayerAndTeam('Alex FreelandLos Angeles Dodgers Rookie')).toEqual({
      player: 'Alex Freeland', team: 'Los Angeles Dodgers', isRookie: true,
    });
  });

  it('strips the trademark glyph that pypdf mis-decodes', () => {
    expect(splitPlayerAndTeam('Juan SotoNew York Mets\uFFFD')).toEqual({
      player: 'Juan Soto', team: 'New York Mets', isRookie: false,
    });
  });

  it('prefers the longest matching team so White Sox does not match Sox', () => {
    expect(splitPlayerAndTeam('Billy CarlsonChicago White Sox')).toEqual({
      player: 'Billy Carlson', team: 'Chicago White Sox', isRookie: false,
    });
  });

  it('handles the single-word Athletics', () => {
    expect(splitPlayerAndTeam('Nick Kurtz, Athletics')).toEqual({
      player: 'Nick Kurtz', team: 'Athletics', isRookie: false,
    });
  });

  it('keeps accented names intact', () => {
    expect(splitPlayerAndTeam('Julio Rodríguez, Seattle Mariners')).toEqual({
      player: 'Julio Rodríguez', team: 'Seattle Mariners', isRookie: false,
    });
  });

  it('returns a null team for a national side it does not know', () => {
    expect(splitPlayerAndTeam('Roman AnthonyUnited States')).toEqual({
      player: 'Roman AnthonyUnited States', team: null, isRookie: false,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/checklist/teams.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/checklist/teams.ts`**

```typescript
export const MLB_TEAMS = [
  'Arizona Diamondbacks', 'Atlanta Braves', 'Baltimore Orioles', 'Boston Red Sox',
  'Chicago Cubs', 'Chicago White Sox', 'Cincinnati Reds', 'Cleveland Guardians',
  'Colorado Rockies', 'Detroit Tigers', 'Houston Astros', 'Kansas City Royals',
  'Los Angeles Angels', 'Los Angeles Dodgers', 'Miami Marlins', 'Milwaukee Brewers',
  'Minnesota Twins', 'New York Mets', 'New York Yankees', 'Athletics',
  'Philadelphia Phillies', 'Pittsburgh Pirates', 'San Diego Padres',
  'San Francisco Giants', 'Seattle Mariners', 'St. Louis Cardinals',
  'Tampa Bay Rays', 'Texas Rangers', 'Toronto Blue Jays', 'Washington Nationals',
] as const;

// Longest first, so "Chicago White Sox" is tried before "Boston Red Sox" can
// partial-match, and "Athletics" never shadows a longer name containing it.
const TEAMS_BY_LENGTH = [...MLB_TEAMS].sort((a, b) => b.length - a.length);

const ROOKIE_SUFFIX = /\s*(?:\bRC\b|\bRookie\b)\s*$/i;

/** pypdf mis-decodes the registered-trademark glyph after team names. */
function clean(input: string): string {
  return input.replace(/\uFFFD/g, '').replace(/\s+/g, ' ').trim();
}

export function splitPlayerAndTeam(raw: string): {
  player: string;
  team: string | null;
  isRookie: boolean;
} {
  let working = clean(raw);

  const isRookie = ROOKIE_SUFFIX.test(working);
  if (isRookie) working = working.replace(ROOKIE_SUFFIX, '').trim();

  // TXT checklists separate with a comma. Trust it when the tail is a known team.
  const commaIndex = working.lastIndexOf(', ');
  if (commaIndex !== -1) {
    const head = working.slice(0, commaIndex).trim();
    const tail = working.slice(commaIndex + 2).trim();
    if ((MLB_TEAMS as readonly string[]).includes(tail)) {
      return { player: head, team: tail, isRookie };
    }
  }

  // PDF text glues them together. Match the longest known team at the end.
  for (const team of TEAMS_BY_LENGTH) {
    if (working.endsWith(team)) {
      const player = working.slice(0, working.length - team.length).trim();
      if (player.length > 0) return { player, team, isRookie };
    }
  }

  return { player: working, team: null, isRookie };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checklist/teams.test.ts`
Expected: all 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add core/checklist/teams.ts tests/unit/checklist/teams.test.ts
git commit -m "feat(checklist): split player and team using a closed MLB team set"
```

---

### Task 3: Card-code row parser

**Why the patterns look like this:** this is a port of `scripts/parse-checklist.py` in the pokestonks repo, and its regexes encode expensive debugging. PDF text glues the code to the name (`BTP-11Juan Soto`). A greedy suffix eats the capital that starts the name and yields `BTP-11J`; an optional trailing `[A-Z]` does the same to `RVA-13Manny`. Both silently turn every double-digit card into an unknown code. So the numeric suffix is digits only, and the alpha suffix is non-greedy up to the first Capital-then-lowercase.

**The known bug this task fixes:** the Python version has no pattern for plain numeric base cards, so they never parse. That is added here.

**Files:**
- Create: `core/checklist/rows.ts`, `core/checklist/types.ts`
- Test: `tests/unit/checklist/rows.test.ts`

**Interfaces:**
- Consumes: `splitPlayerAndTeam` from Task 2
- Produces:
  - `type ParsedRow = { code: string; player: string; team: string | null; isRookie: boolean }`
  - `parseRow(line: string): ParsedRow | null`

- [ ] **Step 1: Write `core/checklist/types.ts`**

```typescript
export type ParsedRow = {
  code: string;
  player: string;
  team: string | null;
  isRookie: boolean;
};

export type ParsedSection = {
  /** Raw section header text as printed in the source. */
  heading: string;
  rows: ParsedRow[];
};

export type ParsedParallel = {
  name: string;
  /** Print run, e.g. 25 for "/25". Null for unnumbered parallels. */
  printRun: number | null;
  /** Raw odds text, e.g. "Hobby - 1:965". Null when the source omits it. */
  oddsText: string | null;
};
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/checklist/rows.test.ts
import { describe, it, expect } from 'vitest';
import { parseRow } from '@/core/checklist/rows';

describe('parseRow', () => {
  it('parses a numeric-suffix insert code glued to the name', () => {
    expect(parseRow('BTP-11Juan SotoNew York Mets')).toEqual({
      code: 'BTP-11', player: 'Juan Soto', team: 'New York Mets', isRookie: false,
    });
  });

  it('does not let the name capital leak into a double-digit code', () => {
    // The bug the Python docstring warns about: RVA-13M instead of RVA-13.
    expect(parseRow('RVA-13Manny MachadoSan Diego Padres')?.code).toBe('RVA-13');
  });

  it('parses a three-digit prospect code', () => {
    expect(parseRow('BCP-231Bryce WalcottSeattle Mariners')?.code).toBe('BCP-231');
  });

  it('parses an alpha-suffix autograph code', () => {
    expect(parseRow('RA-JWIJackson WilliamsDetroit Tigers')).toEqual({
      code: 'RA-JWI', player: 'Jackson Williams', team: 'Detroit Tigers', isRookie: false,
    });
  });

  it('parses a plain numeric base card, which the Python parser never could', () => {
    expect(parseRow('1 Aaron Judge, New York Yankees')).toEqual({
      code: '1', player: 'Aaron Judge', team: 'New York Yankees', isRookie: false,
    });
  });

  it('carries the rookie flag off a numeric base row', () => {
    expect(parseRow('3 Chase Burns, Cincinnati Reds RC')).toEqual({
      code: '3', player: 'Chase Burns', team: 'Cincinnati Reds', isRookie: true,
    });
  });

  it('parses a three-digit numeric base card', () => {
    expect(parseRow('100 Nick KurtzAthletics')?.code).toBe('100');
  });

  it('returns null for a section header', () => {
    expect(parseRow('BOWMAN CHROME PROSPECTS')).toBeNull();
  });

  it('returns null for a parallel line', () => {
    expect(parseRow('Orange Border /25 (Hobby - 1:965)')).toBeNull();
  });

  it('returns null for an empty line', () => {
    expect(parseRow('   ')).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/checklist/rows.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `core/checklist/rows.ts`**

```typescript
import { splitPlayerAndTeam } from './teams';
import type { ParsedRow } from './types';

// Numeric suffix must be digits only. A greedy or optional-[A-Z] suffix eats the
// capital that starts the player name and silently corrupts every double-digit
// code (BTP-11J, RVA-13M).
const INSERT_NUMERIC = /^([A-Z]{1,6}-\d{1,3})\s*(.+)$/;

// Alpha suffix is non-greedy and must be followed by Capital-then-lowercase,
// which is where the player name starts.
const INSERT_ALPHA = /^([A-Z]{1,6}-[A-Z]{1,5}?)\s*([A-Z][a-z].+)$/;

// Plain numeric base cards. Absent from the Python parser, which is why base
// sets never loaded. Requires whitespace so "100 Nick" does not swallow digits.
const BASE_NUMERIC = /^(\d{1,3})\s+([A-Z].*)$/;

export function parseRow(line: string): ParsedRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match =
    INSERT_NUMERIC.exec(trimmed) ??
    INSERT_ALPHA.exec(trimmed) ??
    BASE_NUMERIC.exec(trimmed);
  if (!match) return null;

  const [, code, remainder] = match;
  const { player, team, isRookie } = splitPlayerAndTeam(remainder);
  if (!player) return null;

  return { code, player, team, isRookie };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checklist/rows.test.ts`
Expected: all 10 PASS.

- [ ] **Step 6: Commit**

```bash
git add core/checklist/rows.ts core/checklist/types.ts tests/unit/checklist/rows.test.ts
git commit -m "feat(checklist): port row parser and add the missing numeric base pattern"
```

---

### Task 4: Section headers and insert set naming

**Why:** the section header is what names the insert, and per the spec the card code prefix is authoritative over whatever a row claims. `PTP-` and `BTP-` must be tested before a bare `P-` prefix, or `P-` swallows them.

**Files:**
- Create: `core/checklist/sections.ts`
- Test: `tests/unit/checklist/sections.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `isSectionHeader(line: string): boolean`
  - `insertNameForCode(code: string): string | null`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/checklist/sections.test.ts
import { describe, it, expect } from 'vitest';
import { isSectionHeader, insertNameForCode } from '@/core/checklist/sections';

describe('isSectionHeader', () => {
  it('accepts an all-caps heading', () => {
    expect(isSectionHeader('BOWMAN CHROME PROSPECTS')).toBe(true);
  });

  it('accepts a heading with an ampersand and apostrophe', () => {
    expect(isSectionHeader("STARS & SCRUBS O'NEILL")).toBe(true);
  });

  it('rejects a card row', () => {
    expect(isSectionHeader('BCP-231Bryce WalcottSeattle Mariners')).toBe(false);
  });

  it('rejects a short line', () => {
    expect(isSectionHeader('AB')).toBe(false);
  });
});

describe('insertNameForCode', () => {
  it('matches the longer PTP prefix before the bare P prefix', () => {
    expect(insertNameForCode('PTP-5')).toBe('Prospect Theme Parallel');
  });

  it('matches BTP before P', () => {
    expect(insertNameForCode('BTP-11')).toBe('Bowman Theme Parallel');
  });

  it('matches a bare P prefix only when no longer prefix applies', () => {
    expect(insertNameForCode('P-12')).toBe('Prospect');
  });

  it('returns null for an unknown prefix', () => {
    expect(insertNameForCode('ZZZ-1')).toBeNull();
  });

  it('returns null for a plain numeric base card', () => {
    expect(insertNameForCode('47')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/checklist/sections.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/checklist/sections.ts`**

```typescript
const HEADER = /^[A-Z0-9 &'\-.]{4,}$/;

/**
 * Canonical insert names keyed by card-code prefix. The code prefix wins over
 * whatever a row's own text claims. Order matters at lookup time, not here:
 * longer prefixes must be tested first so PTP- and BTP- are not eaten by P-.
 */
const INSERT_NAMES_BY_PREFIX: Record<string, string> = {
  PTP: 'Prospect Theme Parallel',
  BTP: 'Bowman Theme Parallel',
  BCP: 'Bowman Chrome Prospects',
  RVA: 'Rookie Variation Autograph',
  WBC: 'WBC Flag Variation',
  SF: 'Stars of Future',
  TT: 'Travel Tags',
  BB: 'Big Break',
  RA: 'Rookie Autograph',
  P: 'Prospect',
};

const PREFIXES_BY_LENGTH = Object.keys(INSERT_NAMES_BY_PREFIX).sort(
  (a, b) => b.length - a.length
);

export function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 4) return false;
  if (/\d/.test(trimmed) && /[a-z]/.test(trimmed)) return false;
  return HEADER.test(trimmed) && /[A-Z]/.test(trimmed);
}

export function insertNameForCode(code: string): string | null {
  const dash = code.indexOf('-');
  if (dash === -1) return null;
  const prefix = code.slice(0, dash);
  for (const candidate of PREFIXES_BY_LENGTH) {
    if (prefix === candidate) return INSERT_NAMES_BY_PREFIX[candidate];
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checklist/sections.test.ts`
Expected: all 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add core/checklist/sections.ts tests/unit/checklist/sections.test.ts
git commit -m "feat(checklist): section headers and prefix-authoritative insert naming"
```

---

### Task 5: Parallel and odds parser

**Why:** the spec makes `parallels` a real table so parallel stops being free text, and the odds sheet is what lets Rip Recap claim "two Orange /25 in one box" and have it mean something. Real source lines look like `Orange Border /25 (Hobby - 1:965)` and `Platinum Border 1/1 (Hobby - 1:136,956; Jumbo - 1:38,552)`.

**Files:**
- Create: `core/checklist/odds.ts`
- Test: `tests/unit/checklist/odds.test.ts`

**Interfaces:**
- Consumes: `ParsedParallel` from `core/checklist/types.ts` (Task 3)
- Produces: `parseParallelLine(line: string): ParsedParallel | null`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/checklist/odds.test.ts
import { describe, it, expect } from 'vitest';
import { parseParallelLine } from '@/core/checklist/odds';

describe('parseParallelLine', () => {
  it('parses a numbered parallel with single-format odds', () => {
    expect(parseParallelLine('Orange Border /25 (Hobby - 1:965)')).toEqual({
      name: 'Orange Border', printRun: 25, oddsText: 'Hobby - 1:965',
    });
  });

  it('parses multi-format odds and keeps them whole', () => {
    expect(
      parseParallelLine('Sky Blue Border /499 (Hobby - 1:268; Jumbo - 1:77)')
    ).toEqual({
      name: 'Sky Blue Border', printRun: 499, oddsText: 'Hobby - 1:268; Jumbo - 1:77',
    });
  });

  it('reads a 1/1 as a print run of 1', () => {
    expect(parseParallelLine('Platinum Border 1/1 (Hobby - 1:136,956)')).toEqual({
      name: 'Platinum Border', printRun: 1, oddsText: 'Hobby - 1:136,956',
    });
  });

  it('parses an unnumbered parallel', () => {
    expect(parseParallelLine('Bowman Logo Pattern Border (Hobby - 1:1,165)')).toEqual({
      name: 'Bowman Logo Pattern Border', printRun: null, oddsText: 'Hobby - 1:1,165',
    });
  });

  it('parses a parallel with no odds given', () => {
    expect(parseParallelLine('Green Border /99')).toEqual({
      name: 'Green Border', printRun: 99, oddsText: null,
    });
  });

  it('handles the en dash Topps actually prints', () => {
    expect(parseParallelLine('Red Border /5 (Hobby \u2013 1:26,762)')).toEqual({
      name: 'Red Border', printRun: 5, oddsText: 'Hobby - 1:26,762',
    });
  });

  it('returns null for a card row', () => {
    expect(parseParallelLine('1 Aaron Judge, New York Yankees')).toBeNull();
  });

  it('returns null for a bare heading', () => {
    expect(parseParallelLine('Parallels')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/checklist/odds.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/checklist/odds.ts`**

```typescript
import type { ParsedParallel } from './types';

const ODDS_BLOCK = /\(([^)]*\d:\d[^)]*)\)\s*$/;
const PRINT_RUN = /\s(?:\/(\d{1,6})|1\/1)\s*$/;

/** Topps prints an en dash inside odds. Normalise so stored text is consistent. */
function normaliseDashes(input: string): string {
  return input.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
}

export function parseParallelLine(line: string): ParsedParallel | null {
  const trimmed = normaliseDashes(line);
  if (!trimmed) return null;

  // A card row starts with a code or a number. A parallel never does.
  if (/^\d/.test(trimmed) || /^[A-Z]{1,6}-/.test(trimmed)) return null;

  let working = trimmed;
  let oddsText: string | null = null;

  const oddsMatch = ODDS_BLOCK.exec(working);
  if (oddsMatch) {
    oddsText = normaliseDashes(oddsMatch[1]);
    working = working.slice(0, oddsMatch.index).trim();
  }

  let printRun: number | null = null;
  const runMatch = PRINT_RUN.exec(working);
  if (runMatch) {
    printRun = runMatch[1] ? Number(runMatch[1]) : 1;
    working = working.slice(0, runMatch.index).trim();
  }

  // Needs at least two words to be a parallel name, which excludes "Parallels".
  if (!working || working.split(' ').length < 2) return null;

  return { name: working, printRun, oddsText };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checklist/odds.test.ts`
Expected: all 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add core/checklist/odds.ts tests/unit/checklist/odds.test.ts
git commit -m "feat(checklist): parse parallels with print runs and odds"
```

---

### Task 6: Source adapters, PDF and TXT and XLSX to text

**Files:**
- Create: `core/checklist/extract.ts`
- Create: `tests/fixtures/checklists/` (copied real files)
- Test: `tests/unit/checklist/extract.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `extractText(buffer: Buffer, filename: string): Promise<string>`

- [ ] **Step 1: Copy real fixtures in**

```bash
mkdir -p tests/fixtures/checklists
SRC="/c/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/Baseball Checklists"
cp "$SRC/2026_Bowman_Chrome_Baseball_Checklist.pdf" tests/fixtures/checklists/
cp "$SRC/2026_Bowman_Chrome_Baseball_Odds.pdf" tests/fixtures/checklists/
cp "$SRC/2026 Bowman Baseball Checklist – Ma.txt" tests/fixtures/checklists/bowman-base.txt
cp "$SRC/2026-Bowman-Chrome-Mega-Box-Baseball-Checklist-Downloads-Checklist-Insider-Excel-spreadsheet.xlsx" tests/fixtures/checklists/mega.xlsx
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/checklist/extract.test.ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { extractText } from '@/core/checklist/extract';

const fixture = (name: string) =>
  resolve(__dirname, '../../fixtures/checklists', name);

describe('extractText', () => {
  it('extracts text from a real Topps checklist PDF', async () => {
    const buf = await readFile(fixture('2026_Bowman_Chrome_Baseball_Checklist.pdf'));
    const text = await extractText(buf, 'checklist.pdf');
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('BCP-');
  });

  it('returns TXT content unchanged apart from newline normalisation', async () => {
    const buf = await readFile(fixture('bowman-base.txt'));
    const text = await extractText(buf, 'bowman-base.txt');
    expect(text).toContain('Aaron Judge');
    expect(text).not.toContain('\r');
  });

  it('flattens an XLSX into one line per row', async () => {
    const buf = await readFile(fixture('mega.xlsx'));
    const text = await extractText(buf, 'mega.xlsx');
    expect(text.split('\n').length).toBeGreaterThan(10);
  });

  it('rejects an unsupported extension', async () => {
    await expect(extractText(Buffer.from('x'), 'notes.docx')).rejects.toThrow(
      /unsupported checklist format/i
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/checklist/extract.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `core/checklist/extract.ts`**

```typescript
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf';
import ExcelJS from 'exceljs';

function normaliseNewlines(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

async function fromPdf(buffer: Buffer): Promise<string> {
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractPdfText(doc, { mergePages: true });
  return normaliseNewlines(Array.isArray(text) ? text.join('\n') : text);
}

async function fromXlsx(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        cells.push(String(cell.value ?? '').trim());
      });
      if (cells.length) lines.push(cells.join(' '));
    });
  });
  return lines.join('\n');
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  if (ext === '.pdf') return fromPdf(buffer);
  if (ext === '.txt') return normaliseNewlines(buffer.toString('utf8'));
  if (ext === '.xlsx' || ext === '.xlsm') return fromXlsx(buffer);
  throw new Error(`Unsupported checklist format: ${ext}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checklist/extract.test.ts`
Expected: all 4 PASS. If the PDF assertion fails, print the first 500 characters of the extracted text and adjust the assertion to a string the real file contains. Do not change the parser to match a guess.

- [ ] **Step 6: Commit**

```bash
git add core/checklist/extract.ts tests/unit/checklist/extract.test.ts tests/fixtures/
git commit -m "feat(checklist): extract text from pdf, txt and xlsx sources"
```

---

### Task 7: Parse orchestration over a whole document

**Files:**
- Create: `core/checklist/parse.ts`
- Test: `tests/unit/checklist/parse.test.ts`

**Interfaces:**
- Consumes: `parseRow` (Task 3), `isSectionHeader` (Task 4), `parseParallelLine` (Task 5), `extractText` (Task 6)
- Produces:
  - `type ParseResult = { sections: ParsedSection[]; parallels: ParsedParallel[]; totalRows: number }`
  - `parseChecklistText(text: string): ParseResult`
  - `parseChecklistFile(buffer: Buffer, filename: string): Promise<ParseResult>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/checklist/parse.test.ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseChecklistText, parseChecklistFile } from '@/core/checklist/parse';

const fixture = (name: string) =>
  resolve(__dirname, '../../fixtures/checklists', name);

describe('parseChecklistText', () => {
  it('groups rows under the preceding section header', () => {
    const result = parseChecklistText(
      [
        'BOWMAN CHROME PROSPECTS',
        'BCP-151Slater de BrunTampa Bay Rays',
        'BCP-152Wandy AsigenNew York Mets',
        'TRAVEL TAGS',
        'TT-1Juan SotoNew York Mets',
      ].join('\n')
    );
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].heading).toBe('BOWMAN CHROME PROSPECTS');
    expect(result.sections[0].rows).toHaveLength(2);
    expect(result.sections[1].rows[0].player).toBe('Juan Soto');
    expect(result.totalRows).toBe(3);
  });

  it('collects parallels separately from card rows', () => {
    const result = parseChecklistText(
      ['Orange Border /25 (Hobby - 1:965)', '1 Aaron Judge, New York Yankees'].join('\n')
    );
    expect(result.parallels).toHaveLength(1);
    expect(result.parallels[0].printRun).toBe(25);
    expect(result.totalRows).toBe(1);
  });

  it('keeps base rows that appear before any section header', () => {
    const result = parseChecklistText('1 Aaron Judge, New York Yankees');
    expect(result.totalRows).toBe(1);
    expect(result.sections[0].heading).toBe('BASE');
  });

  it('does not emit duplicate codes within a section', () => {
    const result = parseChecklistText(
      ['BASE SET', '1 Aaron Judge, New York Yankees', '1 Aaron Judge, New York Yankees'].join('\n')
    );
    expect(result.totalRows).toBe(1);
  });
});

describe('parseChecklistFile', () => {
  it('parses the real Bowman base TXT checklist end to end', async () => {
    const buf = await readFile(fixture('bowman-base.txt'));
    const result = await parseChecklistFile(buf, 'bowman-base.txt');
    expect(result.totalRows).toBeGreaterThan(50);
    expect(result.parallels.length).toBeGreaterThan(5);
    const judge = result.sections
      .flatMap((s) => s.rows)
      .find((r) => r.player === 'Aaron Judge');
    expect(judge?.team).toBe('New York Yankees');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/checklist/parse.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/checklist/parse.ts`**

```typescript
import { parseRow } from './rows';
import { isSectionHeader } from './sections';
import { parseParallelLine } from './odds';
import { extractText } from './extract';
import type { ParsedParallel, ParsedSection } from './types';

export type ParseResult = {
  sections: ParsedSection[];
  parallels: ParsedParallel[];
  totalRows: number;
};

const DEFAULT_SECTION = 'BASE';

export function parseChecklistText(text: string): ParseResult {
  const sections: ParsedSection[] = [];
  const parallels: ParsedParallel[] = [];
  const seenCodes = new Set<string>();
  let current: ParsedSection | null = null;

  const open = (heading: string): ParsedSection => {
    const section: ParsedSection = { heading, rows: [] };
    sections.push(section);
    return section;
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const row = parseRow(line);
    if (row) {
      if (!current) current = open(DEFAULT_SECTION);
      const key = `${current.heading}:${row.code}`;
      if (seenCodes.has(key)) continue;
      seenCodes.add(key);
      current.rows.push(row);
      continue;
    }

    const parallel = parseParallelLine(line);
    if (parallel) {
      parallels.push(parallel);
      continue;
    }

    if (isSectionHeader(line)) current = open(line);
  }

  return {
    sections: sections.filter((s) => s.rows.length > 0),
    parallels,
    totalRows: sections.reduce((n, s) => n + s.rows.length, 0),
  };
}

export async function parseChecklistFile(
  buffer: Buffer,
  filename: string
): Promise<ParseResult> {
  return parseChecklistText(await extractText(buffer, filename));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/checklist/parse.test.ts`
Expected: all 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add core/checklist/parse.ts tests/unit/checklist/parse.test.ts
git commit -m "feat(checklist): orchestrate full-document parsing"
```

---

### Task 8: Database schema, products and checklist and parallels

**Files:**
- Create: `lib/db/client.ts`, `lib/db/schema/products.ts`, `lib/db/schema/checklistEntries.ts`, `lib/db/schema/parallels.ts`, `lib/db/schema/index.ts`, `drizzle.config.ts`
- Test: `tests/unit/db/schema-products.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `products`, `checklistEntries`, `parallels` Drizzle tables, and the types `Product`, `NewProduct`, `ChecklistEntry`, `NewChecklistEntry`, `Parallel`, `NewParallel`

- [ ] **Step 1: Write `drizzle.config.ts` and `lib/db/client.ts`**

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default defineConfig({
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT! },
  verbose: true,
  strict: true,
});
```

```typescript
// lib/db/client.ts
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/db/schema-products.test.ts
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { products } from '@/lib/db/schema/products';
import { checklistEntries } from '@/lib/db/schema/checklistEntries';
import { parallels } from '@/lib/db/schema/parallels';

const columnNames = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name);

describe('products schema', () => {
  it('is named products and carries the category discriminator', () => {
    const config = getTableConfig(products);
    expect(config.name).toBe('products');
    expect(columnNames(products)).toEqual(
      expect.arrayContaining([
        'id', 'category', 'year', 'brand', 'product_name', 'format', 'sport',
        'release_date', 'checklist_loaded_at', 'odds_loaded_at',
      ])
    );
  });
});

describe('checklist_entries schema', () => {
  it('stores team and insert and the rookie flags as real columns', () => {
    expect(columnNames(checklistEntries)).toEqual(
      expect.arrayContaining([
        'id', 'product_id', 'card_number', 'player', 'team', 'insert_name',
        'is_rookie', 'is_first_bowman',
      ])
    );
  });

  it('is unique on product and card number', () => {
    const config = getTableConfig(checklistEntries);
    const names = config.uniqueConstraints.map((u) => u.name);
    expect(names).toContain('checklist_entries_product_card_unique');
  });
});

describe('parallels schema', () => {
  it('stores print run and odds text', () => {
    expect(columnNames(parallels)).toEqual(
      expect.arrayContaining(['id', 'product_id', 'name', 'print_run', 'odds_text'])
    );
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/db/schema-products.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement the three schema files**

```typescript
// lib/db/schema/products.ts
import {
  pgTable, bigserial, uuid, text, integer, date, timestamp, index, check, unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const PRODUCT_CATEGORIES = ['sports', 'tcg'] as const;

export const products = pgTable(
  'products',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    category: text('category').notNull().default('sports'),
    year: integer('year').notNull(),
    brand: text('brand').notNull(),
    productName: text('product_name').notNull(),
    format: text('format'),
    sport: text('sport').notNull().default('Baseball'),
    releaseDate: date('release_date'),
    checklistLoadedAt: timestamp('checklist_loaded_at', { withTimezone: true }),
    oddsLoadedAt: timestamp('odds_loaded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('products_user_idx').on(t.userId),
    identityUnique: unique('products_identity_unique').on(
      t.userId, t.year, t.brand, t.productName, t.format
    ),
    categoryCheck: check(
      'products_category_valid',
      sql`${t.category} IN ('sports', 'tcg')`
    ),
  })
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
```

```typescript
// lib/db/schema/checklistEntries.ts
import {
  pgTable, bigserial, bigint, text, boolean, index, unique,
} from 'drizzle-orm/pg-core';
import { products } from './products';

export const checklistEntries = pgTable(
  'checklist_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    cardNumber: text('card_number').notNull(),
    player: text('player').notNull(),
    team: text('team'),
    insertName: text('insert_name'),
    isRookie: boolean('is_rookie').notNull().default(false),
    isFirstBowman: boolean('is_first_bowman').notNull().default(false),
  },
  (t) => ({
    productIdx: index('checklist_entries_product_idx').on(t.productId),
    teamIdx: index('checklist_entries_team_idx').on(t.team),
    insertIdx: index('checklist_entries_insert_idx').on(t.insertName),
    productCardUnique: unique('checklist_entries_product_card_unique').on(
      t.productId, t.cardNumber
    ),
  })
);

export type ChecklistEntry = typeof checklistEntries.$inferSelect;
export type NewChecklistEntry = typeof checklistEntries.$inferInsert;
```

```typescript
// lib/db/schema/parallels.ts
import {
  pgTable, bigserial, bigint, text, integer, index, unique, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products';

export const parallels = pgTable(
  'parallels',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    printRun: integer('print_run'),
    oddsText: text('odds_text'),
  },
  (t) => ({
    productIdx: index('parallels_product_idx').on(t.productId),
    productNameUnique: unique('parallels_product_name_unique').on(t.productId, t.name),
    printRunCheck: check(
      'parallels_print_run_positive',
      sql`${t.printRun} IS NULL OR ${t.printRun} > 0`
    ),
  })
);

export type Parallel = typeof parallels.$inferSelect;
export type NewParallel = typeof parallels.$inferInsert;
```

```typescript
// lib/db/schema/index.ts
export * from './products';
export * from './checklistEntries';
export * from './parallels';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/db/schema-products.test.ts`
Expected: all 4 PASS.

- [ ] **Step 6: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Note: `drizzle-kit push` needs a TTY and will hang in a non-interactive shell. Use `generate` then `migrate`, never `push`.

- [ ] **Step 7: Commit**

```bash
git add lib/db drizzle drizzle.config.ts tests/unit/db
git commit -m "feat(db): products, checklist entries and parallels"
```

---

### Task 9: Database schema, cards and photos and listings and sales

**Why the constraints look like this:** the spec deletes `status` and `needs_back_photo` because both were storable restatements of facts that rot. It replaces `duplicate_of_id` with `quantity`, because the old CHECK (`duplicate_of_id IS NULL OR for_sale = false`) forced every second physical copy into the personal-collection bucket and produced a wrong PC count of 112 against a true 53.

**Files:**
- Create: `lib/db/schema/cards.ts`, `lib/db/schema/cardPhotos.ts`, `lib/db/schema/cardListings.ts`, `lib/db/schema/cardSales.ts`
- Modify: `lib/db/schema/index.ts`
- Test: `tests/unit/db/schema-cards.test.ts`

**Interfaces:**
- Consumes: `products`, `checklistEntries`, `parallels` from Task 8
- Produces: `cards`, `cardPhotos`, `cardListings`, `cardSales` tables and their inferred types. `CARD_INTENTS` and `PHOTO_SIDES` constants.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/db/schema-cards.test.ts
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { cards, CARD_INTENTS } from '@/lib/db/schema/cards';
import { cardPhotos, PHOTO_SIDES } from '@/lib/db/schema/cardPhotos';
import { cardListings } from '@/lib/db/schema/cardListings';
import { cardSales } from '@/lib/db/schema/cardSales';

const columnNames = (t: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(t).columns.map((c) => c.name);

describe('cards schema', () => {
  it('has intent as a real column with three states', () => {
    expect(CARD_INTENTS).toEqual(['keep', 'sell', 'undecided']);
    expect(columnNames(cards)).toContain('intent');
  });

  it('has quantity rather than a duplicate pointer', () => {
    const names = columnNames(cards);
    expect(names).toContain('quantity');
    expect(names).not.toContain('duplicate_of_id');
  });

  it('does not store status or needs_back_photo, which are computable', () => {
    const names = columnNames(cards);
    expect(names).not.toContain('status');
    expect(names).not.toContain('needs_back_photo');
    expect(names).not.toContain('for_sale');
  });

  it('prevents double entry with a copy-identity unique constraint', () => {
    const names = getTableConfig(cards).uniqueConstraints.map((u) => u.name);
    expect(names).toContain('cards_copy_identity_unique');
  });

  it('carries the rip provenance link', () => {
    expect(columnNames(cards)).toContain('rip_id');
  });
});

describe('card_photos schema', () => {
  it('models side explicitly so needs_back_photo can be derived', () => {
    expect(PHOTO_SIDES).toEqual(['front', 'back', 'detail']);
    expect(columnNames(cardPhotos)).toEqual(
      expect.arrayContaining(['card_id', 'side', 'url'])
    );
  });
});

describe('card_listings and card_sales schemas', () => {
  it('preserve the ebay mapping the migration must not break', () => {
    expect(columnNames(cardListings)).toEqual(
      expect.arrayContaining(['card_id', 'ebay_item_id', 'ebay_sku'])
    );
  });

  it('store money as integer cents', () => {
    const cols = getTableConfig(cardSales).columns;
    const price = cols.find((c) => c.name === 'sale_price_cents');
    expect(price?.getSQLType()).toBe('integer');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/db/schema-cards.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the four schema files**

```typescript
// lib/db/schema/cards.ts
import {
  pgTable, bigserial, bigint, uuid, text, integer, boolean, timestamp,
  index, check, unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { products } from './products';
import { checklistEntries } from './checklistEntries';
import { parallels } from './parallels';

export const CARD_INTENTS = ['keep', 'sell', 'undecided'] as const;

export const cards = pgTable(
  'cards',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id').notNull(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id),
    checklistEntryId: bigint('checklist_entry_id', { mode: 'number' })
      .notNull()
      .references(() => checklistEntries.id),
    parallelId: bigint('parallel_id', { mode: 'number' }).references(() => parallels.id),

    // Properties of this physical copy.
    serialNumber: text('serial_number'),
    serialPrintRun: integer('serial_print_run'),
    isAutograph: boolean('is_autograph').notNull().default(false),
    isMemorabilia: boolean('is_memorabilia').notNull().default(false),
    isGraded: boolean('is_graded').notNull().default(false),
    grader: text('grader'),
    grade: text('grade'),
    condition: text('condition'),
    quantity: integer('quantity').notNull().default(1),

    // "Is this mine?" is a column with an answer, not a phrase in prose.
    intent: text('intent').notNull().default('undecided'),
    location: text('location'),

    ripId: bigint('rip_id', { mode: 'number' }),
    verification: text('verification').notNull().default('unverified'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('cards_user_idx').on(t.userId),
    productIdx: index('cards_product_idx').on(t.productId),
    entryIdx: index('cards_checklist_entry_idx').on(t.checklistEntryId),
    ripIdx: index('cards_rip_idx').on(t.ripId),
    intentIdx: index('cards_intent_idx').on(t.intent),

    // Double entry bumps quantity instead of minting a rival row. This replaces
    // duplicate_of_id and the CHECK that forced second copies out of sale.
    copyIdentityUnique: unique('cards_copy_identity_unique').on(
      t.userId, t.productId, t.checklistEntryId, t.parallelId, t.serialNumber
    ),
    intentCheck: check(
      'cards_intent_valid',
      sql`${t.intent} IN ('keep', 'sell', 'undecided')`
    ),
    verificationCheck: check(
      'cards_verification_valid',
      sql`${t.verification} IN ('verified', 'unverified', 'conflict')`
    ),
    quantityCheck: check('cards_quantity_positive', sql`${t.quantity} > 0`),
  })
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
```

```typescript
// lib/db/schema/cardPhotos.ts
import {
  pgTable, bigserial, bigint, text, boolean, timestamp, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cards } from './cards';

export const PHOTO_SIDES = ['front', 'back', 'detail'] as const;

export const cardPhotos = pgTable(
  'card_photos',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    cardId: bigint('card_id', { mode: 'number' })
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    side: text('side').notNull(),
    url: text('url').notNull(),
    storagePath: text('storage_path'),
    /** Content hash of the source file, so re-ingest never duplicates a photo. */
    sourceHash: text('source_hash'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cardIdx: index('card_photos_card_idx').on(t.cardId),
    hashIdx: index('card_photos_hash_idx').on(t.sourceHash),
    sideCheck: check(
      'card_photos_side_valid',
      sql`${t.side} IN ('front', 'back', 'detail')`
    ),
  })
);

export type CardPhoto = typeof cardPhotos.$inferSelect;
export type NewCardPhoto = typeof cardPhotos.$inferInsert;
```

```typescript
// lib/db/schema/cardListings.ts
import {
  pgTable, bigserial, bigint, text, integer, timestamp, index,
} from 'drizzle-orm/pg-core';
import { cards } from './cards';

export const cardListings = pgTable(
  'card_listings',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    cardId: bigint('card_id', { mode: 'number' })
      .notNull()
      .references(() => cards.id, { onDelete: 'cascade' }),
    ebayItemId: text('ebay_item_id'),
    ebaySku: text('ebay_sku'),
    ebayOfferId: text('ebay_offer_id'),
    listingType: text('listing_type'),
    askingPriceCents: integer('asking_price_cents'),
    quantity: integer('quantity').notNull().default(1),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cardIdx: index('card_listings_card_idx').on(t.cardId),
    itemIdx: index('card_listings_item_idx').on(t.ebayItemId),
  })
);

export type CardListing = typeof cardListings.$inferSelect;
export type NewCardListing = typeof cardListings.$inferInsert;
```

```typescript
// lib/db/schema/cardSales.ts
import {
  pgTable, bigserial, bigint, text, integer, date, timestamp, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { cards } from './cards';

export const cardSales = pgTable(
  'card_sales',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    cardId: bigint('card_id', { mode: 'number' })
      .notNull()
      .references(() => cards.id),
    saleDate: date('sale_date').notNull(),
    quantity: integer('quantity').notNull().default(1),
    salePriceCents: integer('sale_price_cents').notNull(),
    feesCents: integer('fees_cents').notNull().default(0),
    platform: text('platform'),
    ebayOrderId: text('ebay_order_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    cardIdx: index('card_sales_card_idx').on(t.cardId),
    dateIdx: index('card_sales_date_idx').on(t.saleDate),
    priceCheck: check('card_sales_price_nonneg', sql`${t.salePriceCents} >= 0`),
  })
);

export type CardSale = typeof cardSales.$inferSelect;
export type NewCardSale = typeof cardSales.$inferInsert;
```

```typescript
// lib/db/schema/index.ts
export * from './products';
export * from './checklistEntries';
export * from './parallels';
export * from './cards';
export * from './cardPhotos';
export * from './cardListings';
export * from './cardSales';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/db/schema-cards.test.ts`
Expected: all 8 PASS.

- [ ] **Step 5: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

- [ ] **Step 6: Commit**

```bash
git add lib/db drizzle tests/unit/db
git commit -m "feat(db): cards, photos, listings and sales with intent and quantity"
```

---

### Task 10: Product service and the verification gate

**Files:**
- Create: `core/products/service.ts`, `core/products/verify.ts`
- Test: `tests/unit/products/verify.test.ts`

**Interfaces:**
- Consumes: `ParseResult` (Task 7), schema tables (Tasks 8 and 9)
- Produces:
  - `type VerificationInput = { cardNumber: string; player: string }`
  - `type VerificationResult = { ok: true; entry: ChecklistEntry } | { ok: false; reason: 'no_checklist' | 'unknown_card_number' | 'player_mismatch'; message: string }`
  - `verifyAgainstChecklist(entries: ChecklistEntry[], checklistLoaded: boolean, input: VerificationInput): VerificationResult`
  - `loadChecklistForProduct(productId: number, parsed: ParseResult): Promise<{ entriesInserted: number; parallelsInserted: number }>`

- [ ] **Step 1: Write the failing test**

Note: `verifyAgainstChecklist` takes the entries as an argument rather than querying, so it is pure and testable with no database.

```typescript
// tests/unit/products/verify.test.ts
import { describe, it, expect } from 'vitest';
import { verifyAgainstChecklist } from '@/core/products/verify';
import type { ChecklistEntry } from '@/lib/db/schema/checklistEntries';

const entry = (over: Partial<ChecklistEntry>): ChecklistEntry => ({
  id: 1, productId: 1, cardNumber: 'BCP-231', player: 'Bryce Walcott',
  team: 'Seattle Mariners', insertName: 'Bowman Chrome Prospects',
  isRookie: false, isFirstBowman: true, ...over,
});

describe('verifyAgainstChecklist', () => {
  it('refuses when no checklist is loaded, which is the hard gate', () => {
    const result = verifyAgainstChecklist([], false, {
      cardNumber: 'BCP-231', player: 'Bryce Walcott',
    });
    expect(result).toEqual({
      ok: false,
      reason: 'no_checklist',
      message: 'No checklist loaded for this product. Add one to continue.',
    });
  });

  it('accepts a card number that exists with a matching player', () => {
    const result = verifyAgainstChecklist([entry({})], true, {
      cardNumber: 'BCP-231', player: 'Bryce Walcott',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a card number absent from the checklist', () => {
    // The real BCP-331 misread that the checklist caught.
    const result = verifyAgainstChecklist([entry({})], true, {
      cardNumber: 'BCP-331', player: 'Bryce Walcott',
    });
    expect(result).toMatchObject({ ok: false, reason: 'unknown_card_number' });
  });

  it('rejects when the number exists but names a different player', () => {
    const result = verifyAgainstChecklist([entry({})], true, {
      cardNumber: 'BCP-231', player: 'Colt Emerson',
    });
    expect(result).toMatchObject({ ok: false, reason: 'player_mismatch' });
  });

  it('matches players case-insensitively and ignoring accents', () => {
    const result = verifyAgainstChecklist(
      [entry({ cardNumber: '5', player: 'Julio Rodríguez' })],
      true,
      { cardNumber: '5', player: 'julio rodriguez' }
    );
    expect(result.ok).toBe(true);
  });

  it('ignores a name suffix difference', () => {
    const result = verifyAgainstChecklist(
      [entry({ cardNumber: '2', player: 'Vladimir Guerrero Jr.' })],
      true,
      { cardNumber: '2', player: 'Vladimir Guerrero Jr' }
    );
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/products/verify.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/products/verify.ts`**

```typescript
import type { ChecklistEntry } from '@/lib/db/schema/checklistEntries';

export type VerificationInput = { cardNumber: string; player: string };

export type VerificationResult =
  | { ok: true; entry: ChecklistEntry }
  | {
      ok: false;
      reason: 'no_checklist' | 'unknown_card_number' | 'player_mismatch';
      message: string;
    };

/**
 * Normalise both sides before comparing. Accents, case, punctuation and name
 * suffixes all differ between a checklist and a scan, and comparing raw strings
 * produces false mismatches.
 */
export function normalisePlayer(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyAgainstChecklist(
  entries: ChecklistEntry[],
  checklistLoaded: boolean,
  input: VerificationInput
): VerificationResult {
  if (!checklistLoaded) {
    return {
      ok: false,
      reason: 'no_checklist',
      message: 'No checklist loaded for this product. Add one to continue.',
    };
  }

  const match = entries.find((e) => e.cardNumber === input.cardNumber);
  if (!match) {
    return {
      ok: false,
      reason: 'unknown_card_number',
      message: `Card number ${input.cardNumber} is not on this product's checklist.`,
    };
  }

  if (normalisePlayer(match.player) !== normalisePlayer(input.player)) {
    return {
      ok: false,
      reason: 'player_mismatch',
      message: `Checklist says ${match.cardNumber} is ${match.player}, scan read ${input.player}.`,
    };
  }

  return { ok: true, entry: match };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/products/verify.test.ts`
Expected: all 6 PASS.

- [ ] **Step 5: Implement `core/products/service.ts`**

```typescript
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { products, type NewProduct } from '@/lib/db/schema/products';
import { checklistEntries } from '@/lib/db/schema/checklistEntries';
import { parallels } from '@/lib/db/schema/parallels';
import { insertNameForCode } from '@/core/checklist/sections';
import type { ParseResult } from '@/core/checklist/parse';

export async function createProduct(input: NewProduct) {
  const [row] = await db.insert(products).values(input).returning();
  return row;
}

export async function loadChecklistForProduct(
  productId: number,
  parsed: ParseResult
): Promise<{ entriesInserted: number; parallelsInserted: number }> {
  const entryRows = parsed.sections.flatMap((section) =>
    section.rows.map((row) => ({
      productId,
      cardNumber: row.code,
      player: row.player,
      team: row.team,
      // The code prefix is authoritative over the section heading.
      insertName: insertNameForCode(row.code) ?? section.heading,
      isRookie: row.isRookie,
      isFirstBowman: row.code.startsWith('BCP-'),
    }))
  );

  const parallelRows = parsed.parallels.map((p) => ({
    productId,
    name: p.name,
    printRun: p.printRun,
    oddsText: p.oddsText,
  }));

  const inserted = entryRows.length
    ? await db
        .insert(checklistEntries)
        .values(entryRows)
        .onConflictDoNothing()
        .returning({ id: checklistEntries.id })
    : [];

  const insertedParallels = parallelRows.length
    ? await db
        .insert(parallels)
        .values(parallelRows)
        .onConflictDoNothing()
        .returning({ id: parallels.id })
    : [];

  await db
    .update(products)
    .set({ checklistLoadedAt: new Date(), updatedAt: new Date() })
    .where(eq(products.id, productId));

  return {
    entriesInserted: inserted.length,
    parallelsInserted: insertedParallels.length,
  };
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add core/products tests/unit/products
git commit -m "feat(products): checklist loading and the verification hard gate"
```

---

### Task 11: Seed the twelve existing checklist files

**Files:**
- Create: `scripts/seed-checklists.ts`, `data/checklist-sources.json`
- Test: `tests/unit/products/seed-manifest.test.ts`

**Interfaces:**
- Consumes: `parseChecklistFile` (Task 7), `createProduct` and `loadChecklistForProduct` (Task 10)
- Produces: `type ChecklistSource = { file: string; year: number; brand: string; productName: string; format: string | null; sport: string; kind: 'checklist' | 'odds' }` and `CHECKLIST_SOURCES: ChecklistSource[]`

- [ ] **Step 1: Write `data/checklist-sources.json`**

The twelve real files, mapped to the product each describes.

```json
[
  { "file": "2026_Bowman_Chrome_Baseball_Checklist.pdf", "year": 2026, "brand": "Bowman", "productName": "Bowman Chrome", "format": "Hobby", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026_Bowman_Chrome_Baseball_Checklist_1_mega.pdf", "year": 2026, "brand": "Bowman", "productName": "Bowman Chrome", "format": "Mega", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026_Bowman_Chrome_Baseball_Odds.pdf", "year": 2026, "brand": "Bowman", "productName": "Bowman Chrome", "format": "Hobby", "sport": "Baseball", "kind": "odds" },
  { "file": "2026_Bowman_Baseball_Checklist.pdf", "year": 2026, "brand": "Bowman", "productName": "Bowman", "format": "Hobby", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026 Bowman Baseball Checklist – Ma.txt", "year": 2026, "brand": "Bowman", "productName": "Bowman", "format": "Hobby", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026-Bowman-Chrome-Mega-Box-Baseball-Checklist-Downloads-Checklist-Insider-Excel-spreadsheet.xlsx", "year": 2026, "brand": "Bowman", "productName": "Bowman Chrome", "format": "Mega", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026_Topps_Chrome_Baseball_Checklist_Final_7.22.pdf", "year": 2026, "brand": "Topps", "productName": "Topps Chrome", "format": "Hobby", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026 Topps Chrome Baseball Checklist.txt", "year": 2026, "brand": "Topps", "productName": "Topps Chrome", "format": "Hobby", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026_Topps_Chrome_Logofractor_Checklist.pdf", "year": 2026, "brand": "Topps", "productName": "Topps Chrome Logofractor", "format": null, "sport": "Baseball", "kind": "checklist" },
  { "file": "2026 Topps Finest Baseball Checklist.txt", "year": 2026, "brand": "Topps", "productName": "Topps Finest", "format": "Hobby", "sport": "Baseball", "kind": "checklist" },
  { "file": "2026_Bowman_Football_Checklist.pdf", "year": 2026, "brand": "Bowman", "productName": "Bowman Football", "format": "Hobby", "sport": "Football", "kind": "checklist" },
  { "file": "2026_Topps_Bowman_Football_Odds.pdf", "year": 2026, "brand": "Bowman", "productName": "Bowman Football", "format": "Hobby", "sport": "Football", "kind": "odds" }
]
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/products/seed-manifest.test.ts
import { describe, it, expect } from 'vitest';
import { readdir } from 'node:fs/promises';
import sources from '@/data/checklist-sources.json';

const SOURCE_DIR =
  'C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/Baseball Checklists';

describe('checklist source manifest', () => {
  it('lists all twelve files', () => {
    expect(sources).toHaveLength(12);
  });

  it('references only files that exist on disk', async () => {
    const onDisk = new Set(await readdir(SOURCE_DIR));
    const missing = sources.filter((s) => !onDisk.has(s.file));
    expect(missing.map((m) => m.file)).toEqual([]);
  });

  it('gives every entry a product identity and a kind', () => {
    for (const s of sources) {
      expect(s.year).toBeGreaterThan(2000);
      expect(s.brand).toBeTruthy();
      expect(s.productName).toBeTruthy();
      expect(['checklist', 'odds']).toContain(s.kind);
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails, then passes**

Run: `npx vitest run tests/unit/products/seed-manifest.test.ts`
Expected: FAIL until `data/checklist-sources.json` exists, then PASS. If a filename in the manifest does not match disk exactly, fix the manifest to match disk. Do not rename the source files.

- [ ] **Step 4: Write `scripts/seed-checklists.ts`**

```typescript
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { products } from '@/lib/db/schema/products';
import { parseChecklistFile } from '@/core/checklist/parse';
import { createProduct, loadChecklistForProduct } from '@/core/products/service';
import sources from '@/data/checklist-sources.json';

const SOURCE_DIR =
  'C:/Users/Michael/Documents/Claude/Pokemon_Portfolio/eBay_assets/Baseball Checklists';

const USER_ID = process.env.SEED_USER_ID;
if (!USER_ID) throw new Error('SEED_USER_ID is not set');

async function findOrCreateProduct(s: (typeof sources)[number]) {
  const existing = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.userId, USER_ID!),
        eq(products.year, s.year),
        eq(products.brand, s.brand),
        eq(products.productName, s.productName)
      )
    );
  if (existing.length) return existing[0];
  return createProduct({
    userId: USER_ID!,
    year: s.year,
    brand: s.brand,
    productName: s.productName,
    format: s.format,
    sport: s.sport,
    category: 'sports',
  });
}

async function main() {
  for (const source of sources) {
    const product = await findOrCreateProduct(source);
    const buffer = await readFile(join(SOURCE_DIR, source.file));
    const parsed = await parseChecklistFile(buffer, source.file);
    const result = await loadChecklistForProduct(product.id, parsed);
    console.log(
      `${source.file}: ${result.entriesInserted} entries, ` +
        `${result.parallelsInserted} parallels -> product ${product.id}`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Run the seed and record the real counts**

Run: `npm run seed:checklists`
Expected: twelve lines of output, each with a nonzero entry count for `kind: checklist` rows. **If any checklist file yields zero entries, stop and fix the parser rather than accepting it.** Paste the actual output into the task notes so the numbers are on record.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-checklists.ts data/checklist-sources.json tests/unit/products/seed-manifest.test.ts
git commit -m "feat(products): seed the twelve existing checklist and odds files"
```

---

### Task 12: Minimal products UI and deploy

**Files:**
- Create: `app/products/page.tsx`, `app/products/[id]/page.tsx`
- Modify: `app/page.tsx`
- Test: `tests/unit/products/queries.test.ts`

**Interfaces:**
- Consumes: schema tables (Tasks 8 and 9)
- Produces: `listProductsWithCounts()` and `getProductChecklist(productId: number)` from `core/products/service.ts`

- [ ] **Step 1: Write the failing test for the query shapes**

```typescript
// tests/unit/products/queries.test.ts
import { describe, it, expect } from 'vitest';
import { summariseProduct } from '@/core/products/summary';

describe('summariseProduct', () => {
  it('labels a product with no checklist as blocked for ingest', () => {
    expect(
      summariseProduct({ checklistLoadedAt: null, entryCount: 0, parallelCount: 0 })
    ).toEqual({ ready: false, label: 'No checklist loaded. Add one to continue.' });
  });

  it('labels a loaded product as ready and counts what it holds', () => {
    expect(
      summariseProduct({
        checklistLoadedAt: new Date('2026-10-05T00:00:00Z'),
        entryCount: 350,
        parallelCount: 22,
      })
    ).toEqual({ ready: true, label: '350 cards, 22 parallels' });
  });

  it('treats a loaded timestamp with zero entries as not ready', () => {
    expect(
      summariseProduct({
        checklistLoadedAt: new Date('2026-10-05T00:00:00Z'),
        entryCount: 0,
        parallelCount: 4,
      })
    ).toEqual({ ready: false, label: 'No checklist loaded. Add one to continue.' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/products/queries.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `core/products/summary.ts`**

```typescript
export type ProductSummaryInput = {
  checklistLoadedAt: Date | null;
  entryCount: number;
  parallelCount: number;
};

export function summariseProduct(input: ProductSummaryInput): {
  ready: boolean;
  label: string;
} {
  if (!input.checklistLoadedAt || input.entryCount === 0) {
    return { ready: false, label: 'No checklist loaded. Add one to continue.' };
  }
  return {
    ready: true,
    label: `${input.entryCount} cards, ${input.parallelCount} parallels`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/products/queries.test.ts`
Expected: all 3 PASS.

- [ ] **Step 5: Add the query functions to `core/products/service.ts`**

```typescript
import { sql } from 'drizzle-orm';

export async function listProductsWithCounts() {
  return db
    .select({
      id: products.id,
      year: products.year,
      brand: products.brand,
      productName: products.productName,
      format: products.format,
      sport: products.sport,
      checklistLoadedAt: products.checklistLoadedAt,
      entryCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${checklistEntries}
        WHERE ${checklistEntries.productId} = ${products.id}
      )`,
      parallelCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${parallels}
        WHERE ${parallels.productId} = ${products.id}
      )`,
    })
    .from(products)
    .orderBy(products.year, products.brand, products.productName);
}

export async function getProductChecklist(productId: number) {
  const entries = await db
    .select()
    .from(checklistEntries)
    .where(eq(checklistEntries.productId, productId))
    .orderBy(checklistEntries.insertName, checklistEntries.cardNumber);
  const productParallels = await db
    .select()
    .from(parallels)
    .where(eq(parallels.productId, productId))
    .orderBy(parallels.printRun);
  return { entries, parallels: productParallels };
}
```

- [ ] **Step 6: Write `app/products/page.tsx`**

```tsx
import Link from 'next/link';
import { listProductsWithCounts } from '@/core/products/service';
import { summariseProduct } from '@/core/products/summary';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const rows = await listProductsWithCounts();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Products</h1>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((row) => {
          const summary = summariseProduct(row);
          return (
            <li key={row.id} className="py-3">
              <Link href={`/products/${row.id}`} className="block hover:underline">
                <span className="font-medium">
                  {row.year} {row.brand} {row.productName}
                  {row.format ? ` ${row.format}` : ''}
                </span>
                <span
                  className={
                    summary.ready
                      ? 'ml-3 text-sm text-neutral-500'
                      : 'ml-3 text-sm text-amber-600'
                  }
                >
                  {summary.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && (
        <p className="text-neutral-500">
          No products yet. Run the checklist seed to load them.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Write `app/products/[id]/page.tsx`**

```tsx
import { getProductChecklist } from '@/core/products/service';

export const dynamic = 'force-dynamic';

export default async function ProductChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { entries, parallels } = await getProductChecklist(Number(id));

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Checklist</h1>

      <h2 className="mb-2 text-lg font-medium">Parallels ({parallels.length})</h2>
      <ul className="mb-8 text-sm">
        {parallels.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.printRun ? ` /${p.printRun}` : ''}
            {p.oddsText ? ` (${p.oddsText})` : ''}
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-lg font-medium">Cards ({entries.length})</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-1 pr-4">#</th>
            <th className="py-1 pr-4">Player</th>
            <th className="py-1 pr-4">Team</th>
            <th className="py-1">Insert</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-neutral-100">
              <td className="py-1 pr-4 font-mono">{e.cardNumber}</td>
              <td className="py-1 pr-4">
                {e.player}
                {e.isRookie ? ' (RC)' : ''}
              </td>
              <td className="py-1 pr-4">{e.team ?? ''}</td>
              <td className="py-1">{e.insertName ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 8: Point the home page at products**

```tsx
// app/page.tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-3xl font-semibold">Isosceles Insights</h1>
      <Link href="/products" className="text-blue-600 hover:underline">
        Products and checklists
      </Link>
    </main>
  );
}
```

- [ ] **Step 9: Verify the full build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all three pass. The Next build is the one that catches prerender errors, so it is not optional.

- [ ] **Step 10: Deploy and verify live**

```bash
npx vercel --prod
```

Then open `/products` on the deployed URL and confirm the seeded products render with real counts.

- [ ] **Step 11: Commit and push**

```bash
git add app core/products/summary.ts tests/unit/products/queries.test.ts
git commit -m "feat(ui): products list and checklist viewer"
git push -u origin main
```

---

## Done when

- `npm run typecheck`, `npm test` and `npm run build` all pass.
- The twelve checklist files are seeded, with real nonzero counts recorded in the task notes.
- `/products` renders live, and a product with no checklist shows "No checklist loaded. Add one to continue."
- `verifyAgainstChecklist` refuses a card number absent from the checklist, which is the gate the whole ingest pipeline depends on.

## Deliberately not in this plan

- Any model call. There are none in this repo by design.
- Ingest, the job queue and the agent worker. Plan 2. This includes the Discord
  enqueue ping (the app posts to the channel when it queues work, which is what
  wakes the agent), atomic job claiming, and the startup sweep for unclaimed jobs.
- Backfill of the ~2800 originals. Plan 3.
- The full Cards section, filters and saved views. Plan 4.
- eBay listing. Plan 5.
- Sealed port. Plan 6.
- Rip Recap. Plan 7, after its own design pass.
- Auto-fetch of checklists from Topps and Checklist Insider. Moved to Plan 2, because it needs the ingest job queue to run on a schedule and the twelve seeded files cover every product currently in play.
