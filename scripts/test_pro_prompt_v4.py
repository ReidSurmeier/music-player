import subprocess
from pathlib import Path

OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers-test")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

input_image = TEMP_DIR / "J_Dilla_Donuts_thumb.jpg"
cmd_inputs = ["--input-image", str(input_image)]

prompt = """Photorealistic product photograph: a single CD disc lying flat on a pure white surface, shot from directly above (90° top-down, no perspective, no angle).

THE DISC MUST HAVE A PROPER PHYSICAL CENTER HOLE:
- The center of the disc has a perfectly circular 15mm PUNCH-THROUGH HOLE — you can see the white background through it. It is a REAL HOLE, not a printed circle.
- Surrounding the hole is a 20mm wide transparent/clear polycarbonate hub ring — no printing, no artwork in this zone. Just clear plastic with subtle rainbow light refraction.
- The hub ring has a raised plastic stacking ridge (a thin concentric ring about 3mm from the hole).
- Between the clear hub and the printed area, there is a thin silver/mirror band (~5mm) where tiny etched manufacturing codes appear: "IFPI L127 · STH-27663579 · MADE IN USA"
- The artwork zone BEGINS at roughly 25mm from center and extends to the outer edge.
- There is NO bleed, NO artwork, NO clipping in the center hub area. The album art starts OUTSIDE the clear hub zone.

ALBUM ARTWORK (25mm to 58mm radius — the printable ring):
Use the provided input image EXACTLY. It shows J Dilla: a man with his head tilted down, wearing a black Detroit Tigers cap pulled low over his eyes, smiling, in a black-and-white striped polo shirt, dark olive background. 
- Place this photo filling the entire printable ring area of the disc
- Crop it to fit the donut-shaped printable zone (the annular ring between the hub and the outer edge)
- Do NOT distort, mirror, duplicate, or reimagine the photo. Use it as-is.

TYPOGRAPHY — SCREEN-PRINTED, NOT DIGITAL:
The text must look physically PRINTED onto the disc surface with real ink:
- Slight halftone dot pattern visible in the white ink (like silkscreen/serigraphy)
- Soft edges — not vector-sharp, slightly feathered like real screen-printed ink on plastic
- Micro ink bleed where white meets the dark photo underneath
- The ink has physical OPACITY — you can sense it sitting on top of the image surface
- Very subtle registration offset (0.5mm) giving it life and imperfection

Text content:
- "J DILLA" — large, white, bold condensed sans-serif (Knockout/Druk style), CURVED along the top outer edge of the disc, following the circle's curvature
- "DONUTS" — same style, curved below "J DILLA" along the disc edge
- Both in the outer 25% radius of the disc

BRANDING & LEGAL (bottom half, small, same screen-printed white ink):
- Stones Throw Records logo (hand-drawn turntable icon)
- "STH 2126"
- "© 2006 Stones Throw Records. All Rights Reserved."
- "Manufactured by Universal Music Group"
- Compact Disc Digital Audio logo
- All branding text has the same halftone/screen-print texture as the title

OUTER EDGE:
- 1mm clear plastic rim with silver metallic bevel catching light

LIGHTING & SURFACE:
- Flat even lighting (like a flatbed scanner)
- Printed areas have satin/matte finish
- Clear hub has subtle rainbow light diffraction
- White background, no shadows, no reflections

This is ONE single disc. Not two. No back side. Just the front label."""

output_file = OUTPUT_DIR / "arena_27663579_v4.png"
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
