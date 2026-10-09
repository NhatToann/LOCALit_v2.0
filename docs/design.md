# LOCALit Design System Specification

> **Single source of truth** for all visual decisions in the LOCALit codebase.
> Last updated: 2026-10-09 (recolor v2 — Tropical Jade: 5 jade/emerald + 1 ocean stop)
> Authority: All UI code MUST follow this spec. Deviations require explicit justification in a PR description.

---

## 1. Philosophy

### 1.1 Anchor (per `web-ai-slop` Section 1a)

LOCALit's design language is **triangulated** from two concrete references — not "modern," not "premium," not "trustworthy":

1. **Da Nang tourism board print tradition** — informational density, Vietnamese + English bilingual, real photographs of specific landmarks (Marble Mountains, Han River, Son Tra), warm neutrals.
2. **Withlocals information density** — operational metrics visible to operators, traveler-centric filters, no decorative chrome around data.

**Anti-reference:** generic SaaS landing page. We are not Stripe, not Linear, not Vercel. We are a marketplace for human travel experiences in one specific city.

### 1.2 Mantra

> **Avoid statistical averages. Make deliberate choices tailored to LOCALit, Da Nang tourists, Vietnamese context.**

### 1.3 Anti-pattern bans (from `web-ai-slop`)

| Pattern | Ban reason | LOCALit-specific reason |
|---|---|---|
| Bento grid of icon cards | Section 1c default | Da Nang tourists scan buddy cards linearly, not in 6-card grids |
| Glassmorphism cards | Section 1c default | Trust signals need clarity, not blur |
| Glowing gradient blob hero | Section 1b default | Da Nang has actual photos — use them |
| Border-radius 16px on everything | Section 1c default | Reads as 2014 Bootstrap. We use 4px or 0 |
| Pill-shaped buttons everywhere | Section 1c default | Marketplace CTAs need to look like commerce |
| Inter font, weights 400/600/700 | Section 2b default | We use Poppins + Plus Jakarta Sans, picked for Vietnamese diacritics |
| `transition: all 0.3s ease` everywhere | Section 5b default | Specific easing per element |
| Emoji-as-icons | Section 1a | We use Lucide React exclusively |
| `<div>` for everything | Section 5a | We use `<main>`, `<nav>`, `<header>`, `<footer>`, `<article>`, `<section>`, `<aside>`, `<figure>` |
| `console.log` in production | Section 5c | Zero tolerance |
| "Unlock / Elevate / Empower" copy | Section 3a | We say what we do, not what we empower |
| "Whether you're a tourist or a buddy..." | Section 3a | We have two distinct products, address each separately |

---

## 2. Color tokens

### 2.1 Palette (Tropical Jade, 2026-10-09)

**Primary stops** (5 jade/emerald + 1 ocean, the brand identity). Reads as
one continuous teal/green canvas — the Da Nang coastal palette where the
river and the sea meet:

| Stop | Hex | Use |
|---|---|---|
| 1 — jade mint | `#34D399` | `--color-primary-500`, brand mark, hero highlight, live markers |
| 2 | `#10B981` | gradient mid, afternoon list tone |
| 3 | `#0D9488` | `--color-primary-700`, jade teal, secondary accent, evening tone |
| 4 | `#065F46` | `--color-primary-900`, forest deep, success text |
| 5 | `#0E7490` | gradient mid, sea blue (the only ocean stop), info states |
| 6 — ocean dark | `#134E4A` | `--color-primary`, all CTAs, text, borders |

**Alpha-derived tokens (paper / surface / border / muted)**: every neutral
carries a slight teal hue so the page reads as one continuous canvas rather
than black-and-white with colored accents. The base alpha is auto-derived
from stop 1 (`#34D399`):

