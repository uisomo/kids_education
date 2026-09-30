"""Prototype-only thumbnail + three equal Hook beats. No artwork regeneration."""
from pathlib import Path
import math,colorsys,importlib.util
spec=importlib.util.spec_from_file_location("brand",Path(__file__).with_name("brand-type.py"));brand=importlib.util.module_from_spec(spec);spec.loader.exec_module(brand)
from functools import lru_cache
from PIL import Image, ImageDraw,ImageColor,ImageOps
from opening import HOOK_TEXT
def hook_font(ident,size):
 return brand.font('hook',size)
FPS=30
THUMBNAIL_FRAMES=15
HOOK_FRAMES=120
BEAT_FRAMES=HOOK_FRAMES//3
ZOOM_FRAMES=9

def beat_at(frame):
 if frame<THUMBNAIL_FRAMES:return None
 return min(2,(frame-THUMBNAIL_FRAMES)//BEAT_FRAMES)

FRAME_PATH=Path(__file__).resolve().parents[2]/'docs/highlight-collage-demo/glossy-lab/prototype/assets/highlight-frame.png'
@lru_cache(maxsize=64)
def colored_frame(color):
 asset=Image.open(FRAME_PATH).convert('RGBA').resize((720,1280),Image.Resampling.LANCZOS)
 alpha=asset.getchannel('A');h,s,v=asset.convert('RGB').convert('HSV').split()
 target=ImageColor.getrgb(color) if isinstance(color,str) else color
 th,ts,tv=colorsys.rgb_to_hsv(*(c/255 for c in target));base_h,base_s,_=colorsys.rgb_to_hsv(221/255,68/255,70/255)
 h=h.point(lambda n:round((n+(th-base_h)*255)%256));s=s.point(lambda n:round(min(255,n*ts/base_s)))
 asset=Image.merge('HSV',(h,s,v)).convert('RGBA');asset.putalpha(alpha)
 return asset

@lru_cache(maxsize=128)
def header_overlay(color,beat):
 """Larger Hook-family title, outlined type and two existing generated stars."""
 rgb=ImageColor.getrgb(color) if isinstance(color,str) else color
 header=Image.new('RGBA',(720,124),tuple(round(c*.18) for c in rgb))
 header.alpha_composite(colored_frame(color).crop((0,0,720,124)))
 d=ImageDraw.Draw(header);f=hook_font('',52)
 ink=tuple(round(c*.22) for c in rgb)
 d.text((333,67),'今日のハイライト',font=f,anchor='mm',fill=ink,stroke_width=4,stroke_fill=ink)
 d.text((330,63),'今日のハイライト',font=f,anchor='mm',fill='white',stroke_width=3,stroke_fill='#171717')
 star_path=FRAME_PATH.parents[2]/'fixed-assets-v1/3872/generated-outline-star.png'
 star=Image.open(star_path).convert('RGBA')
 star=star.crop(star.getchannel('A').point(lambda n:255 if n>128 else 0).getbbox())
 alpha=star.getchannel('A')
 star=ImageOps.colorize(ImageOps.grayscale(star),ink,'#fff8de').convert('RGBA');star.putalpha(alpha)
 star=star.resize((26,26),Image.Resampling.LANCZOS)
 for x in (84,578):header.alpha_composite(star,(x-13,50))
 d.text((650,63),str(beat+1)+'/3',font=hook_font('',24),anchor='mm',fill='white',stroke_width=1,stroke_fill='#333333')
 return header

def framed_highlight(frame,ident,color,beat):
 rgb=ImageColor.getrgb(color) if isinstance(color,str) else color
 canvas=Image.new('RGBA',(720,1280),tuple(round(c*.18) for c in rgb))
 # Fit the complete recorded frame; the generated frame must not crop the recording.
 fitted=ImageOps.contain(frame.convert('RGBA'),(632,1120),Image.Resampling.LANCZOS)
 canvas.alpha_composite(fitted,((720-fitted.width)//2,126+(1120-fitted.height)//2))
 canvas.alpha_composite(colored_frame(color if isinstance(color,str) else tuple(color)))
 canvas.alpha_composite(header_overlay(color,beat))
 return canvas

@lru_cache(maxsize=16)
def fit_size(line):
 size=110
 while hook_font('',size).getlength(line)>610:size-=1
 return size

@lru_cache(maxsize=256)
def text_layer(ident,fill,outline,shadow,line):
 size=fit_size(line);f=hook_font(ident,size)
 b=f.getbbox(line,stroke_width=10);pad=20
 layer=Image.new('RGBA',(b[2]-b[0]+2*pad+10,b[3]-b[1]+2*pad+10))
 d=ImageDraw.Draw(layer);x=pad-b[0];y=pad-b[1]
 d.text((x+5,y+9),line,font=f,fill=shadow,stroke_width=10,stroke_fill=shadow)
 d.text((x,y),line,font=f,fill=fill,stroke_width=6,stroke_fill=outline)
 brand.material(layer,line,(x,y),f,fill)
 return layer

def overlay_line(frame,ident,treatment,line,age,color,beat):
 """One crisp line per highlight; uniform glyph scaling, no sheen."""
 canvas=framed_highlight(frame,ident,color,beat)
 layer=text_layer(ident,treatment['fill'],treatment['outline'],treatment['shadow'],line)
 u=min(1,max(0,(age+1)/ZOOM_FRAMES));scale=.55+.45*(1-(1-u)**3)
 layer=layer.resize((round(layer.width*scale),round(layer.height*scale)),Image.Resampling.LANCZOS)
 # The requested Hook line is centered in the video canvas.
 canvas.alpha_composite(layer,((720-layer.width)//2,round(640-layer.height/2)))
 return canvas.convert('RGB')

assert [beat_at(k) for k in [0,14,15,54,55,94,95,134]]==[None,None,0,0,1,1,2,2]
assert BEAT_FRAMES*3==HOOK_FRAMES
