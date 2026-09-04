# Landing page image slots

The landing page (`web/components/landing/landing.tsx`) has two painted-plate
slots, both generated on 2026-09-04 and 2026-09-05 from the prompts below and
stored in `web/public/landing/`. The constants at the top of the file point at
them. To replace one, regenerate from its prompt and overwrite the file. The
social preview (section 3) is still open.

Keep the auth plate as the style reference in every prompt. What makes it work:
gouache on paper, warm olive and moss greens, a hazy ochre sky, and the left
edge dissolving into blank cream paper so the painting reads as part of the
page rather than a photo pasted onto it.

## 1. Hero plate

| | |
|---|---|
| Constant | `HERO_PLATE` |
| File | `web/public/landing/hero-plate.jpg` |
| Size | 2400 × 1600, landscape |
| Crop used | `object-cover`, focal point around 35% from the top |
| Where it shows | Right half of the hero on desktop, a short band behind the cards on mobile |

Prompt:

> A misty pine forest at dusk painted in soft gouache on cream paper. Warm olive
> and moss greens, a hazy ochre sky, a faint orange glow low on the horizon.
> The forest fills the right two thirds; the left third dissolves into blank
> warm cream paper (#F8F6F1) with a soft, torn-edge wash, no hard line. Paper
> grain visible. Matte, muted, no people, no buildings, no text. Landscape
> 3:2. Same palette and handling as the reference image.

Attach `auth-panel-a.jpg` as the reference. Reject any result with a saturated
sky, a visible sun disc, or a straight vertical fade; the fade has to look
painted.

## 2. Closing plate

| | |
|---|---|
| Constant | `CLOSING_PLATE` |
| File | `web/public/landing/closing-plate.jpg` |
| Size | 2400 × 1200, landscape |
| Crop used | `object-cover`, focal point around 70% from the top |
| Where it shows | Right half of the "Start remembering" section |

Prompt:

> The same misty pine forest at first light, painted in gouache on cream paper.
> Fog lifting off the treetops, a pale yellow-green sky, cooler and lighter
> than dusk. Trees fill the right two thirds and the lower edge; the left third
> dissolves into blank warm cream paper (#F8F6F1) with a soft painted fade.
> Paper grain visible. Matte, muted, no people, no text. Landscape 2:1. Same
> palette and handling as the reference image.

## 3. Social preview

Optional. 1200 × 630, the hero plate cropped to the right with the wordmark on
the paper side. Wire it with `openGraph.images` in `web/app/layout.tsx` once it
exists.

## What not to generate

No product screenshots, no device frames, no 3D renders, no illustrations of
people in meetings. The UI on the page is rendered from the product's own
components, and DESIGN.md §2 fences texture to surfaces with nothing to read.