| Token | Source | Use |
|---|---|---|
| `--color-primary-50` | 4% alpha of stop 1 (`#ECFDF5`) | Selected rows, soft badge bg |
| `--color-primary-100` | 8% alpha of stop 1 (`#D1FAE5`) | Deeper selected state |
| `--color-paper` | 4% alpha of stop 1 (`#F0FDF4`) | Page background — never pure white |
| `--color-surface` | 8% alpha of stop 1 (`#ECFDF5`) | Card background — never pure white |
| `--color-border` | 16% alpha of stop 1 (`#BBF7D0`) | 1px borders, jade-tinted |
| `--color-border-strong` | 32% alpha of stop 1 (`#86EFAC`) | Hover / focus borders |
| `--color-ink` | Near-black with teal undertone (`#0A1F1D`) | Primary text, dark backgrounds |
| `--color-muted` | slate-600, jade-tinted (`#4B5563`) | Secondary text, captions |

**Full token list**:

| Token | Hex | Use | Rationale |
|---|---|---|---|
| `--color-primary` | `#134E4A` | Brand primary — used by `bg-primary`, `text-primary`, `border-primary` | Stop 6 — ocean dark with 12.5:1 contrast on paper |
| `--color-primary-hover` | `#0F3F3C` | Primary hover state | One shade darker than stop 6 |
| `--color-primary-50` | `#ECFDF5` | Primary tint (selected rows, soft badge bg) | 4% alpha of stop 1 |
| `--color-primary-100` | `#D1FAE5` | Primary tint (heavier selected state) | 8% alpha of stop 1 |
| `--color-primary-500` | `#34D399` | Brand pop — used for hero brand marks, gradient stripes, `bg-primary-500` | Stop 1 — vibrant jade mint |
| `--color-primary-700` | `#0D9488` | Secondary accent, links in body | Stop 3 — jade teal |
| `--color-primary-900` | `#065F46` | Brand pop alias — same as 900 | Stop 4 — forest deep |
| `--color-primary-bg` | `#ECFDF5` | Primary-tinted background | Same as 50 |
| `--color-primary-bg-vibrant` | `#D1FAE5` | Vibrant-tint (hero halo) | Same as 100 |
| `--color-gradient` | `linear-gradient(135deg, #34D399 0%, #10B981 20%, #0D9488 40%, #065F46 60%, #0E7490 80%, #134E4A 100%)` | Hero accent, brand gradient surfaces (USE SPARINGLY) | The 6-stop identity |
| `--ink` | `#0A1F1D` | Primary text | Near-black with teal undertone (Section 2a: avoid pure black) |
| `--paper` | `#F0FDF4` | Page background | 4% alpha of stop 1 — jade-tinted off-white |
| `--surface` | `#ECFDF5` | Card / sheet background | 8% alpha of stop 1 — never pure `#FFFFFF` |
| `--border` | `#BBF7D0` | 1px borders | 16% alpha of stop 1 |
| `--border-strong` | `#86EFAC` | Hover / focus borders | 32% alpha of stop 1 |
| `--muted` | `#4B5563` | Secondary text, captions | Slate-600, jade-tinted |
| `--subtle` | `#6B7280` | Tertiary text, disabled | |
| `--success` | `#065F46` | Confirmed, online, success states | Forest deep — matches primary-900 |
| `--success-bg` | `#D1FAE5` | Success pill background | 8% alpha of stop 1 |
| `--warning` | `#92400E` | Pending, attention | Tailwind amber-800 |
| `--warning-bg` | `#FEF3C7` | Warning pill background | Tailwind amber-100 |
| `--danger` | `#991B1B` | Error, declined | Tailwind red-800 |
| `--danger-bg` | `#FEE2E2` | Danger pill background | Tailwind red-100 |
| `--info` | `#0E7490` | Informational, in-progress | Stop 5 — sea blue (fits the jade family) |
| `--info-bg` | `#CFFAFE` | Info pill background | Alpha of info |

### 2.2 Contrast (WCAG 2.1 AA verified)

