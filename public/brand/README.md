# The Sportscast by Underdawgs — web implementation package

Hand this whole folder to Claude Code. `tokens.css` is drop-in. Every mark is a PNG with an alpha channel where relevant; nothing needs re-drawing.

For Claude Code. Everything below is normative. Do not introduce colours, fonts, weights or logo constructions not listed here.

---

## 1. Colour

Gold is the primary colour. Black and paper white are the structure that makes it carry. Hide and warm cream are the secondary pair.

```css
:root{
  /* primary */
  --sc-gold:      #F3B01C;  /* logo ground, full grounds, blocks, tags */
  --sc-gold-deep: #8A6110;  /* gold at body-text size, links */

  /* structure — appears on nearly every surface */
  --sc-black:     #0D0D0D;
  --sc-paper:     #FFFFFF;

  /* secondary */
  --sc-hide:      #B87848;  /* mascot artwork, merch, warm blocks on paper */
  --sc-cream:     #F5EAD7;  /* documents, decks, packaging */

  --sc-rule:      #E2D8C4;  /* hairlines on cream/paper */
}
```

### How to use it

- **Gold leads.** It is the default ground for the logo, hero surfaces, end frames, tags and result strips. Use it as a flat fill — never a gradient, never a tint below 100%, never a wash over a photograph.
- **Black and white do the structural work** and appear on almost every surface: black grounds and bars, white type, white space. Gold only reads as loud against something absolute.
- **Hide and cream are the quiet pair**: paper, long-form, packaging, merch, the mascot's own artwork. They stay off thumbnails.
- **Gold never carries body-size text.** Use `--sc-gold-deep` for links and small type.

### Accessible pairs

| Ground | Type |
| --- | --- |
| Gold | Black only |
| Black | Paper white, gold, cream |
| Paper white | Black, gold-deep |
| Cream | Black, gold-deep |
| Hide | Paper white |

Never gold on cream, gold on hide, or hide on black.

---

## 2. Fonts

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&family=Nunito:wght@400;600;700;900&family=Anton&display=swap" rel="stylesheet">
```

| Role | Family | Setting |
| --- | --- | --- |
| Headlines, subheads | **Montserrat 900** | Uppercase, `letter-spacing:-0.02em`, `line-height:0.98–1.05` |
| Labels, section marks, eyebrows | **Montserrat 700** | Uppercase, `letter-spacing:0.18em`, 11–13px |
| Body, captions, subtitles, UI | **Nunito 400 / 600 / 700** | Sentence case, `line-height:1.55`, measure ≤ 54em |
| Wordmark, monogram | **Nunito 900** | Lowercase by default. Fixed artwork — ship as PNG |
| Graphic numerals, poster type | **Anton** | Scorelines, big numbers. Graphics only, never UI |

Rules: Montserrat is a titling face — never set a paragraph in it. Nunito is never a headline face. Anton never appears in interface chrome. No italics anywhere. Body copy never below 16px on web, 12pt in print.

---

## 3. Logo assets

All PNGs live in `brand-web/`. Use them unmodified. Transparent variants are for composing onto approved grounds.

### Master lockup — "THE UNDERDAWGS / sportscast"

**Default: `lockup-lower-gold.png`** — gold ground, lowercase wordmark.

| File | Use |
| --- | --- |
| `lockup-lower-gold.png` | **Default.** Banners, cover art, end cards |
| `lockup-lower-black.png` | Reversed on black |
| `lockup-lower-paper.png` | Black on white |
| `lockup-lower-transparent.png` | Compose onto an approved ground |
| `lockup-lower-cream.png`, `lockup-lower-hide.png` | Print, packaging |
| `lockup-*.png` (no `-lower-`) | Caps wordmark, same six grounds — news, fixtures, formal use |

Pick one case per surface. Never mix caps and lowercase in a single layout.

### Parent mark — "underdawgs" + mascot

**Default: `underdawgs-parent-lower-gold.png`.**

The parent mark is the master lockup's top line standing alone: the word reversed out of the black bar, mascot at the same size and overlap, the bar running behind its cheek. Do not rebuild it, rescale the mascot against the word, or strip the bar. Available as `underdawgs-parent-lower-{gold,black,paper,transparent,cream,hide}.png` and the caps set `underdawgs-parent-{...}.png`.

### Icons

Every icon ships in gold, black and white first; cream and hide follow for paper and merch.

| File | Use |
| --- | --- |
| `icon-monogram-ud-gold.png` | **Default monogram** — black `ud` on gold |
| `icon-monogram-ud-{black,white,cream,hide}.png` | Alternate grounds |
| `icon-monogram-UD-{gold,black,white}.png` | Caps monogram — formal and parent-brand use |
| `icon-app-{gold,black,white,cream}.png` | App icon, favicon source |
| `icon-avatar-{gold,black,white,hide}.png` | Round social avatar |
| `icon-mic-{gold,black,white,cream}.png` | Player, audio affordances, live states |

Match monogram case to the wordmark case in use.

### Clear space and minimum size

- Clear space: the cap height of SPORTSCAST on all four sides. Nothing enters it.
- Minimum width, full lockup: **220px** on screen, 40mm in print. Below that use the parent mark; below 64px use a monogram or the app icon.

### Never

- Recolour, outline, add a shadow to, rotate, skew or stretch any mark.
- Set the logotype in live text as a substitute for the PNG.
- Place a mark on a photograph without a solid gold or black plate behind it.
- Separate the mascot from the parent mark to use as a standalone character.

---

## 4. Component defaults

- **Buttons** — square corners, no radius. Primary: gold fill, black Montserrat 900 uppercase label, `letter-spacing:0.06em`. Secondary: 1px black border, transparent fill. Hover darkens gold to `#D89A10`; focus is `outline:2px solid var(--sc-black); outline-offset:2px`.
- **Cards** — no radius, no drop shadow. Hairline `--sc-rule` on paper/cream, or a flat gold/cream fill on black.
- **Tags and live badges** — gold on black or black on gold, Montserrat 900 uppercase, `padding:2px 8px`, no radius. One tag per graphic.
- **Thumbnails and share cards** — black ground, headline Montserrat 900 uppercase in paper white, one phrase highlighted with a gold block behind it (`box-decoration-break:clone` so multi-line highlights break correctly), mascot top right. Full gold ground with black type is the alternate when there is no photograph.
- **Lower thirds** — gold block, black type, hard edges.
- **Links** — `--sc-gold-deep`, hover `#5E430F`. Define both explicitly; never leave browser defaults.

