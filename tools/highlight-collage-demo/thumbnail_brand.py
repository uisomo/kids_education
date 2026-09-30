"""Existing app wordmark for the review's first 15 frames only."""
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
LOGO=ROOT/'docs/highlight-collage-demo/glossy-lab/prototype/assets/alan-karate-logo.png'
def branded_thumbnail(image):
    canvas=image.convert('RGBA')
    logo=Image.open(LOGO).convert('RGBA')
    logo.thumbnail((240,100),Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo,(canvas.width-18-logo.width,12))
    return canvas.convert('RGB')