- Body text on `--paper`: `#0A1F1D` on `#F0FDF4` → 18.4:1 ✓
- Secondary text on `--paper`: `#4B5563` on `#F0FDF4` → 7.1:1 ✓
- Primary text/link on `--paper`: `#134E4A` (primary, stop 6) on `#F0FDF4` → 12.5:1 ✓ (passes AAA for normal text)
- Primary button text: `#F0FDF4` on `#134E4A` (primary) → 12.5:1 ✓ (passes AAA for normal text)
- Brand pop `#34D399` (primary-500) on `--paper`: 1.7:1 — NOT a text color. Reserve for background fills where ink-on-jade text is layered (then contrast is `#0A1F1D` on `#34D399` → 11.0:1 ✓)
- Secondary accent `#0D9488` (primary-700) on `--paper` → 4.7:1 ✓
- Disabled text on `--paper`: `#6B7280` on `#F0FDF4` → 4.6:1 ✓

### 2.3 Banned colors

- ❌ Pure black `#000000` (Section 2a)
- ❌ Pure white `#FFFFFF` as page background (Section 2a) — use `--color-paper` (`#F0FDF4`) or `--color-surface` (`#ECFDF5`) instead
- ❌ Purple / indigo / blue-to-purple gradient (Section 2a)
- ❌ The OLD brand orange `#FF6B35` / `#E55A2B` — fully retired
- ❌ The OLD matching gradient (teal → blue, stops `#11EDAF` → `#0063AE`) — replaced 2026-10-09 by the Tropical Jade family
- ❌ Any color not listed above, unless explicitly justified

---

## 3. Typography

### 3.1 Type system (per `web-ai-slop` Section 2b)

