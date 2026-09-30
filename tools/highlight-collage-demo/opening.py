"""Compositing contract for the opening: one live portrait preview, no still-only hold."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageColor
BASE=Path(__file__).resolve().parent
HOOK_END=4.0  # Review cue boundary; actual word alignment still needs the recording event log.
TRANSITION=.3
PREVIEW=(546,875,153,272)
HOOK_TEXT=['一番の技、','どれですか？','教えてください']
def hook_font(ident,size):
 return ImageFont.truetype(str(BASE/'fonts/MPLUSRounded1c-ExtraBold.ttf'),size)
def hook_style(base):
 # Palette colors already belong to this collage; keep one style for the whole opening.
 import colorsys
 colors=base.convert('RGB').resize((80,142)).quantize(colors=24).convert('RGB').getcolors(80*142)
 chromatic=[(n,c) for n,c in colors if colorsys.rgb_to_hsv(*(v/255 for v in c))[1]>.19 and max(c)>145]
 chromatic.sort(key=lambda nc:nc[0],reverse=True)
 fills=[c for _,c in chromatic[:3]] or [(255,255,255)]
 return fills
def compose(base,frame,t,ident,style=None,text_style=None):
 """t is elapsed highlight time, including the time shown in the small window."""
 canvas=base.convert('RGB').resize((720,1280));d=ImageDraw.Draw(canvas)
 if t<HOOK_END:
  fills=style or hook_style(base)
  treatments=text_style or {}
  size=130;f=hook_font(ident,size)
  while max(f.getlength(line) for line in HOOK_TEXT)>640:
   size-=1;f=hook_font(ident,size)
  # All three lines are visible from frame zero, centered as one text block.
  for j,line in enumerate(HOOK_TEXT):
   treatment=treatments[j] if isinstance(treatments,list) else treatments
   box=d.textbbox((0,0),line,font=f,stroke_width=7)
   x=(720-f.getlength(line))/2;y=610+(j-1)*(size+22)-(box[1]+box[3])/2
   fill=treatment.get('fill',fills[0]);shadow=treatment.get('shadow',fill)
   d.text((x+5,y+9),line,font=f,fill=shadow,stroke_width=10,stroke_fill=shadow)
   d.text((x,y),line,font=f,fill=fill,stroke_width=6,stroke_fill=treatment.get('outline','#171717'))
  d.rounded_rectangle((537,834,710,1157),radius=9,fill='#14151a')
  label=ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',16)
  d.text((543,844),'今日のハイライト',font=label,fill='white')
  x,y,w,h=PREVIEW;canvas.paste(frame.resize((w,h),Image.Resampling.LANCZOS),(x,y))
  d=ImageDraw.Draw(canvas);d.rectangle((0,1208,720,1280),fill='#14151a')
  for a,b in [(0,3),(3,6),(6,10)]:
   x=24+672*a/10;end=24+672*b/10;d.line((x,1253,end-6,1253),fill='#555966',width=8)
   if t>=a:d.line((x,1253,max(x+1,24+672*min(t,b)/10-6),1253),fill='#ffce70',width=8)
  d.text((24,1218),f'ハイライト {1 if t<3 else 2 if t<6 else 3}/3',font=label,fill='white')
 elif t<HOOK_END+TRANSITION:
  # The same current highlight continues through expansion, without replaying earlier frames.
  u=(t-HOOK_END)/TRANSITION;u=u*u*(3-2*u);x,y,w,h=PREVIEW
  canvas.paste(frame.resize((round(w+(720-w)*u),round(h+(1280-h)*u)),Image.Resampling.BILINEAR),(round(x*(1-u)),round(y*(1-u))))
 else:canvas=frame.resize((720,1280),Image.Resampling.LANCZOS)
 return canvas


def preferred_treatment(color,pattern):
 """Approved styles 1/6: one base hue, black middle, white-40% pale outer line."""
 if pattern not in (1,6):raise ValueError('Hook pattern must be 1 or 6')
 rgb=ImageColor.getrgb(color) if isinstance(color,str) else color
 pale=tuple(round(c*.6+255*.4) for c in rgb)
 normal={'fill':color,'outline':'#171717','shadow':color}
 soft={'fill':pale,'outline':'#171717','shadow':pale}
 black={'fill':'#171717','outline':'#ffffff','shadow':'#171717'}
 return [normal,black,soft] if pattern==1 else [soft,black,normal]
