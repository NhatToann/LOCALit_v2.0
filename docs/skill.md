# LOCALit AI Writing & Design Rules

> **Authoritative project-level skill** combining `web-ai-slop` (anti-defaults) and `aeo-geo-writing` (citation optimization) into a single rulebook tailored to LOCALit.
>
> Every AI-generated artifact (UI, copy, code, docs) MUST pass these rules before merge. This file lives at `docs/skill.md`; `docs/design.md` is the visual companion.

---

## 0. Mantras

### Anti-slop mantra
> **Avoid statistical averages. Make deliberate choices tailored to LOCALit, Da Nang tourists, Vietnamese context.**

### AEO/GEO mantra
> **Do not write generalities; write checkable facts. Be the single context-dense sentence that survives RAG retrieval and gets cited by name.**

### LOCALit-specific mantra
> **LOCALit is a marketplace for human travel experiences in one specific city. We are not Stripe. We are not Withlocals. We are a Da Nang product, with Vietnamese + English bilingual copy, Vietnamese diacritics rendered correctly, and operational density suited to a backoffice + a traveler front-end.**

---

## 1. Anti-slop rules (from `web-ai-slop`)

### 1.1 Banned visual patterns

- ❌ Bento grid of icon-in-rounded-square cards
- ❌ Glassmorphism (frosted glass, backdrop-blur cards)
- ❌ Glowing gradient blobs, aurora backgrounds, purple-to-pink radial blur
- ❌ Particle networks / floating dots with connecting lines
- ❌ Wavy or blob SVG section dividers
- ❌ Isometric 3D illustrations (laptops, rockets, people-at-desks)
- ❌ Border-radius 16px on cards / buttons / inputs / images (use 4px)
- ❌ Pill-shaped buttons (use 4px)
- ❌ High-contrast glow / accent shadow on primary CTA
- ❌ "Most Popular" highlighted tier in any pricing section
- ❌ Testimonial carousel with circular stock-photo avatars and "— J." generic quotes
- ❌ Floating device-mockup screenshots positioned at angle
- ❌ Decorative gradients added by default (gradients only when explicitly justified)

**LOCALit-specific:** We have real Da Nang photos. Use them. Never use abstract gradient hero.

### 1.2 Banned color patterns

- ❌ Purple/violet/indigo `#7c3aed` family as default
- ❌ Pure black `#000000` backgrounds (use `#0F0F0F`)
- ❌ Pure white `#FFFFFF` as page background (use `#FAFAF7`)
- ❌ Five or more accent colors
- ❌ Color choices without provenance (every color must trace to design.md Section 2)

### 1.3 Banned typography patterns

- ❌ Inter font (Poppins + Plus Jakarta Sans only — see design.md Section 3)
- ❌ Inter-only weights 400/600/700
- ❌ Default tracking on display headings (`letter-spacing: 0` on ≥30px text)
- ❌ `font-weight: 700` as the only emphasis tool
- ❌ All-caps labels as default emphasis
- ❌ Line-height not varied per context (body 1.6, display 1.1, captions 1.5)
- ❌ No display typeface for headlines
- ❌ Single font family used for everything (we have Plus Jakarta Sans for headings, JetBrains Mono for code)

### 1.4 Banned copy patterns

**Sentence-shape:**
- ❌ "In today's fast-paced/digital/ever-changing world..."
- ❌ "Unlock/Unleash/Elevate/Supercharge/Empower your [noun]"
- ❌ "Whether you're a tourist or a buddy..."
- ❌ "Say goodbye to [pain point]"
- ❌ "Built for teams of every size"
- ❌ Rule-of-three adjective stacks ("Fast. Secure. Reliable.")
- ❌ Negative parallelism ("It's not just X, it's Y")
- ❌ Em-dashes used as commas ("We don't just build software — we build the future")
- ❌ Sentence-initial "Additionally,", "Moreover,", "Furthermore,", "Consequently"
- ❌ Gerund + possessive noun bullets ("Streamline your workflows. Automate your pipelines.")

