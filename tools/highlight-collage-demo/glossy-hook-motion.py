"""Prototype-only thumbnail + three equal Hook beats. No artwork regeneration."""
from pathlib import Path
import math
from PIL import Image, ImageDraw
from opening import HOOK_TEXT, hook_font
FPS=30
THUMBNAIL_FRAMES=15
HOOK_FRAMES=120
BEAT_FRAMES=HOOK_FRAMES//3
ZOOM_FRAMES=9

def beat_at(frame):
 if frame<THUMBNAIL_FRAMES:return None
 return min(2,(frame-THUMBNAIL_FRAMES)//BEAT_FRAMES)

def overlay_line(frame,ident,treatment,line,age):
 """One crisp line per highlight; uniform glyph scaling, no sheen."""
 canvas=frame.convert('RGBA').resize((720,1280))
 size=110;f=hook_font(ident,size)
 while f.getlength(line)>610:size-=1;f=hook_font(ident,size)
 b=f.getbbox(line,stroke_width=10);pad=20
 layer=Image.new('RGBA',(b[2]-b[0]+2*pad+10,b[3]-b[1]+2*pad+10))
 d=ImageDraw.Draw(layer);x=pad-b[0];y=pad-b[1];shadow=treatment['shadow']
 d.text((x+5,y+9),line,font=f,fill=shadow,stroke_width=10,stroke_fill=shadow)
 d.text((x,y),line,font=f,fill=treatment['fill'],stroke_width=6,stroke_fill=treatment['outline'])
 u=min(1,max(0,(age+1)/ZOOM_FRAMES));scale=.55+.45*(1-(1-u)**3)
 layer=layer.resize((round(layer.width*scale),round(layer.height*scale)),Image.Resampling.LANCZOS)
 # Keep hands and face visible, reserving the lower area for the single Hook line.
 canvas.alpha_composite(layer,((720-layer.width)//2,round(960-layer.height/2)))
 return canvas.convert('RGB')

assert [beat_at(k) for k in [0,14,15,54,55,94,95,134]]==[None,None,0,0,1,1,2,2]
assert BEAT_FRAMES*3==HOOK_FRAMES
