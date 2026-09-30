"""Isolated, reproducible material/color experiments; never writes approved outputs."""
import importlib.util
import inspect
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFilter, ImageColor, ImageEnhance
import refine as r
import more as m
import opening as op

spec = importlib.util.spec_from_file_location('glossy', Path(__file__).with_name('glossy-demo.py'))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
OUT = r.O / 'glossy-lab'
OUT.mkdir(exist_ok=True)
VARIANTS = [
 ('0', '現行の強め', '白黒・網点・黒いHookを残した比較基準。'),
 ('1', 'カラー＋なめらか', '自然な肌色に戻し、網点と追加粒子を除去。艶は従来と同じ。'),
 ('2', 'ぷっくり樹脂', '①に幅広い面の反射と厚みを追加。Hookは現行のまま。'),
 ('3', '色付きHook', '②の黒いHookを深い主色へ。上下は乳白色、影は短く。'),
 ('4', '人物も同系色', '③の人物を主色の濃淡に。自然なカラー写真との比較。'),
 ('5', '乳白色の背景', '③の背景を主色がうっすら映る白へ。肌色と鮮やかな装飾を残す。'),
]
STATE = 1
PRIMARY = (240, 40, 120)
ORIGINAL_COAT = g.coat
ORIGINAL_PHOTO = r.Layout.photo

def crisp_letters(im,s,xy,size,*args,**kw):
 # The small 3889 title loses its counters under a milky bevel and shadow.
 if s=='正拳突き' and tuple(xy)==(49,29) and size==68:
  mode=g.MODE
  try:
   g.MODE=0
   return g.rounded_letters(im,s,xy,size,*args,**kw)
  finally:g.MODE=mode
 return g.rounded_letters(im,s,xy,size,*args,**kw)

def mix(a, b, t):
 return tuple(round(x*(1-t)+y*t) for x,y in zip(a,b))

def tone_photo(p):
 alpha = p.getchannel('A')
 if STATE == 4:
  gray = ImageOps.autocontrast(ImageOps.grayscale(p), cutoff=1)
  p = ImageOps.colorize(gray, mix(PRIMARY,(15,13,35),.72), mix(PRIMARY,(255,255,255),.84)).convert('RGBA')
 else:
  p = ImageEnhance.Brightness(p).enhance(1.08)
 p.putalpha(alpha)
 return p

def photo(self, *args, **kw):
 kw.update(mono=False, tint=None, wash=0, flatColor=None)
 return ORIGINAL_PHOTO(self, *args, **kw)

def coat(source, kind):
 if STATE < 2:
  return ORIGINAL_COAT(source, kind)
 pad = 18
 p = Image.new('RGBA', (source.width+2*pad, source.height+2*pad))
 p.alpha_composite(source,(pad,pad))
 mask = p.getchannel('A')
 out = Image.new('RGBA',p.size)
 deep = mix(PRIMARY,(20,15,40),.75)
 shadow = g.shifted(mask,2,5).filter(ImageFilter.GaussianBlur(3))
 g.tint_over(out,shadow,deep,.30)
 if kind == 'photo':
  g.tint_over(out,mask.filter(ImageFilter.MaxFilter(5)),mix(PRIMARY,(255,255,255),.90),.88)
 out.alpha_composite(p)
 smooth = mask.filter(ImageFilter.GaussianBlur(1.2))
 top = g.ImageChops.subtract(smooth,g.shifted(smooth,3,4))
 bottom = g.ImageChops.subtract(smooth,g.shifted(smooth,-3,-4))
 g.tint_over(out,g.ImageChops.multiply(bottom,mask),deep,.43)
 g.tint_over(out,g.ImageChops.multiply(top,mask),'white',.93)
 if kind != 'photo':
  yy,xx=np.mgrid[:p.height,:p.width]
  ny=(yy-pad)/max(1,source.height); nx=(xx-pad)/max(1,source.width)
  boundary=.30+.15*(nx-.4)**2
  broad=.37*np.exp(-((ny-.14)/.19)**2)
  sharp=.43*np.exp(-((ny-boundary)/.025)**2)
  reflection=np.uint8(np.clip((broad+sharp)*(1-.28*nx),0,.73)*255)
  g.tint_over(out,g.ImageChops.multiply(Image.fromarray(reflection),mask),'white')
  shade=np.uint8(np.clip((ny-.67)*.52,0,.18)*255)
  g.tint_over(out,g.ImageChops.multiply(Image.fromarray(shade),mask),deep)
 return out,pad

def composite(canvas,p,xy):
 p=tone_photo(p)
 layer,pad=coat(p,'photo')
 canvas.alpha_composite(layer,(int(xy[0])-pad,int(xy[1])-pad))

class CleanDraw(g.MaterialDraw):
 def __getattr__(self,name):
  original=super().__getattr__(name)
  def call(xy,*args,**kw):
   # Suppress only the explicit tiny halftone ellipses on the artwork canvas.
   if name=='ellipse' and self.im.size==(720,1280):
    v=list(xy)
    if len(v)==4 and isinstance(v[0],(int,float)) and max(v[2]-v[0],v[3]-v[1])<3:
     return None
   return original(xy,*args,**kw)
  return call

