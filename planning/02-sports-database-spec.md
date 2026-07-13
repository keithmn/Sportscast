# Build Prompt: Underdoggs Structured Sports Database (Phase 2)

Paste this as a task prompt to a Claude Code session once Phase 1 (CMS +
Articles, see `01-cms-articles-build-prompt.md`) is live. This phase adds the
player/team/transfer/salary database across multiple sports. It extends the
same Next.js + Postgres + Prisma stack — do not start a second app.

## Goal

A relational database of Kenyan sports covering football, rugby, athletics
(and extensible to more), with public profile pages for teams and players,
transfer history, technical bench (coaching staff) records, and sourced salary
data for transparency. This is the highest-maintenance part of the product —
optimize the schema and admin tooling for ongoing data entry, not just display.

## Design principle: one core model, sport-specific extensions

Football and rugby are team-based with squads, transfers, and fixtures.
Athletics is individual, event-based, and organized around meets and personal
bests rather than club transfers. Do not force athletics into the football
shape. Use a shared core (`Sport`, `Person`, `Organization`) and let each
sport attach its own result/participation tables.

## Data provenance is not optional

Every salary figure and transfer fee is a claim that can be disputed or cause
legal exposure. Every record in `SalaryRecord` and `TransferRecord` must carry
a source (`sourceUrl`, `sourceType`) and a `confidence` level. Never silently
overwrite a disputed figure — supersede it with a new record and keep the old
one (audit trail), and show provenance on the public page (e.g. "reported by
[outlet], MMM YYYY" vs "club-confirmed").

## Data model (Prisma schema, extends Phase 1 schema)

```
model Sport {
  id           String   @id @default(cuid())
  name         String   @unique
  slug         String   @unique
  competitions Competition[]
  players      PlayerProfile[]
}

model Person {
  id           String   @id @default(cuid())
  firstName    String
  lastName     String
  dateOfBirth  DateTime?
  nationality  String?
  photoUrl     String?
  playerProfile PlayerProfile?
  staffRoles    StaffRole[]
}

model PlayerProfile {
  id        String   @id @default(cuid())
  personId  String   @unique
  person    Person   @relation(fields: [personId], references: [id])
  sportId   String
  sport     Sport    @relation(fields: [sportId], references: [id])
  position  String?
  bio       String?
  transferHistory TransferRecord[]
  salaryHistory   SalaryRecord[]
  athleticsResults AthleticsResult[]
}

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  sportId     String
  sport       Sport    @relation(fields: [sportId], references: [id])
  logoUrl     String?
  homeVenue   String?
  staffRoles  StaffRole[]
  transfersIn  TransferRecord[] @relation("ToOrg")
  transfersOut TransferRecord[] @relation("FromOrg")
  salaryRecords SalaryRecord[]
  homeFixtures Fixture[] @relation("HomeTeam")
  awayFixtures Fixture[] @relation("AwayTeam")
}

// "Technical bench" — coaches, physios, technical directors, officials
model StaffRole {
  id        String   @id @default(cuid())
  personId  String
  person    Person   @relation(fields: [personId], references: [id])
  orgId     String
  org       Organization @relation(fields: [orgId], references: [id])
  role      String   // "Head Coach", "Assistant Coach", "Physio", "Technical Director"
  startDate DateTime
  endDate   DateTime?
}

model TransferRecord {
  id           String   @id @default(cuid())
  playerId     String
  player       PlayerProfile @relation(fields: [playerId], references: [id])
  fromOrgId    String?
  fromOrg      Organization? @relation("FromOrg", fields: [fromOrgId], references: [id])
  toOrgId      String
  toOrg        Organization  @relation("ToOrg", fields: [toOrgId], references: [id])
  transferType String   // "Permanent", "Loan", "Free Transfer"
  feeAmount    Decimal?
  feeCurrency  String?  // "KES", "USD"
  date         DateTime
  sourceUrl    String
  sourceType   String   // "Official", "Reported", "Estimated"
  confidence   String   // "Confirmed", "Disputed", "Unverified"
  enteredById  String   // FK to admin user
  createdAt    DateTime @default(now())
  supersededById String? // points to the newer record if corrected
}

model SalaryRecord {
  id           String   @id @default(cuid())
  playerId     String
  player       PlayerProfile @relation(fields: [playerId], references: [id])
  orgId        String
  org          Organization @relation(fields: [orgId], references: [id])
  amount       Decimal
  currency     String
  period       String   // "Weekly", "Monthly", "Annual"
  effectiveFrom DateTime
  effectiveTo   DateTime?
  sourceUrl    String
  sourceType   String   // "Official Disclosure", "Reported", "Estimated"
  confidence   String
  enteredById  String
  verifiedById String?
  verifiedAt   DateTime?
  createdAt    DateTime @default(now())
  supersededById String?
}

model Competition {
  id       String   @id @default(cuid())
  name     String   // "Kenyan Premier League", "Kenya Cup"
  sportId  String
  sport    Sport    @relation(fields: [sportId], references: [id])
  seasons  Season[]
}

model Season {
  id            String   @id @default(cuid())
  competitionId String
  competition   Competition @relation(fields: [competitionId], references: [id])
  label         String   // "2025/26"
  fixtures      Fixture[]
}

model Fixture {
  id         String   @id @default(cuid())
  seasonId   String
  season     Season   @relation(fields: [seasonId], references: [id])
  homeOrgId  String
  homeOrg    Organization @relation("HomeTeam", fields: [homeOrgId], references: [id])
  awayOrgId  String
  awayOrg    Organization @relation("AwayTeam", fields: [awayOrgId], references: [id])
  date       DateTime
  venue      String?
  homeScore  Int?
  awayScore  Int?
  status     String   // "Scheduled", "Final", "Postponed"
}

// Athletics: individual, meet/event based — not a fixture between two teams
model AthleticsResult {
  id         String   @id @default(cuid())
  playerId   String
  player     PlayerProfile @relation(fields: [playerId], references: [id])
  meetName   String
  eventName  String   // "100m", "Marathon", "High Jump"
  mark       String   // time or distance, kept as string to handle both formats
  date       DateTime
  location   String?
  sourceUrl  String?
}

model DataChangeLog {
  id         String   @id @default(cuid())
  entityType String   // "SalaryRecord", "TransferRecord"
  entityId   String
  changedById String
  action     String   // "Created", "Corrected", "Superseded"
  note       String?
  createdAt  DateTime @default(now())
}
```

## Admin tooling requirements (this is the part that will get used daily)

- **Data steward role**, separate from editorial `editor`/`admin` — someone
  entering transfer/salary data doesn't need article-publishing permissions
  and vice versa.
- Fast entry forms for the common workflows: "record a transfer" (player,
  from-org, to-org, fee, source), "record/update a salary" (forces a source
  URL and source type before save — do not allow saving without one),
  "add/update technical bench role."
- A correction flow: editing a `SalaryRecord` or `TransferRecord` creates a
  new record and marks the old one `supersededById`, writing an entry to
  `DataChangeLog`. Never hard-delete a sourced figure.
- Bulk import path (CSV) for onboarding a full league roster at once — manual
  one-by-one entry for an entire top-flight league is not realistic.

## Public pages

1. **Team profile** (`/teams/[slug]`) — badge, current squad, technical bench,
   season record, transfer history (in/out), linked fixtures.
2. **Player profile** (`/players/[slug]`) — bio, current club, career/transfer
   timeline, salary history with visible sourcing/confidence labels, stats or
   (for athletics) personal bests and meet results.
3. **League table** (`/leagues/[slug]/[season]`) — standings computed from
   `Fixture` results.
4. **Transfer center** (`/transfers`) — reverse-chronological feed of recent
   `TransferRecord`s across all sports/leagues, filterable by sport.
5. **Athletics rankings** (`/athletics/[event]`) — best marks for a given
   event across athletes, sourced from `AthleticsResult`.

## Explicit non-goals for this phase

Do not build the public-funds auditing feature yet (Phase 3) — but design
`DataChangeLog` and the source/confidence pattern so Phase 3's funds-tracking
records can reuse the same provenance approach.

## Acceptance criteria

- A data steward can enter a new transfer with a source URL; it immediately
  appears on both the player's and both clubs' profile pages, and in the
  transfer center feed.
- Editing an existing salary figure preserves the old value (visible in
  history/audit log) rather than overwriting it.
- Athletics results render correctly without any team/transfer UI leaking
  into that sport's pages.
- League table page computes standings correctly from fixture results (no
  manually maintained standings table).
- CSV bulk import can seed a full league's squads (players + teams +
  positions) in one operation.
