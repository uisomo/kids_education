"""Rounded review typography, with flat fills and unchanged anchors."""
from pathlib import Path
from functools import lru_cache
from PIL import Image,ImageDraw,ImageFont,ImageColor,ImageOps
BASE=Path(__file__).parent
FONT=BASE/'fonts/MPLUSRounded1c-ExtraBold.ttf'
@lru_cache(maxsize=256)
def font(role,size):return ImageFont.truetype(str(FONT),int(size))
def material(layer,text,xy,f,fill):
 # Typography stays flat and crisp; glossy material belongs to fixed shapes.
 return
def make_letters(r,oldfont):
 def letters(im,s,xy,size,role='sans',fill='#111111',maxwidth=None,angle=0,strokeColor=None,strokeWidth=0):
  r.DRAWN_TEXT.append(s)
  oldrole=role
  if any(ord(c)>255 for c in s) and role not in {'hand','serif','jp','jplight'}:oldrole='hand' if role=='script' else 'jplight' if role in {'light','sans'} else 'jp'
  old=oldfont(oldrole,size);limit=min(maxwidth or 10000,old.getlength(s)+2)
  f=font(role,size)
  while f.getlength(s)>limit and size>8:size-=1;f=font(role,size)
  b=f.getbbox(s);pad=max(2,strokeWidth+1);layer=Image.new('RGBA',(max(1,b[2]-b[0]+pad*2),max(1,b[3]-b[1]+pad*2)))
  pos=(pad-b[0],pad-b[1]);ImageDraw.Draw(layer).text(pos,s,font=f,fill=fill,stroke_width=strokeWidth,stroke_fill=strokeColor)
  material(layer,s,pos,f,fill)
  if angle:layer=layer.rotate(angle,expand=True,resample=Image.Resampling.BICUBIC)
  im.alpha_composite(layer,tuple(map(int,xy)))
  return {'text':s,'font':f.getname(),'pointSize':size,'rotation':angle,'scaleX':1,'scaleY':1,'position':xy}
 return letters