**Structural:**
- ❌ Generic page titles like "Home | LOCALit"
- ❌ Meta descriptions reading like brochures
- ❌ "Our Story" / "About Us" LinkedIn-style summaries
- ❌ Rhetorical question intros ("Ever wondered why...?")
- ❌ Vague section headers ("Features", "Solutions", "Why Us")
- ❌ Generic CTAs ("Get Started", "Learn More", "Try Free")
- ❌ Filler FAQ content answering invented setup questions
- ❌ Unattributed social proof ("Trusted by 500+ teams")
- ❌ Formulaic document endings with "Challenges" + "Future Prospects"

**Lexical:**
- ❌ Overused adjectives: intricate, vibrant, crucial, pivotal, paramount, essential, enduring, meticulous, profound
- ❌ Overused verbs: delve, harness, elevate, resonate, enhance, underscore, embark, foster, showcase, exemplify
- ❌ Overused nouns: tapestry, landscape, testament, interplay, offerings
- ❌ Overused transitions: moreover, furthermore, thus, consequently, "it's important to note"
- ❌ "Active social media presence" tic
- ❌ "I hope this helps!", "Of course!", "Let me know if you need anything else"
- ❌ Malformed heading hierarchy (H1 → H3 skip)

**LOCALit-specific copy bans:**
- ❌ Any phrase that works equally well if "LOCALit" is replaced with "Withlocals" or "Airbnb"
- ❌ Tourist/buddy marketing copy that doesn't name a specific Da Nang landmark
- ❌ References to "the platform" without context (we are the platform; name us)
- ❌ Generic photography metaphors ("memories to last a lifetime")

### 1.5 Banned HTML patterns

- ❌ Entire layouts from `<div>` and `<span>` (use `<main>`, `<nav>`, `<header>`, `<footer>`, `<article>`, `<section>`, `<aside>`, `<figure>`)
- ❌ `<br><br>` as paragraph separator (use `<p>`)
- ❌ Inline `style` attributes (use class-based styling)
- ❌ Images without `width` and `height` (causes CLS)
- ❌ Missing `<meta name="description">`, `<meta property="og:title">`, `<link rel="canonical">`
- ❌ `<title>` left as framework default ("React App", "Vite App")
- ❌ Non-descriptive link text ("click here", "read more", "learn more")
- ❌ Missing `<label>` on form inputs (placeholder-as-label is a fail)

### 1.6 Banned CSS patterns

- ❌ `transition: all 0.3s ease` on every element (specific easing per element)
- ❌ `!important` to override specificity
- ❌ Magic numbers (no relationship to spacing scale)
- ❌ `px` units for font sizes (use `rem`)
- ❌ `z-index: 9999` (use semantic z-index tokens)
- ❌ Media queries at arbitrary breakpoints (768px, 1024px — use content-driven)
- ❌ No `max-width` on body text (long lines are unreadable)
- ❌ Flexbox for 2D layouts (use Grid); Grid for 1D flow (use Flex)

### 1.7 Banned JavaScript patterns

- ❌ `console.log` in production
- ❌ Event listeners on DOM nodes inside loops (use delegation)
- ❌ `fetch` without `.catch()` or error state
- ❌ `useEffect` with empty deps `[]` as componentDidMount substitute when there are real deps
- ❌ `any` type everywhere in TypeScript
- ❌ No input sanitization on user content rendered to DOM (XSS)
- ❌ `setTimeout` as loading-state substitute

### 1.8 Banned performance patterns

- ❌ Unoptimized images (full-res PNG, no WebP, no `srcset`, no `loading="lazy"`)
- ❌ All JavaScript in single bundle (no code splitting)
- ❌ Third-party scripts synchronous in `<head>`
- ❌ No `font-display: swap` on web fonts
- ❌ Render-blocking CSS in `<head>` for non-critical styles
- ❌ All 18 weights of a variable font loaded "just in case"

### 1.9 Banned code patterns

- ❌ God components / god functions
- ❌ No error boundaries in React trees
- ❌ No env var validation on startup
- ❌ `git commit -m "fix"` or `git commit -m "update"`
- ❌ Dependencies pinned to `^major.minor.patch`
- ❌ No `.nvmrc` or `engines` field
- ❌ Tests that only test the happy path
- ❌ Copy-pasted code with slight variations across files
- ❌ Over-engineered abstractions for small projects
- ❌ **Scratch files left in the repo** (e.g. `check.html`, `scripts/check-*.mjs` were flagged in audit — delete or commit)
- ❌ Obvious comments (`// state for users`, `// fetch user data`)
- ❌ Generic variable names (`dataList`, `resultObj`, `isLoaded`)
- ❌ Unused imports (`import axios` if not used)

