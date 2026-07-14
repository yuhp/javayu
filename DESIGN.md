# DESIGN.md - javayu.com

## 1. Objective

javayu.com is a bilingual personal notebook for technical ideas, working notes, and durable explanations. It should feel calm, precise, and human: visitors can immediately find the newest writing, switch languages without losing context, and read for a long time without visual fatigue.

## 2. Product Context

- **What the product does:** Publishes personal essays and notes in Chinese and English.
- **Who it's for:** Developers and curious readers who prefer clear, thoughtful long-form writing over a feed-like experience.
- **Adjacent brands (feel like these):** Simon Willison's weblog, Dan Luu, Julia Evans' writing.
- **Distant brand (do not feel like this):** A startup landing page, because the writing rather than conversion is the product.
- **Cultural register:** Technical and reflective; confident without sounding promotional.

## 3. Visual Foundations

### 3a. Color

- **Neutral scale:** Light `[--paper: #f7f5ef, --surface: #fffdf8, --ink: #1d2733, --muted: #64707c, --rule: #d8d4cb]`; dark `[--paper: #17212b, --surface: #202c38, --ink: #e9e7df, --muted: #adb7c0, --rule: #40505e]`.
- **Accent(s):** Light `[--link: #185b9d, --signal: #bb4b2c]`; dark `[--link: #78b7ed, --signal: #e28968]`.
- **Semantic:** `[--success: #2d6a4f, --warning: #9a6700, --error: #b42318]`
- **Usage rules:** Paper is the site background; cobalt is only for links, focus, and the active language. Signal red is reserved for small metadata marks. The initial theme follows the operating system; an explicit header choice persists for subsequent visits.

### 3b. Typography

- **Display face:** `Iowan Old Style, Palatino Linotype, Book Antiqua, Palatino, serif` at 600.
- **Body face:** `Avenir Next, PingFang SC, Hiragino Sans GB, Segoe UI, sans-serif` at 400 and 600.
- **Fallback stack:** `Georgia, Times New Roman, serif` for display and `system-ui, sans-serif` for body.
- **Type scale:** `12 / 14 / 16 / 18 / 24 / 32 / 48`.
- **Weight discipline:** Use 600 for headings and navigation, 400 for prose; do not use extra-bold display text.

### 3c. Spacing & rhythm

- **Base unit:** `4px`.
- **Spacing scale:** `4, 8, 12, 16, 24, 32, 48, 64, 96px`.
- **What "generous" whitespace means in numbers:** Technical article prose is 820px wide, with a 920px article frame for metadata and comments; article sections receive at least 32px of separation.

### 3d. Component seeds

- **Button:** Text links only; the language switcher is a compact segmented text control.
- **Card / container:** No raised cards. Entries are separated by hairline rules and generous vertical spacing.
- **Iconography:** No decorative icons; typographic markers carry hierarchy.
- **Metadata:** Dates, reading time, and tags use a compact monospace style.

## 4. Accessibility

- **Text contrast:** Body text meets 4.5:1 minimum; interactive states meet 3:1 minimum.
- **Motion:** No essential animation; transitions disable under reduced motion.
- **Focus indicators:** A 2px cobalt outline with 3px offset. The theme control exposes its current pressed state and the target theme in its accessible name.
- **Alt text policy:** Decorative rules have no alternative text; informational images describe the information they add.
- **Language:** Each page declares its content language and every language switch control is named in its target language.

## 5. Voice & Tone

- **Register:** Conversational technical writing.
- **Sentence rhythm:** Mostly short and direct, with longer sentences only for explanation.
- **Words this brand uses:** notes, write, explore, archive.
- **Words this brand refuses:** seamless, unlock, elevate, journey, world-class.
- **Address:** The reader is addressed as "you" only when direct instruction makes the text clearer.

## 6. Implementation Practices

- **Token format:** CSS custom properties defined in the base layout.
- **Component library convention:** Small bespoke Astro components.
- **Image treatment rules:** No stock imagery or decorative hero art. Diagrams belong in the article body when they explain content.
- **Grid system:** One wide site column that contracts to a mobile reading column.
- **Motion rules:** Color and underline transitions only, 160ms ease-out, with a reduced-motion override. Theme changes update Giscus with its iframe configuration message.

## 7. Anti-Patterns

- **No gradient hero.** The site's identity comes from editorial rhythm, not atmospheric decoration.
- **No feature-card grid.** A chronological writing index should not look like product marketing.
- **No decorative emoji.** They undermine the restrained technical register.
- **No oversized calls to action.** Reading and navigating need equal visual weight.
- **No generic productivity copy.** Navigation and headings state exactly what the reader will find.

## 8. Decision-Making

1. **Reading clarity.** Preserve a comfortable line length and clear hierarchy before adding visual novelty.
2. **Content truth.** Use visual structure only when it reflects a real distinction in the writing.
3. **Bilingual parity.** Chinese and English pages receive equivalent structure and navigation.
4. **Low maintenance.** Prefer static Astro primitives and content collections over runtime client state.

## 9. Workflow

1. Add a Markdown file under the appropriate language directory in `src/content/posts`.
2. Provide title, description, date, tags, and optional translation slug in frontmatter.
3. Write the article with semantic Markdown headings.
4. Verify the corresponding `/zh/posts/...` or `/en/posts/...` route locally.
5. Add a translation counterpart when available and link both through `translationSlug`.
6. Build before deployment.
7. Set the Giscus public environment variables in Cloudflare Pages before enabling production comments.
