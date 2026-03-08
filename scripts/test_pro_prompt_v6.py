import subprocess
from pathlib import Path

OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers-test")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
HERO_DIR = Path.home() / "Projects/music-player/hero-refs"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

input_image = TEMP_DIR / "J_Dilla_Donuts_thumb.jpg"
hero1 = HERO_DIR / "hero1.jpg"  # Animal Crossing GC disc - for disc shape ref only

# Strategy: Only ONE hero ref (for shape), album art is primary
# Frame as EDIT not GENERATE
cmd_inputs = [
    "--input-image", str(input_image),
    "--input-image", str(hero1),
]

prompt = """IMAGE EDITING TASK — NOT generation. You are compositing, not creating.

The FIRST input image is a photograph. This photograph must appear on the final output EXACTLY as provided — same colors, same composition, same lighting, same person, same everything. Do NOT repaint it. Do NOT re-render it. Do NOT change its colors. Do NOT add halftone or dot patterns to the photo itself. Do NOT simplify or stylize it. The photograph must remain PHOTOGRAPHICALLY IDENTICAL to the input.

YOUR TASK: Take that exact photograph and mask/crop it into a circular CD disc shape, then add disc manufacturing elements around it.

The SECOND input image shows a real GameCube disc — use it ONLY as reference for the physical disc structure (center hole size, hub ring, rim). Do NOT copy its artwork or colors.

OUTPUT: 1:1 square, single disc, white background.

STEP 1 — CROP THE PHOTO:
Crop the first input photograph into a perfect circle (the disc shape). The photo fills the entire printable area of the disc from edge to edge. The photo should look EXACTLY like the input but circular.

STEP 2 — CUT THE CENTER HOLE:
Cut a circular hole in the center of the photo (matching the reference disc's center hole). Add:
- Clear/transparent plastic hub ring around the hole (no print, just clear polycarbonate)
- Thin silver mirror band with etched text: "IFPI L127 · STH-27663579 · MADE IN USA"

STEP 3 — ADD DISC EDGES:
- Silver metallic rim around the outer edge of the disc (1mm bevel)
- The disc sits on a white background

STEP 4 — ADD TYPOGRAPHY ON TOP:
Print these words ON TOP of the photograph in white ink:
- "J DILLA" — large, bold condensed sans-serif, curved along the top outer edge
- "DONUTS" — same font, curved below it
- The white text sits on the surface of the photo, like screen-printed ink

STEP 5 — ADD BRANDING ON TOP:
Small white text printed on the lower portion of the disc:
- Stones Throw Records logo
- "STH 2126"
- "© 2006 Stones Throw Records. All Rights Reserved."
- "Manufactured by Universal Music Group"
- Compact Disc Digital Audio logo

CRITICAL RULES:
- The underlying photograph must be PRESERVED EXACTLY from the input. Same face, same cap, same shirt, same colors, same background tone.
- Only ADDITIONS are: circular crop, center hole, disc rim, white text overlay, branding
- Do NOT re-interpret, re-paint, or re-generate the photograph
- Do NOT change the color palette of the photograph
- ONE disc only"""

output_file = OUTPUT_DIR / "arena_27663579_v6.png"
print(f"Generating to: {output_file}")

cmd = [
    "python3", str(NANO_SCRIPT),
    "--prompt", prompt,
    "--filename", str(output_file),
    "--api-key", GEMINI_KEY,
    "--resolution", "2K"
] + cmd_inputs

subprocess.run(cmd, check=True)
print(f"Done: {output_file}")
