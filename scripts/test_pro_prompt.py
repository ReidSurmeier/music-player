import json
import os
import sys
import subprocess
import requests
from pathlib import Path

# Paths
OUTPUT_DIR = Path("/mnt/movies/OpenclawOutput/dvd-covers-test")
TEMP_DIR = Path.home() / "Projects/music-player/temp_covers"
HERO_DIR = Path.home() / "Projects/music-player/hero-refs"
NANO_SCRIPT = Path.home() / ".npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py"
GEMINI_KEY = "AIzaSyDsmZJrTd59rEoGhliQ1ErvJ2iqKeuQzGA"

def ensure_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

def main():
    ensure_dirs()
    
    # J Dilla - Donuts details
    title = "Donuts"
    artist = "J Dilla"
    label = "Stones Throw"
    arena_id = "27663579"
    
    # Input images
    input_image = TEMP_DIR / "J_Dilla_Donuts_thumb.jpg"
    hero_refs = [
        HERO_DIR / "animal_crossing_disc.png",
        HERO_DIR / "katamari_disc.jpg"
    ]
    
    # Validate inputs
    if not input_image.exists():
        print(f"Error: Input image {input_image} not found")
        return
        
    cmd_inputs = ["--input-image", str(input_image)]
    for ref in hero_refs:
        if ref.exists():
            cmd_inputs.extend(["--input-image", str(ref)])

    # Structured Prompt from analysis
    prompt = f"""
{{
  "task": "image_generation",
  "subject": {{
    "type": "physical_media_scan",
    "object": "120mm optical disc (DVD/GameCube style)",
    "view": "flat top-down product scan (90° overhead)",
    "surface": "full-bleed album art print covering the entire disc surface"
  }},
  "design_rules": {{
    "center_hole": "15mm diameter spindle hole must be CLEAN SILVER MIRROR finish. NO text or ink in this center zone.",
    "inner_ring": "Clear stacking ring zone with small technical text only (e.g. model numbers).",
    "typography": "Analyze input album art font. Use a matching custom font for '{artist}' and '{title}'. Place text in the outer 30% of the disc, following the curvature or horizontal. Avoid the center hole.",
    "branding": "Include '{label}' logo if compatible, or clean text. Small technical Archive ID: '{arena_id}'.",
    "icons": "NO generic music notes. Use specific artist iconography or nothing."
  }},
  "aesthetic": {{
    "era": "early 2000s manufacturing (GameCube/PS2 era)",
    "texture": "screen printed disc texture, slight satin finish, realistic material highlights",
    "lighting": "flat scanner light or soft studio top-down",
    "background": "pure white or transparent"
  }},
  "content_integration": {{
    "instruction": "Adapt the provided J Dilla 'Donuts' album art to the circular format. Do not crop important face/donut elements. Extend background if necessary to fill the circle."
  }}
}}
"""

    output_file = OUTPUT_DIR / "arena_27663579_Bye_ProTest.png"
    print(f"Generating test cover to: {output_file}")
    
    cmd = [
        "python3", str(NANO_SCRIPT),
        "--prompt", prompt,
        "--filename", str(output_file),
        "--api-key", GEMINI_KEY,
        "--resolution", "2K"
    ] + cmd_inputs

    try:
        subprocess.run(cmd, check=True)
        print(f"Success! Saved to {output_file}")
    except subprocess.CalledProcessError as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    main()