### 1.10 Banned UX patterns

- ❌ Every page follows identical section sequence (Hero → Logo → Features → How → Testimonial → Pricing → FAQ → CTA → Footer)
- ❌ "How It Works" with exactly 3 steps regardless of actual process
- ❌ Onboarding with mandatory progress bar and no skip option
- ❌ Empty states saying only "No items found" with no next step
- ❌ Error messages saying "Something went wrong" with no actionable next step
- ❌ Forms with no inline validation, all errors at top on submit
- ❌ Modal dialogs for trivially reversible actions
- ❌ Navigation mirroring company department structure instead of user mental model
- ❌ Breadcrumbs on shallow sites
- ❌ Every hover state is `opacity: 0.7` or color lightening
- ❌ Focus styles suppressed for aesthetics
- ❌ Scroll-triggered animations on every section
- ❌ Infinite scroll with no return-to-position
- ❌ Hamburger menus on tablet breakpoints where space exists
- ❌ Click targets smaller than 44×44px on mobile
- ❌ No loading states (spinner only)
- ❌ Tooltips as only way to access critical info

### 1.11 Banned accessibility patterns

- ❌ Text contrast not WCAG 2.1 AA verified (4.5:1 normal, 3:1 large)
- ❌ Images without `alt` text, or `alt` repeating filename
- ❌ Icon-only buttons without `aria-label`
- ❌ Form inputs without associated `<label>` (placeholder-as-label)
- ❌ `<div>` / `<span>` as interactive elements (no `role`, `tabindex`, keyboard handler)
- ❌ Heading levels skipped (H1 → H3)
- ❌ No "skip to main content" link
- ❌ Animations without `prefers-reduced-motion` query

---

## 2. AEO / GEO rules (from `aeo-geo-writing`)

### 2.1 Structural requirements

**Answer capsules:**
- Every H2 on content pages leads with a 40-60 word capsule answering the heading question directly
- No preamble ("In this section we will discuss...")
- Isolation test: if an AI extracted only this capsule and discarded the rest, would it still be a complete, correct, attributable claim? If not, rewrite.

**Schema:**
- FAQ blocks: `FAQPage` JSON-LD schema (highest leverage for Google AI Overviews)
- Data tables: semantic `<table>` not narrative text for comparisons
- Summary hook: 100-150 word summary paragraph before the very first H2
- Credibility signals: visible named author, "Last updated on [Date]" metadata

**FAQ & question logic:**
- Provide multiple formats: FAQ lists (ChatGPT/Google), How-To listicles (task assistants), Definition summaries (snippet panels)

**Multimodal:**
- Alt-text describes functional purpose, not just objects
- Bad: `alt="A graph showing sales"`
- Good: `alt="Line chart showing 42% decrease in checkout abandonment after integrating single-click checkout"`
- Surrounding text describes core metrics for retrieval bots

### 2.2 Copywriting rules

**E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness):**
- First-person experience verbs: "We audited...", "I tested...", "We measured..."
- Expert verification labels: "Expert-Verified by [Name]"
- No hedging: ban "we believe", "in our opinion", "we think", "potentially"
- Attributable sourcing: "According to Stack Overflow's 2025 Developer Survey, 76%..." (not "Many developers agree...")
- Concrete metrics: numbers, not adjectives ("42% decrease", not "significant increase")
- One claim per sentence: split compound sentences

**LOCALit-specific AEO targets:**

| Query type | Target format |
|---|---|
| "How much does a LOCALit buddy cost?" | FAQPage with exact price range + sample numbers |
| "Best buddy in Da Nang for [specialty]" | Buddy profile with AggregateRating + Place schema |
| "Is LOCALit safe?" | Homepage FAQ with verification methodology |
| "Da Nang tourist things to do" | Guide content with first-person verbs |
| "Vietnam travel buddy app" | Comparison table vs Withlocals, ToursByLocals |

