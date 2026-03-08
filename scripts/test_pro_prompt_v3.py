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

prompt = """Generate exactly ONE flat top-down scan of a single 120mm CD disc. Front label side only. One disc, one circle.

CRITICAL — ALBUM ART SOURCE:
Use the FIRST provided input image EXACTLY as the disc artwork. It shows a man in a black Detroit Tigers cap pulled low over his eyes, smiling, wearing a black and white striped polo shirt, against a dark olive-green background. Do NOT alter this photo. Do NOT replace it with a different photo. Do NOT mirror or duplicate it. Place this EXACT photograph onto the disc surface, cropped to the circular shape, centered on his face/smile.

DISC PHYSICAL STRUCTURE:
- Perfect circle on pure white background
- Center spindle hole: clean chrome/silver mirror ring with concentric grooves. NO text inside the hole.
- Stacking ring: thin raised transparent plastic ring around center hole
- Inner hub (15-25mm radius): reflective silver zone with tiny etched technical codes
- Main printable surface (25-58mm radius): the album photo, full-bleed, edge to edge
- Outer rim: 1mm clear plastic edge with silver bevel

TYPOGRAPHY — THIS IS KEY:
The text must feel PRINTED ON THE DISC — not digitally overlaid. Think screen-printed ink with:
- Slight halftone dot texture visible at close inspection
- Micro ink spread at letter edges (not perfectly vector-sharp — slightly soft, like real silk-screen printing)
- The ink sits ON TOP of the photo with very subtle physical thickness/opacity
- Letters should have the tiniest bit of registration variance (like real multi-pass screen printing)

Text placement and content:
- "J DILLA" — top of disc, large, following the outer curve. White ink, bold condensed grotesque sans-serif (like Knockout or Druk Bold). The letters should feel heavy, punchy, slightly rough-edged from the printing process.
- "DONUTS" — below "J DILLA", also curved along the disc. Same font family, same screen-printed texture.
- Text sits in the outer 25% of the disc. Away from center.

BRANDING & MANUFACTURING DETAILS (small, subtle, real):
- Bottom center: Stones Throw Records logo (hand-drawn turntable icon style)
- Below logo: "STH 2126" catalog number
- "© 2006 Stones Throw Records. All Rights Reserved."
- "Manufactured by Universal Music Group"  
- Compact Disc Digital Audio logo (small, bottom edge)
- Inner ring etchings: "IFPI L127" · "STH-27663579" · "MADE IN USA"
- All bottom text in small white or silver, same screen-printed quality

AESTHETIC & LIGHTING:
- Flatbed scanner lighting: perfectly even, no shadows, no dramatic angles
- The disc surface has a slight satin/matte finish where the ink is printed
- Silver/chrome areas have subtle reflective highlights from the scanner lamp
- Overall: looks like you put a real CD face-down on a scanner and hit scan
- Early 2000s manufacturing quality — this should look like it came out of a pressing plant in 2006"""

output_file = OUTPUT_DIR / "arena_27663579_v3.png"
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
