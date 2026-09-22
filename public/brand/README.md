# Underdawgs Rising & Sportscast — brand assets

Underdawgs Rising is the parent company. Sportscast is its media brand. This folder is the complete, current asset set — every PNG is final and unmodified; nothing needs re-drawing or re-cropping.

## Colour

```css
--sc-gold:      #F3B01C;  /* primary. logo grounds, blocks, tags */
--sc-gold-deep: #8A6110;  /* gold at body-text size, links */
--sc-charcoal:  #201C19;
--sc-paper:     #FFFFFF;
--sc-hide:      #B87848;  /* mascot warm tone, merch, paper */
--sc-cream:     #F5EAD7;  /* documents, packaging */
```

Gold is a flat 100% fill only — never a gradient or tint. Gold never carries body-size text; use gold-deep.

## Type

| Role | Family |
| --- | --- |
| Headlines, labels | Montserrat 900, uppercase |
| Body, UI | Nunito 400/600/700 |
| Wordmark, monogram | Nunito 900, **lowercase only** — fixed artwork, never live text |
| Graphic numerals | Anton — scores/posters only |

`"underdawgs"` is never set in uppercase, anywhere.

## Underdawgs Rising (parent)

- **Primary logo**: `parent/underdawgs-parent-lower-gold.png` — mascot + wordmark on a solid block.
- **Secondary logo**: `parent/underdawgs-parent-open-{charcoal,white,gold}.png` — no plate, drops onto any ground.
- **Monogram**: `monogram/monogram-ud-gold.png` — the "ud" mark, underscore-joined. Default icon/favicon source.
- **Mascot**: `art/mascot-transparent.png` — the brand identity mark. Always full colour; never recoloured or separated from context.
- **App/avatar icons**: `icon/icon-app-*.png`, `icon/icon-avatar-*.png`.

## Sportscast (media brand)

- **Primary lockup**: `logo/lockup-lower-gold.png` — "The underdawgs SPORTSCAST" + mic mark, exactly as shipped. Do not rebuild.
- **Secondary monogram**: `mic/mic-mark-gold.png` — the mic mark alone.

## Transparent / ink variants

Every mark that can sit on an arbitrary ground has a transparent PNG. Two kinds:

- **Full colour** (`*-lower-transparent.png`, `art/mascot-transparent.png`): use as-is, colours unchanged.
- **Flat ink** (`*-transparent-gold.png`, `*-transparent-charcoal.png`, `*-transparent-white.png` on the monogram and mic mark; `*-gold-transparent.png` / `*-white-transparent.png` on the parent logo and Sportscast lockup): a single ink colour on true transparency, for stamping onto photography or coloured grounds. On the parent logo and lockup, **the mascot keeps its full colour** — only the wordmark/block ink changes.

## Never

- Recolour, outline, shadow, rotate, skew or stretch any mark.
- Set the wordmark in live text instead of the PNG.
- Separate the mascot from the parent mark to use as a standalone character.
- Mix uppercase and lowercase treatments in one layout.

## Folder map

```
brand-web/
  tokens.css              drop-in colours, type roles, buttons
  art/                    mascot-transparent.png, mic-transparent.png
  parent/                 parent logo — block, open, transparent, ink variants
  logo/                   Sportscast lockup — grounds + transparent + ink variants
  monogram/                "ud" monogram — grounds + transparent ink variants
  mic/                    mic mark — grounds + transparent ink variants
  icon/                   icon-app-*, icon-avatar-*
  favicon/                favicon-{16,32,180,192,512}.png
  social/                 og-{gold,black}-1200x630.png
```

See `Brand Command Center.html` and `Brand Assets Review.html` (project root) for a visual reference of every mark.
