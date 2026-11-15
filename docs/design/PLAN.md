# T3 Code theme: plan

**Goal (Scar's words, 2026-11-14):** "I really would like something [ASCII] sort of style [...] I want something calm in the background possibly something like Ken Carson running in the background like a GIF [...] make sure the theme actually matches the opacity of it. I don't want it to be too high [...] because I still want to see the code. It's like black and white [...] if there's a way you can make it a lot better basically."

**Job of the look:** Scar works in T3 all day (chat with agents, read code, diffs, terminal). The look must feel like his own space, calm, and never make text or code harder to read.

**What a theme can change (hard limits):**

- 30+ color roles (canvas, chrome, toolbar, surface, text, accent, border, error/warning/success, terminal colors…), light and/or dark variant.
- Theme CSS up to 50,000 characters, only on the safe hooks in `~/.claude/design-work/t3code/theme-hooks.txt` (sidebar, thread rows, chat header, chat area, messages, code blocks, composer, thread details card, terminal drawer, settings page…).
- No outside files: no remote images or fonts. Only `data:` URLs (small) and system fonts (Consolas, Cascadia Mono/Code, Segoe UI Variable are on the PC).
- Animation: CSS @keyframes. The Ken Carson loop is turned into ASCII frames (`gif/ascii64.json`, 24 frames of 64x32; budget ~12-16 frames at that size, or fewer at bigger size).

**Background asset:** `gif/ken.gif` (480x480, 96 frames, 15 fps, grainy black silhouette, sparkling chains + grill on grey grain). ASCII preview: `gif/ascii64-preview.png`. Converter: `tools/ascii.py <frames dir> <out> <cols>` (all under `~/.claude/design-work/t3code/`).

**Must stay:** every T3 screen works and reads as now; code blocks, diffs and terminal stay crisp and high contrast; status colors (error/warning/working) still readable.

**Screens to draw:** the main chat screen (sidebar + chat + composer + right card) at 1920x1032, as in `current.png`.

If any part of this brief is a bad idea, say so and suggest something better.
