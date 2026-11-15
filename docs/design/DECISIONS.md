# T3 Code design decisions (Scar, newest first)

- 2026-11-14: "dim the thing more 50% [...] I can't see the text well [...] like a foggy translucent thing" -> Ken halved (body .36, light 12-15%) + frosted fog on the chat scroller (rgba(22,22,22,.30), blur 2.5px).
- 2026-11-14: "zcode theme was good like left side menu" -> theme colors = old fork Z Code look (dd30cc13d0): charcoal sidebar/chrome #303030, main panel #161616, cards #1F1F1F, popovers #2A2A2A, text #E6E6E6, muted #8F8F8F, neutral controls, color only for status. Sidebar needs CSS (`[data-slot=sidebar-inner]` bg) because T3 draws it as glass.

- 2026-11-14: A2 "looks really, really good" -> **dim Ken ~20%, keep all detail** (body 0.9->0.72, light 36%->29%, breathe 24-30%).

- 2026-11-14: **Approved World A2** (Shadow + detailed Ken: dark @ body, bright chains/grill flicker, 36% light). Build it.

- 2026-11-14: Picked **World A · Shadow** (likes the grey colors). Ken ASCII must be **far more detailed / high quality**, dense @-style glyphs ("it's so not detailed, bro"). Detail = 130-160 cols + long ink-sorted ramp.

- 2026-11-14: Ken Carson shows as a **moving ASCII version** of the GIF (real GIF can't fit a T3 theme: 50,000-character cap, outside links blocked).
- 2026-11-14: New look = **ASCII style, black and white, calm**. Ken Carson GIF (giphy ykb8uKU1OHL9RwnfYy) "running in the background", faint enough that code stays readable; "make it a lot better" if there's a way.
- 2026-11-14: Built as an official T3 theme (colors + theme CSS), not a fork. Stays on the official nightly.
- 2026-11-02 (Checklist tab, still true): likes calm dark rows, grouping headers that carry meaning, color only in tiny status icons, no big colored blocks (Linear, Craft). Liked the Z Code look on T3 and project logos/tints on rows.
