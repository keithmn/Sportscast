# Build Prompt: Underdoggs CMS + Articles (Phase 1 — Prove the Media House Concept)

Paste this whole document as the task prompt to a Claude Code session with a fresh
repo (or this repo) to kick off implementation.

## Context

Underdoggs Sports Cast currently exists only as a static landing page
(`underdoggs-landing.html`) — dark theme, brand red `#C13422`, brand gold `#F2A20C`,
background `#090B0F`, `Barlow Condensed` for display type, `Inter` for body text.
The goal of this phase is NOT the full sports database or the public-funds
auditing feature — those come later. This phase proves the "media house" concept:
a working publication that can run articles and video/podcast content day to day.

## Goal

Ship a working editorial CMS + public site where an editor can write, categorize,
and publish articles (including video/podcast posts embedding YouTube), and
readers can browse by sport, read a story, and watch the embedded video.

## Explicit non-goals for this phase

Do not build: the structured player/team/transfer/salary database, the public
funds auditing workflow, user accounts/comments, or a paywall. Keep the schema
open to extension later (e.g. an article can optionally reference a team/player
by a plain text tag for now, not a foreign key — the real relational sports data
model is a separate phase).

## Recommended stack (adjust if the repo already has conventions)

- Next.js (App Router) + TypeScript
- Postgres (Neon or Supabase) + Prisma ORM
- NextAuth (credentials or email magic link) for admin login — two roles: `editor`, `admin`
- Tailwind CSS, reusing the existing brand tokens from `underdoggs-landing.html`
- Image storage: Vercel Blob or Cloudinary (cover images/author photos)
- Deploy target: Vercel

## Data model (Prisma schema)

```
model Author {
  id        String   @id @default(cuid())
  name      String
  bio       String?
  photoUrl  String?
  articles  Article[]
}

model Sport {
  id       String    @id @default(cuid())
  name     String    @unique   // Football, Rugby, Athletics, ...
  slug     String    @unique
  articles Article[]
}

model Tag {
  id       String    @id @default(cuid())
  name     String    @unique
  slug     String    @unique
  articles Article[]
}

model Article {
  id            String    @id @default(cuid())
  title         String
  slug          String    @unique
  dek           String    // one-line summary/subhead
  body          String    // markdown or rich JSON (pick one, be consistent)
  coverImageUrl String?
  sportId       String
  sport         Sport     @relation(fields: [sportId], references: [id])
  authorId      String
  author        Author    @relation(fields: [authorId], references: [id])
  tags          Tag[]
  status        ArticleStatus @default(DRAFT)
  featured      Boolean   @default(false)
  contentType   ContentType @default(ARTICLE) // ARTICLE | VIDEO_POST
  youtubeId     String?   // required if contentType = VIDEO_POST
  videoSeries   String?   // e.g. "Weekly Podcast", "Documentary Series"
  publishedAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum ArticleStatus { DRAFT PUBLISHED }
enum ContentType   { ARTICLE VIDEO_POST }
```

## Public site pages

1. **Homepage** — hero with the current `featured` article, below it a grid of
   latest published articles/video posts across all sports, a "Latest Podcast
   Episode" rail (filter by `videoSeries`).
2. **Sport category page** (`/football`, `/rugby`, `/athletics`, ...) — paginated
   list of published articles for that sport.
3. **Article page** (`/articles/[slug]`) — full article render; if
   `contentType = VIDEO_POST`, embed the YouTube player above/inline with the body.
4. **Author page** (`/authors/[slug]`) — bio + their published articles.
5. **Tag page** (`/tags/[slug]`) — articles under a tag (useful later for tagging
   a specific team/player by name even before the structured database exists).

## Admin CMS (`/admin`, auth-gated)

- Login (NextAuth), roles `editor` and `admin`.
- Article list with status filter (draft/published), search by title.
- Article editor: title, slug (auto-generate from title, editable), dek, body
  (markdown editor is fine for v1), sport select, tags multi-select, author
  select, cover image upload, content type toggle (Article / Video Post),
  YouTube ID + series name fields when Video Post, featured toggle,
  publish/unpublish action.
- Category (Sport) and Tag management screens (create/rename/delete).
- Author management screen (create/edit authors).
- `admin` role only: manage other admin/editor users.

## Acceptance criteria

- An editor can log in, write an article, assign a sport and tags, upload a
  cover image, and publish it — it then appears on the homepage and its sport
  category page.
- An editor can create a Video Post with a YouTube ID and it renders the
  embedded player correctly on the article page and shows up in the "Latest
  Podcast Episode" rail if it's tagged with a `videoSeries`.
- Marking an article `featured` promotes it to the homepage hero, replacing
  the previous featured article.
- Site is responsive and visually consistent with the existing landing page's
  dark/red/gold brand system.
- Unpublished (draft) articles are never reachable from public pages or direct
  URL by non-authenticated users.

## Suggested build order

1. Scaffold Next.js + Tailwind, port brand tokens/fonts from the landing page
   into a shared theme.
2. Prisma schema + migrations against Postgres.
3. Admin auth (NextAuth) + role gating middleware.
4. Article CRUD in admin (start with plain HTML forms, no fancy rich-text lib
   needed yet).
5. Public pages (homepage, category, article, author, tag).
6. Video post support (YouTube embed component + series rail).
7. Seed script with ~10 sample articles across the three sports (mix of
   article and video-post types) so the homepage isn't empty on first deploy.
