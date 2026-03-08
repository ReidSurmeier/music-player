import subprocess
from pathlib import Path

OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers-test")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
HERO_DIR = Path.home() / "Projects/music-player/hero-refs"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

input_image = TEMP_DIR / "J_Dilla_Donuts_thumb.jpg"
hero_refs = [
    HERO_DIR / "animal_crossing_disc.png",
    HERO_DIR / "katamari_disc.jpg",
    HERO_DIR / "bless_cd.jpg",
]

cmd_inputs = ["--input-image", str(input_image)]
for ref in hero_refs:
    if ref.exists():
        cmd_inputs.extend(["--input-image", str(ref)])

prompt = """Generate exactly ONE flat top-down scan of a single 120mm optical disc (front/label side only). Do NOT generate two discs or a back side.

DISC PHYSICAL STRUCTURE (strictly follow):
- Perfect circle, white background
- Center spindle hole: 15mm clean silver/chrome mirror ring. Absolutely NO text inside this zone.
- Stacking ring: thin raised clear plastic ring around center hole
- Inner hub area (15-25mm radius): silver/reflective zone with tiny stamped technical codes (IFPI codes, matrix/runout etchings)
- Main printable surface (25-58mm radius): full-bleed album artwork
- Outer rim: 1mm clear plastic edge

ARTWORK — J Dilla "Donuts" (2006):
- Adapt the provided J Dilla album art photo (him smiling in Detroit Tigers cap) to fill the entire printable disc surface
- Full bleed — art goes edge to edge on the printable area, no borders
- The photo should feel screen-printed onto the disc surface with slight halftone/satin texture

TYPOGRAPHY (high priority — must be crisp and accurate):
- "J DILLA" — large, bold, white condensed sans-serif (Impact or Futura Extra Bold Condensed style), curved along the TOP edge of the disc following the outer rim curvature
- "DONUTS" — same font, slightly smaller, curved below "J DILLA" or placed as a second arc
- Font must be SHARP, well-kerned, professional. Not hand-drawn, not wobbly. Clean vector-quality type.
- All text in the outer 30% of the disc radius only

BRANDING & LEGAL (important — this is what makes it look real):
- "STONES THROW RECORDS" logo or text — bottom area of disc
- Catalog number: "STH 2126" in small text near inner ring
- "© 2006 Stones Throw Records. All Rights Reserved."
- "Manufactured by Universal Music Group"
- IFPI code: "IFPI L127" stamped tiny in the inner mirror ring
- Archive ID: "STH-27663579" in small technical text in the inner ring area
- "MADE IN USA" small text
- Barcode or small UPC area near the bottom edge (tiny, subtle)
- Compact Disc Digital Audio logo (the "disc" symbol) small, near bottom

AESTHETIC:
- Early 2000s pressed CD manufacturing quality
- Slight reflective sheen on silver areas
- Screen-printed matte finish on artwork areas
- Photorealistic product scan lighting (flat, even, scanner-bed style)
- Pure white background outside the disc

Generate ONLY ONE disc. Single circle. Front label side only."""

output_file = OUTPUT_DIR / "arena_27663579_v2.png"
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