### 2.3 Technical prerequisites

- **SSR critical copy:** Core claims server-rendered, not injected client-side
- **robots.txt:** Allow `GPTBot`, `ClaudeBot`, `Google-Extended`, `Bingbot`
- **llms.txt:** At `/public/llms.txt` — plain markdown dictionary of site structure
- **Bing index priority:** ChatGPT web search relies on Bing. Submit sitemap to Bing Webmaster Tools.

### 2.4 Platform targeting matrix

| Engine | Retrieval bias | LOCALit strategy |
|---|---|---|
| ChatGPT (Bing) | Verbatim list items, FAQ blocks, definitions | Highly structured bullets, clear H2s, FAQPage schema |
| Perplexity | Authoritative, fresh, multi-source | Original research, first-person verbs, dated posts |
| Google AI Overviews | Rich schema, definitions, visuals | FAQPage/HowTo schema, labeled diagrams, semantic tables |
| Claude | Multi-paragraph synthesis, deep reasoning | Exhaustive guides with reasoning, not just claims |

---

## 3. LOCALit-specific rules

### 3.1 Bilingual copy

- English is the primary UI language (per current Da Nang scope)
- Vietnamese translations allowed in tourist-facing copy when adding specificity ("Cơm gà" alongside "Chicken rice")
- All Vietnamese text must render diacritics correctly — test with strings containing ă, ắ, ằ, ẳ, ẵ, ặ, â, ấ, ầ, ẩ, ẫ, ậ, đ, ê, ế, ề, ể, ễ, ệ, ô, ố, ồ, ổ, ỗ, ộ, ơ, ớ, ờ, ở, ỡ, ợ, ư, ứ, ừ, ử, ữ, ự, ỳ, ý, ỷ, ỹ
- Currency: USD with locale-aware formatting (`Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`). Do not mix "X/giờ" (Vietnamese hour) with USD currency.

### 3.2 Da Nang specificity

Every marketplace reference should pass the "Da Nang or generic" test:
- ✅ "My Khe Beach is a 30-minute drive from most Da Nang buddy meeting points"
- ❌ "Beautiful beaches await you on your travels"

Named landmarks used in copy must be real Da Nang places:
- Marble Mountains (Ngũ Hành Sơn)
- Han River (Sông Hàn)
- Son Tra Peninsula
- Hoi An (45 min drive, often paired with Da Nang trips)
- Ba Na Hills
- Dragon Bridge
- My Khe Beach
- Linh Ung Pagoda
- Con Market
- Han Market

### 3.3 Role differentiation copy

- Tourist copy: planning, friendly, action-oriented ("Plan your trip", "Find a buddy for Saturday")
- Buddy copy: operational, professional, metrics-aware ("Reply within 1 hour", "Your rating this week")
- Never use the same hero metaphor for both roles

### 3.4 Trust signals (mandatory on buddy profiles)

- Verified badge (when KYC complete)
- Response time (avg over last 30 days)
- Review count + average rating
- Trips completed count
- Languages spoken
- Specialties (3-5 max)

### 3.5 Operational density (for buddy surfaces)

- Buddy dashboard: primary CTAs, earnings, pending request count, calendar preview, profile completeness %
- No "About Us" content on buddy backoffice — that's a tourist-facing surface
- Show metrics that matter for the buddy's business

### 3.6 Real photos over stock

- Use real Da Nang photos for hero, destination cards, trip backgrounds
- For buddy avatars: real photos > DiceBear initials > letter circle (fallback chain)
- For trip itineraries: encourage photo upload, show placeholder with intent-based alt-text

---

## 4. Self-check questions before merge (Section 9 of `web-ai-slop`)

Run these on every UI PR:

1. **Is this specific to LOCALit, Da Nang, Vietnamese context?** Could Withlocals copy this without it being obviously wrong? If yes, revise.

2. **Did I choose this because it's right, or because it was the first thing that came to mind?** The first instinct of a language model is the statistical average. The average is the slop.

3. **Is there a concrete, specific fact driving this choice?** A real measurement, a named constraint, a specific user need.

4. **Would a 40-year designer be embarrassed to ship this?**