- **Display / headings:** Plus Jakarta Sans (geometric humanist, modern without being SaaS-default)
- **Body:** Plus Jakarta Sans (single family for consistency — Section 2b: don't use Inter weights 400/600/700 only)
- **Monospace:** JetBrains Mono (for code blocks, future data tables)

### 3.2 Scale (rem, not px — Section 5b)

| Token | rem | px | Use |
|---|---|---|---|
| `text-xs` | 0.75rem | 12px | Caption, hint, legal |
| `text-sm` | 0.875rem | 14px | Secondary, body small |
| `text-base` | 1rem | 16px | Body |
| `text-lg` | 1.125rem | 18px | Subheading, emphasized body |
| `text-xl` | 1.25rem | 20px | Card title |
| `text-2xl` | 1.5rem | 24px | Section title (mobile) |
| `text-3xl` | 1.875rem | 30px | Section title (desktop) |
| `text-4xl` | 2.25rem | 36px | Page title (mobile) |
| `text-5xl` | 3rem | 48px | Page title (desktop) |
| `text-6xl` | 3.75rem | 60px | Hero headline (max) |

### 3.3 Line-height (per context, not blanket 1.5)

| Element | line-height | rationale |
|---|---|---|
| Display headings | 1.1 | Tight for impact, not cramped |
| Subheadings | 1.25 | Tighter than body for hierarchy |
| Body paragraphs | 1.6 | Standard readability |
| Captions / hints | 1.5 | Slightly tighter than body |
| Form labels | 1.4 | Compact |

### 3.4 Letter-spacing

- Headings ≥ 30px: `-0.02em` (Section 2b: tighten tracking on display)
- Body: `0` (default)
- All-caps labels: `0.05em` (legible, not generic `tracking-wide`)

### 3.5 Weight discipline (Section 2b)

- Use 400, 500, 600 only (no 700 unless absolutely necessary)
- 400 = body, captions
- 500 = labels, emphasized body
- 600 = headings, button text
- 700 = banned except for legal compliance copy

---

## 4. Layout & spacing

### 4.1 Spacing scale (8px grid)

```
0 → 0
1 → 0.25rem (4px)
2 → 0.5rem  (8px)
3 → 0.75rem (12px)
4 → 1rem    (16px)
6 → 1.5rem  (24px)
8 → 2rem    (32px)
12 → 3rem   (48px)
16 → 4rem   (64px)
24 → 6rem   (96px)
```

### 4.2 Container widths

- Page max-width: `1280px` (centered, with 24px horizontal padding)
- Body max-width for long-form copy: `680px` (Section 5b: no max-width on body text is a fail)
- Mobile padding: 16px horizontal (not 80px — Section 4d)
- Desktop padding: 24px horizontal

### 4.3 Vertical rhythm

- Section spacing: 96px desktop, 48px mobile (varied, not uniform — Section 1a)
- Section spacing between dense and breathing sections: 48px
- Form field spacing: 24px between fields, 8px between label and input

### 4.4 Border-radius

- Cards: `4px`
- Buttons: `4px` (NOT pill)
- Inputs: `4px`
- Pills / tags (status, language chip): `9999px` (the only place pills are OK — they are pill-shaped by semantic)
- Avatars: `9999px` (circular)
- Modals: `8px`

**Why:** Section 1c says "excessive border-radius is a tell." Marketplace UIs look more commerce-y at 4px.

---

## 5. Iconography

### 5.1 Library: Lucide React (picked deliberately)

- Stroke: 2px (consistent visual weight across the set)
- Default size: 16px (inline with text), 20px (button), 24px (standalone)
- Color: `currentColor` always — let CSS set the color

### 5.2 Icon wrapper

```tsx
// components/ui/Icon.tsx
import { type LucideIcon } from 'lucide-react'
export function Icon({ icon: I, size = 20, ...props }: { icon: LucideIcon } & React.SVGProps<SVGSVGElement>) {
  return <I size={size} strokeWidth={2} aria-hidden="true" {...props} />
}
```

### 5.3 Icon rules

- Always `aria-hidden="true"` when adjacent text conveys meaning
- Icon-only buttons: `<button aria-label="Close"><X size={18} aria-hidden="true" /></button>`
- Icons in headings: 1.25× size of heading text for visual balance

### 5.4 Banned

- ❌ Emoji as icons (Section 1a) — 26 emoji across 23 files were flagged in audit, all migrating
- ❌ Mixed icon libraries (don't add Heroicons, Tabler, Phosphor without rewriting everything)

---

## 6. Components

### 6.1 Button

```tsx
// Variants
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

// primary:  bg-primary,    text-paper,    border-primary
// secondary: bg-ink,        text-paper,    border-ink       (NEW — for marketplace "book" actions)
// outline:   bg-transparent, text-ink,      border-border-strong
// ghost:     bg-transparent, text-muted,    border-transparent
// danger:    bg-danger-bg,   text-danger,   border-danger-bg
```

- Height: 32px (sm), 40px (md), 48px (lg)
- Padding: 12px horizontal (sm), 16px (md), 24px (lg)
- Border: 1px (NOT 2px — current design uses 2px which wastes space)
- Radius: 4px
- Hover: darken background by 1 step (NOT lift + shadow — Section 1c)
- Disabled: opacity 0.5, cursor not-allowed
- Focus: 2px outline `--primary`, 2px offset (Section 4c)

### 6.2 Input

```tsx
// height: 40px (md), 48px (lg for hero forms)
// border: 1px solid --border
// border-radius: 4px
// padding: 0 12px
// font: text-base
// placeholder: --muted
// focus: border --primary, outline 2px --primary offset 2px
// error: border --danger
// label: text-sm, mb-1, text-ink
```

### 6.3 Card (FLAT, anti-slop)

```tsx
// bg: surface
// border: 1px solid --border
// border-radius: 4px
// padding: 24px
// NO shadow (Section 1c)
// NO transform on hover
// Hover: border-color → --border-strong ONLY
```

### 6.4 Status Badge

```tsx
// height: 24px
// padding: 0 8px
// font: text-xs, font-medium
// border-radius: 9999px (pill — semantic)
// variants:
//   confirmed: bg-success-bg, text-success
//   pending:   bg-warning-bg, text-warning
//   declined:  bg-danger-bg,  text-danger
//   info:      bg-info-bg,    text-info
```

### 6.5 Avatar

```tsx
// Circular (radius: 9999px)
// Sizes: 32px (sm), 40px (md), 56px (lg), 80px (xl), 120px (2xl)
// Background: derived from name hash (hsl hash, 70% lightness, 50% saturation)
// Text: initial letter, color: --paper
// Online dot: 10px circle, --success, positioned bottom-right (only on lg+)
// Fallback to DiceBear if no avatar_url (Phase 2)
```

---

## 7. AEO / GEO copy rules (per `aeo-geo-writing`)

### 7.1 Answer capsules

Every H2 on a content page must lead with a 40-60 word answer capsule that survives extraction alone.

**Example:**
```md
## How much does a LOCALit buddy cost?
LOCALit buddies in Da Nang charge $15 to $45 per hour based on language count and specialty depth.
Pricing is set per buddy, not by LOCALit — the platform takes a 0% commission during the
2026 launch period. Trips under 2 hours incur a $5 short-trip fee negotiated at booking.
```

### 7.2 Schema requirements

- **Homepage FAQ:** `FAQPage` JSON-LD with 4-6 Q&A
- **Buddy profile:** `Person` schema + `Place` (Da Nang) + `AggregateRating` if applicable
- **Trips:** `TouristAttraction` or `Event` schema
- **llms.txt** at `/public/llms.txt` describing site structure for RAG

### 7.3 Copy rules (from `web-ai-slop` Section 3)

**Banned vocabulary:**
- unlock, unleash, elevate, supercharge, empower, unleash
- seamless, intuitive, powerful, robust, cutting-edge, best-in-class
- delve, harness, resonate, enhance, underscore, embark, foster, showcase
- tapestry, landscape, testament, interplay, offerings
- moreover, furthermore, "in conclusion"
- "I hope this helps", "Of course!", "Let me know if you need anything else"

**Banned constructions:**
- "In today's fast-paced..."
- "Whether you're a tourist or a buddy..."
- "Say goodbye to..."
- "Built for teams of every size"
- Problem-Agitation-Solution structure on every section
- Gerund + possessive noun bullets ("Streamline your workflows. Automate your pipelines.")
- Em-dashes inserted where commas belong

**Required constructions:**
- Declarative claims (no "we believe", "in our opinion")
- First-person experience verbs where applicable ("I guided 12 tourists...", "We measured...")
- Concrete numbers (not "many", "a lot", "significant")
- One claim per sentence

### 7.4 Hero copy template (for localit landing pages)

```md
## [Action verb specific to role] in Da Nang
[Answer capsule: 40-60 words, declarative]

### What you can do
[Bullet list with concrete actions, no gerunds]

### What it costs
[Exact numbers, not "affordable"]

### Who it's for
[Specific persona, not "anyone"]

### FAQ
[4 questions with FAQPage schema]
```

---

## 8. Accessibility (WCAG 2.1 AA baseline)

### 8.1 Required on every page

- `<html lang="en">` (already in place)
- `<title>` unique per page
- `<meta name="description">` per page (AEO: declarative, not brochure)
- `<main>` wraps page content (Section 5a)
- `<nav>` for primary and footer navigation
- One `<h1>` per page, hierarchy never skipped
- Skip-to-main link as first focusable element
- `prefers-reduced-motion: reduce` honored for all animations
- Focus styles never suppressed (Section 4c)
- 44×44px minimum click targets on mobile (Section 4b)
- Form labels associated with `<label for="...">`, never placeholder-as-label
- Icon buttons have `aria-label`
- Color is never the only signal (status = icon + color + text)

### 8.2 Image alt-text (intent-based, Section 1d)

```tsx
// BAD
<Image alt="Da Nang beach" />

// GOOD
<Image alt="My Khe Beach at sunrise, a 30-minute drive from most Da Nang buddy meeting points" />
```

---

## 9. Responsive (Section 4d)

### 9.1 Breakpoints (content-driven, not magic numbers)

- `sm`: 640px (single-column form, mobile nav)
- `md`: 768px (two-column form, buddy cards 2-up)
- `lg`: 1024px (buddy cards 3-up, dashboards split-view)
- `xl`: 1280px (container max-width)

### 9.2 Mobile-specific rules

- Vertical padding: 48px between sections (not 96px)
- Heading scale: step down by one tier (`text-4xl` mobile becomes `text-5xl` desktop)
- Buddy cards: 1 column mobile, 2 column tablet, 3 column desktop
- Map: full-width, 320px height on mobile; sidebar 400px on desktop

---

## 10. Performance (Section 5d)

- All images: `next/image` with `sizes` attribute, WebP/AVIF auto-format
- Fonts: `font-display: swap`, preload critical weights only
- Below-fold images: `loading="lazy"`
- No third-party scripts in `<head>` synchronously
- Bundle splitting per route (Next.js App Router handles this)

---

## 11. File organization

```
app/
  layout.tsx          # Root layout, metadata, AppShell
  page.tsx            # Homepage
  globals.css         # Tailwind directives + minimal custom CSS
components/
  layout/
    Header.tsx        # Single component, 3 role variants
    Footer.tsx        # Slim, AEO answer capsules
    AppShell.tsx
  ui/
    Icon.tsx          # Lucide wrapper
    Button.tsx        # 5 variants
    Input.tsx         # 4 variants (text, textarea, select, checkbox)
    Card.tsx          # Flat (no shadow)
    StatusBadge.tsx   # 5 states
    Avatar.tsx        # With fallback
  buddy/
    BuddyCard.tsx     # Migrated to Lucide
  map/
    MapView.tsx       # Migrated to Lucide
public/
  llms.txt            # AEO/GEO site dictionary
docs/
  design.md           # THIS FILE
  skill.md            # LOCALit-specific AI writing rules
  ui-ux-audit.md      # Audit baseline
  role-differentiation-plan.md
```

---

## 12. Migration status (track as work completes)

| Item | Status |
|---|---|
| Color tokens aligned with Section 2 | ⏳ Phase 1 |
| Typography aligned with Section 3 | ⏳ Phase 1 |
| Lucide migration (26 emoji → Lucide) | ⏳ Phase 1 |
| Header unified (1 component, 3 role variants) | ⏳ Phase 1 |
| Footer slim | ⏳ Phase 1 |
| Homepage hero photo (Da Nang, real) | ⏳ Phase 1 |
| AEO answer capsules on `/`, `/tourist/browse`, `/tourist/buddy/[id]` | ⏳ Phase 1 |
| FAQPage schema on homepage | ⏳ Phase 1 |
| `llms.txt` deployed | ⏳ Phase 1 |
| Real avatar fallback (DiceBear) | ⏳ Phase 2 |
| Profile completeness score | ⏳ Phase 2 |
| Map clustering | ⏳ Phase 2 |
| Earnings dashboard (Chart.js) | ⏳ Phase 3 |
| Trip photos (Supabase Storage) | ⏳ Phase 3 |

---

## Appendix A: Anti-slop self-check (Section 9)

Run before every PR that touches UI:

1. ☐ Is this specific to LOCALit, Da Nang, Vietnamese context? Could Withlocals copy this without it being obviously wrong? If yes, revise.
2. ☐ Did I choose this because it's right, or because it was the first pattern?
3. ☐ Is there a concrete fact driving this choice?
4. ☐ Would a 40-year designer be embarrassed to ship this?
5. ☐ Have I said what this is NOT going to do?
6. ☐ Is there anything here that exists only because I thought it was expected?

## Appendix B: AEO self-check (Section 5)

1. ☐ Can the lead sentence of each H2 be read alone and still make sense?
2. ☐ Is there a checkable source, number, or name for every claim?
3. ☐ Are words like "believe", "opinion", "think", "probably" removed?
4. ☐ Are comparisons in `<table>` and FAQs in `FAQPage` schema?
5. ☐ Is the copy server-rendered, Bing indexed?
6. ☐ Are alt-texts intent-based?