---

## 5. Voice

Short declaratives. Sport-literate, never breathless. Name people and places specifically. No hype adjectives, no exclamation marks, no emoji.

---

## 6. Acceptance checklist

- [ ] Gold is the primary surface colour, not an accent sprinkle.
- [ ] Montserrat appears only in titles, subheads and labels; Nunito carries all body and UI; Anton only in graphics.
- [ ] No hex value outside the token list.
- [ ] Gold never carries body-size text; `--sc-gold-deep` does.
- [ ] Every mark is an unmodified PNG from `brand-web/`.
- [ ] The default marks are `lockup-lower-gold` and `underdawgs-parent-lower-gold`.
- [ ] Clear space and the 220px minimum are respected everywhere.
- [ ] Caps/lowercase treatment is consistent within each surface.
- [ ] Focus rings are defined on every interactive element.

---

## 7. What is in this folder

```
brand-web/
  tokens.css                    drop-in: colours, type roles, buttons, tags, sections
  README.md                     this file
  logo/                         master lockup — 12 files
    lockup-lower-gold.png       ← DEFAULT MARK
    lockup-lower-{black,paper,transparent,cream,hide}.png
    lockup-{gold,black,paper,transparent,cream,hide}.png   caps wordmark
  parent/                       Underdawgs parent mark — 12 files
    underdawgs-parent-lower-gold.png   ← DEFAULT PARENT MARK
    underdawgs-parent-lower-{black,paper,transparent,cream,hide}.png
    underdawgs-parent-{gold,black,paper,transparent,cream,hide}.png
  icon/                         20 files
    icon-monogram-ud-{gold,black,white,cream,hide}.png   ← ud-gold is DEFAULT
    icon-monogram-UD-{gold,black,white}.png
    icon-app-{gold,black,white,cream}.png
    icon-avatar-{gold,black,white,hide}.png              round, social
    icon-mic-{gold,black,white,cream}.png                player / audio / live
  favicon/                      favicon-{512,192,180,32,16}.png   from icon-app-gold
  social/                       og-gold-1200x630.png, og-black-1200x630.png
  art/                          mascot-transparent.png, mic-transparent.png
```

### Head block

```html
<link rel="icon" href="/brand/favicon/favicon-32.png" sizes="32x32">
<link rel="icon" href="/brand/favicon/favicon-192.png" sizes="192x192">
<link rel="apple-touch-icon" href="/brand/favicon/favicon-180.png">
<meta property="og:image" content="/brand/social/og-gold-1200x630.png">
<link rel="stylesheet" href="/brand/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&family=Nunito:wght@400;600;700;900&family=Anton&display=swap" rel="stylesheet">
```

### Notes for implementation

- Serve the PNGs as-is. Convert to WebP/AVIF at build time if the pipeline does that automatically — do not hand-edit or re-crop.
- The transparent lockups and `art/` files carry real alpha. Everything else is a flat coloured plate; use the plate that matches the section ground rather than compositing.
- Site header: `logo/lockup-lower-transparent.png` on a gold or black bar, height ~40px, flush left.
- Mobile header below 420px: `parent/underdawgs-parent-lower-transparent.png` or `icon/icon-monogram-ud-gold.png`.
- Square corners everywhere. `--sc-radius` is 0 and stays 0.