5. **Have I said what this is NOT going to do?** Real professional output includes constraints, edge cases, non-goals.

6. **Is there anything in this output that exists only because I thought it was expected?**

## 5. AEO self-check questions (Section 5 of `aeo-geo-writing`)

1. **Answer capsule check:** Can the lead sentence of each H2 be read alone and still make sense?
2. **Attribution check:** Is there a checkable source, number, or name for every claim?
3. **No hedging check:** Removed "believe", "opinion", "think", "probably"?
4. **Formatting check:** Comparisons in `<table>`? FAQs in `FAQPage` schema?
5. **Technical check:** SSR'd, Bing-indexed?
6. **EEAT & visual check:** Alt-texts intent-based? First-person experience verbs?

---

## 6. Failure case studies

### Failure 1: Generic copy (fails Sections 1.4 + 2.2)
> ❌ "Whether you're a tourist seeking adventure or a buddy looking to share your love of Da Nang, LOCALit unlocks the power of authentic travel. Fast. Secure. Reliable. Discover real connections today."

Why it fails: Faux-inclusive opener, "unlocks" verb-of-vague-empowerment, rule-of-three stack, no specific Da Nang reference, no numbers, no FAQ schema.

### Failure 2: Hero with bento grid (fails Section 1.1 + 1.4)
> ❌ Hero centered with 2 pill CTAs ("Get Started" / "Learn More"), below it a 6-card bento grid: 🍜 Food, 📷 Photo, 🏛️ History, 🏖️ Beach, 🏔️ Nature, 🛍️ Shopping

Why it fails: Centered hero with empty 100vh (Section 1a), bento grid with emoji icons (Section 1a + 1c), "Get Started" / "Learn More" generic CTAs (Section 1.4).

### Failure 3: Glassmorphism cards (fails Section 1.1)
> ❌ BuddyCard with `background: rgba(255,255,255,0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.3)`

Why it fails: Glassmorphism is a default AI slop pattern (Section 1c). Trust signals need clarity, not blur.

### Failure 4: Hedged AEO copy (fails Section 2.2)
> ❌ "We believe that choosing the right buddy might potentially improve your Da Nang experience. Many users say it's important to find someone who shares your interests."

Why it fails: "We believe", "might potentially", "many users say" — all hedge words AI crawlers score as low-confidence.

---

## 7. The protocol (Section "The protocol" of `web-ai-slop`)

### Step 1: Anchor
Name the concrete thing this output is true to: LOCALit, Da Nang tourist, Vietnamese context. Pick 1-2 specific references (Withlocals operational density + Da Nang print tradition warmth).

### Step 2: Draft
Produce the real thing — copy, layout, component — from the anchor.

### Step 3: Filter
Check the draft against Sections 1 (anti-slop) + 2 (AEO) above. **2 or more matches in any single section = defaulted, not decided. Discard and rebuild from the anchor.**

### Step 4: Self-check
Run the questions in Sections 4 + 5 above. Any "no" or "I don't know" → revise before showing.

### Step 5: Record
Within one session, track anti-patterns you defaulted to. Across sessions, this file is the memory.

---

## Appendix: Quick ban-list (paste at top of any PR for reviewer)

If your PR introduces any of these, **expect a revision request**:

```diff
- "Unlock / Elevate / Supercharge" in any copy
- "Whether you're a tourist or a buddy..." opener
- Bento grid of icon-in-rounded-square cards
- Glassmorphism (`backdrop-filter: blur`)
- Glowing gradient blob in hero
- Border-radius 16px on cards/buttons
- Inter font family
- Emoji as icons (🌍, 📍, 💬, etc.)
- Generic CTAs ("Get Started", "Learn More")
- "I hope this helps" or "Of course!" in copy
- `transition: all 0.3s ease` blanket
- `console.log` in production code
- Pure black `#000000` or pure white `#FFFFFF` background
- `<div>` where `<main>`/`<nav>`/`<article>`/`<section>` would fit
- Image without `width`/`height` attributes
- Form input without associated `<label>`
- Scratch files (`check.html`, `scripts/test-*.mjs`) committed
- "We believe", "might potentially", "many users say" in AEO copy
- FAQ without FAQPage JSON-LD schema
```