def clean_cards():
 # Keep the exact existing clipping/overflow geometry, but retain source RGB.
 source=inspect.getsource(r.cards)
 old="gray=ImageOps.autocontrast(ImageOps.grayscale(person),cutoff=1);person=ImageOps.colorize(gray,paint('#111111'),paint('#faf7f0')).convert('RGBA');person.putalpha(alpha)"
 assert source.count(old)==1, 'Cards renderer changed; review adapter before regenerating.'
 namespace=dict(r.__dict__)
 exec(compile(source.replace(old,'person.putalpha(alpha)'),'<natural-color-cards>','exec'),namespace)
 return namespace['cards']()

def colored_hook(art,frame,ident):
 # Reuse the preview/timeline UI, then draw actual glyph masks with shallow relief.
 saved=op.HOOK_TEXT
 try:
  op.HOOK_TEXT=['','','']
  out=op.compose(art,frame,0,ident).convert('RGBA')
 finally:op.HOOK_TEXT=saved
 f=op.hook_font(ident,130);size=130
 while max(f.getlength(s) for s in saved)>640:
  size-=1;f=op.hook_font(ident,size)
 deep=mix(PRIMARY,(17,12,35),.76);pearl=mix(PRIMARY,(255,255,255),.94)
 for j,s in enumerate(saved):
  mask=Image.new('L',out.size);d=g.DRAW(mask)
  box=d.textbbox((0,0),s,font=f,stroke_width=7)
  x=(720-f.getlength(s))/2;y=610+(j-1)*(size+22)-(box[1]+box[3])/2
  d.text((x,y),s,font=f,fill=255)
  edge=mask.filter(ImageFilter.MaxFilter(13))
  g.tint_over(out,g.shifted(edge,2,4).filter(ImageFilter.GaussianBlur(1)),deep,.80)
  g.tint_over(out,edge,pearl if j==1 else deep)
  bounds=mask.getbbox();glyph=Image.new('RGBA',(bounds[2]-bounds[0],bounds[3]-bounds[1]),deep if j==1 else pearl)
  glyph.putalpha(mask.crop(bounds));layer,pad=coat(glyph,'type')
  out.alpha_composite(layer,(bounds[0]-pad,bounds[1]-pad))
 return out.convert('RGB')

def build():
 global STATE,PRIMARY
 patterns=json.loads((r.O/'checks/hook-patterns.json').read_text())
 originals=(r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,r.letters,m.letters)
 try:
  r.Layout.photo=photo;r.Layout.save=g.save_review;r.MATERIAL_COMPOSITOR=composite
  ImageDraw.Draw=CleanDraw;r.grain=m.grain=lambda im,*a,**kw:im
  r.letters=m.letters=crisp_letters;g.ROUNDED=True;g.coat=coat
  for ident in ['3886','3889']:
   color=json.loads((r.O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
   PRIMARY=ImageColor.getrgb(color) if isinstance(color,str) else tuple(color)
   frame=g.OPEN(r.O/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
   for v,_,_ in VARIANTS:
    STATE=int(v)
    if STATE==0:
     for kind in ['art','hook']:
      with g.OPEN(r.O/'glossy-demo'/f'{ident}-3-{kind}-round.jpg') as im:
       im.save(OUT/f'{ident}-{v}-{kind}.jpg',quality=95)
     continue
    g.MODE=2;g.STATS={}
    if STATE==5:
     # Replace only the layout background constructor, never photo pixels.
     original_new=Image.new
     def new(mode,size,color=0):
      if mode=='RGBA' and size==(720,1280) and color==r.paint('#eddb46' if ident=='3886' else '#fff5e9'):
       color=mix(PRIMARY,(255,255,255),.91)
      return original_new(mode,size,color)
     Image.new=new
    try:
     m.pop() if ident=='3886' else clean_cards()
    finally:
     if STATE==5:Image.new=original_new
    art=g.LAST.copy();g.MODE=0
    hook=colored_hook(art,frame,ident) if STATE>=3 else g.strong_hook(op.compose(art,frame,0,ident,[color],op.preferred_treatment(color,patterns[ident])),ident,color,patterns[ident])
    art.save(OUT/f'{ident}-{v}-art.jpg',quality=95)
    hook.save(OUT/f'{ident}-{v}-hook.jpg',quality=95)
    print(ident,v,flush=True)
 finally:
  r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,r.letters,m.letters=originals
  g.coat=ORIGINAL_COAT
 for ident in ['3886','3889']:
  sheet=Image.new('RGB',(6*240,455),'#f4f2ef');d=ImageDraw.Draw(sheet)
  for i,(v,title,_) in enumerate(VARIANTS):
   d.text((i*240+8,8),v+' '+title,font=r.font('jp',16),fill='#232334')
   with Image.open(OUT/f'{ident}-{v}-hook.jpg') as im:sheet.paste(im.resize((240,427)),(i*240,28))
  sheet.save(OUT/f'{ident}-comparison.jpg',quality=93)
 expected=[OUT/f'{ident}-{v}-{kind}.jpg' for ident in ['3886','3889'] for v,_,_ in VARIANTS for kind in ['art','hook']]
 for path in expected:
  with Image.open(path) as im:assert im.size==(720,1280);im.verify()
 (OUT/'verification.json').write_text(json.dumps({'images':len(expected),'dimensions':[720,1280],'reviewOnly':True,'variants':VARIANTS,'templates':['3886','3889'],'motion':False},ensure_ascii=False,indent=2))
 (OUT/'data.json').write_text(json.dumps(VARIANTS,ensure_ascii=False))

if __name__=='__main__':build()
