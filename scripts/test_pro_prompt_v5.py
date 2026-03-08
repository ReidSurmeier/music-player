import subprocess
from pathlib import Path

OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers-test")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
HERO_DIR = Path.home() / "Projects/music-player/hero-refs"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

input_image = TEMP_DIR / "J_Dilla_Donuts_thumb.jpg"
hero1 = HERO_DIR / "hero1.jpg"  # Animal Crossing GC disc
hero2 = HERO_DIR / "hero2.jpg"  # Katamari PS2 disc

cmd_inputs = [
    "--input-image", str(input_image),
    "--input-image", str(hero1),
    "--input-image", str(hero2),
]

prompt = """Look at the 2nd and 3rd input images — these are real GameCube and PS2 disc scans. Study their CENTER HOLE structure carefully:
- A real physical hole punched through the disc (you can see the white background through it)  
- A clear/transparent plastic hub ring surrounding the hole (no printing in this area)
- The printed artwork begins OUTSIDE the clear hub, with a clean boundary

Now generate a NEW disc scan that matches this exact physical structure, using the 1st input image (J Dilla album art) as the disc artwork.

OUTPUT: A single 1:1 square image of ONE disc, centered on white background.

THE DISC:
- Match the physical center hole + hub ring structure from the reference discs EXACTLY
- The hole is real — white background shows through
- The clear hub ring is about 20mm wide, transparent/shiny with no print
- A thin silver mirror band separates the hub from the printed art area
- Tiny etched codes in the mirror band: "IFPI L127 · STH-27663579 · MADE IN USA"

ARTWORK (printed ring area):
- Use the 1st input image: man in black Detroit Tigers cap pulled over eyes, smiling, black-and-white striped polo, dark olive background
- Place this photo EXACTLY as-is on the printable disc ring (the donut shape between hub and outer edge)
- Full bleed across the entire printable area

TYPOGRAPHY — SCREEN-PRINTED WHITE INK:
Text must look physically silk-screened onto the disc surface (not digitally overlaid):
- Visible halftone dot pattern in the ink
- Soft, slightly feathered letter edges (like real screen printing on plastic)
- Subtle ink bleed where white meets the dark photo beneath
- Very slight registration imperfection giving it hand-printed character

Text:
- "J DILLA" — large bold condensed sans-serif, CURVED along the top outer edge of the disc
- "DONUTS" — same font, curved below, following the disc curvature
- Both in the outer 25% of the disc

BRANDING (bottom, small, same screen-printed quality):
- Stones Throw Records logo
- "STH 2126"  
- "© 2006 Stones Throw Records. All Rights Reserved."
- "Manufactured by Universal Music Group"
- Compact Disc Digital Audio logo

SURFACE: Flatbed scanner lighting, satin matte print areas, slight prismatic refraction on the clear hub.

ONE disc. Square image. White background."""

output_file = OUTPUT_DIR / "arena_27663579_v5.png"
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
