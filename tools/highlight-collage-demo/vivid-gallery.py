"""Generated whole-layout review, isolated from approved plates/videos.
Dual black/white backdrop passes recover the exact foreground matte, including
interleaved type, crop masks, rotations and foreground geometric occlusion.
No synthetic highlights, bevels, reflections or photo sheen are introduced.
"""
import importlib.util, inspect, json, sys, colorsys, hashlib
from contextlib import contextmanager
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageColor, ImageChops
import refine as r
import more as m
import additions as a
import opening as op
spec=importlib.util.spec_from_file_location('review',Path(__file__).with_name('glossy-demo.py'))
g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
OUT=r.O/'glossy-lab/vivid-gallery'
PHASE='normal';DEPTH=0;LAST=None;META=None;IDENT=''
NEW=Image.new;DRAW=ImageDraw.Draw;LETTERS=r.letters;PHOTO=r.Layout.photo;INIT=r.Layout.__init__
TONES={'3897':'#167dc5','3885':'#c22e70'}
@contextmanager
def content():
 global DEPTH
 DEPTH+=1
 try:yield
 finally:DEPTH-=1

def rgba(c):
 if isinstance(c,str):return ImageColor.getcolor(c,'RGBA')
 if isinstance(c,tuple):return c if len(c)==4 else (*c,255)
 return (c,c,c,255)

def matte_color(c):
 if c is None:return None
 if PHASE not in ('black','white') or DEPTH:return c
 alpha=rgba(c)[3];v=0 if PHASE=='black' else 255
 return (v,v,v,alpha)

def new(mode,size,color=0):
 if mode=='RGBA' and color!=0:color=matte_color(color)
 return NEW(mode,size,color)

class Draw:
 def __init__(self,im,*args,**kw):self.im=im;self.d=DRAW(im,*args,**kw)
 def __getattr__(self,name):
  original=getattr(self.d,name)
  def call(*args,**kw):
   if self.im.mode=='RGBA' and not DEPTH:
    if name=='polygon' and args and len(args[0])==20 and isinstance(args[0][0],(tuple,list)):
     points=args[0];xs=[p[0] for p in points];ys=[p[1] for p in points]
     return star(self.im,(max(xs)+min(xs))/2,(max(ys)+min(ys))/2,max(max(xs)-min(xs),max(ys)-min(ys))/2,kw.get('fill','#ffffff'))
    # The rejected screenprint/halftone texture never re-enters the candidates.
    if name=='ellipse' and args and len(args[0])==4:
     box=args[0]
     if isinstance(box[0],(int,float)) and max(box[2]-box[0],box[3]-box[1])<3:return
    if PHASE in ('black','white'):
     for k in ('fill','outline'):
      if k in kw:kw[k]=matte_color(kw[k])
   return original(*args,**kw)
  return call

def init(self,ident,variant=False):
 global IDENT
 IDENT=ident;INIT(self,ident,variant)
 # Keep selected hue; strengthen chromatic planes before generation.
 for key,value in list(r.PAINT_MAP.items()):
  rgb=ImageColor.getrgb(value);h,s,v=colorsys.rgb_to_hsv(*(c/255 for c in rgb))
  if s>.14 and max(rgb)-min(rgb)>30:
   r.PAINT_MAP[key]='#%02x%02x%02x'%tuple(round(c*255) for c in colorsys.hsv_to_rgb(h,max(s,.65),max(v,.70)))
 if ident in TONES:
  h,_,_=colorsys.rgb_to_hsv(*(c/255 for c in ImageColor.getrgb(TONES[ident])))
  for key in r.PAINT_MAP:
   rgb=ImageColor.getrgb(key);lum=sum(c*w for c,w in zip(rgb,(.2126,.7152,.0722)))/255
   r.PAINT_MAP[key]='#%02x%02x%02x'%tuple(round(c*255) for c in colorsys.hsv_to_rgb(h,.82 if lum<.9 else .025,.12+lum*.86))
 self.im=Image.new('RGBA',(720,1280),r.paint('#c7c3ba'))

def letters(im,*args,**kw):
 with content():
  if PHASE=='seed':return LETTERS(NEW('RGBA',im.size),*args,**kw)
  return LETTERS(im,*args,**kw)

def photo(self,*args,**kw):
 kw.update(mono=False,tint=None,wash=0)
 # Preserve explicit selective tonal treatments (3903/3907); normal photos stay RGB.
 original_bg=kw.get('background','black')
 kw['background']='transparent'
 if PHASE=='seed':kw['outlineColor']=None
 with content():result=PHOTO(self,*args,**kw)
 if PHASE=='seed' and original_bg!='transparent':
  x,y,w,h=args[2];color=r.paint('#080808') if original_bg=='black' else original_bg
  if IDENT in TONES:color=TONES[IDENT]
  panel=NEW('RGBA',(w,h),color)
  if kw.get('mask') is not None:panel.putalpha(kw['mask'])
  if kw.get('tilt'):panel=panel.rotate(kw['tilt'],expand=True,resample=Image.Resampling.BICUBIC)
  self.im.alpha_composite(panel,(x,y))
 return result

def composite(canvas,p,xy):
 if PHASE=='seed':return
 if IDENT in TONES:
  alpha=p.getchannel('A');col=ImageColor.getrgb(TONES[IDENT]);dark=tuple(round(c*.17) for c in col);light=tuple(round(c*.2+255*.8) for c in col)
  p=ImageOps.colorize(ImageOps.grayscale(p),dark,light).convert('RGBA');p.putalpha(alpha)
 canvas.alpha_composite(p,xy)

def save(self,name):
 global LAST,META
 LAST=self.im.copy();META={'id':self.ident,'name':name,'slots':self.slots,'typography':self.types,'colors':dict(r.PAINT_MAP),'tone':TONES.get(self.ident)}
 return META

def guarded(fn):
 def call(*args,**kw):
  with content():return fn(*args,**kw)
 return call

def adapt(fn,replacements=(),blocks=()):
 source=inspect.getsource(fn)
 for old,newtext in replacements:
  assert old in source,(fn.__name__,old)
  source=source.replace(old,newtext)
 for start,end in blocks:
  i=source.index(start);j=source.index(end,i)
  begin=source.rfind('\n',0,i)+1;indent=source[begin:i]
  block=source[begin:j]
  source=source[:begin]+indent+'with content():\n'+''.join(' '+line if line.strip() else line for line in block.splitlines(True))+source[j:]
 ns=dict(fn.__globals__);ns.update(content=content,composite=composite,seed_only=lambda:PHASE=='seed',star=star)
 exec(compile(source,'<vivid-'+fn.__name__+'>','exec'),ns)
 return ns[fn.__name__]

STAR=Image.open(r.O/'glossy-lab/shape-gloss/generated/star.png').convert('RGBA')
STAR=STAR.crop(STAR.getchannel('A').point(lambda v:255 if v>180 else 0).getbbox())
def star(im,x,y,radius,color,outline=False):
 # Recolor a saved generated asset; its material is never synthesized in code.
 c=ImageColor.getrgb(color) if isinstance(color,str) else color[:3]
 h,s,_=colorsys.rgb_to_hsv(*(v/255 for v in c));asset=STAR.copy();alpha=asset.getchannel('A')
 hh,ss,vv=asset.convert('RGB').convert('HSV').split()
 asset=Image.merge('HSV',(hh.point(lambda _:round(h*255)),ss.point(lambda v:round(v*max(s,.05))),vv)).convert('RGBA');asset.putalpha(alpha)
 size=round(radius*2);asset=asset.resize((size,size),Image.Resampling.LANCZOS)
 # Generated stars are foreground assets, retained at their original z position.
 if PHASE=='seed':return
 im.alpha_composite(asset,(round(x-radius),round(y-radius)))

def install():
 Image.new=new;ImageDraw.Draw=Draw
 r.Layout.__init__=init;r.Layout.photo=photo;r.Layout.save=save;r.MATERIAL_COMPOSITOR=composite
 for mod in (r,m,a):mod.letters=letters;mod.grain=lambda im,*args,**kw:im
 m.star=a.star=star
 m.inset=guarded(m.inset)
 # Intercept the existing whole silhouette compositor, retaining its exact gaps.
 g.RENDERERS['3894']=adapt(r.silhouette,blocks=[("idx=19;crop=", " l.subjectMask=sil")])
 g.RENDERERS['3889']=adapt(r.cards,replacements=[("gray=ImageOps.autocontrast(ImageOps.grayscale(person),cutoff=1);person=ImageOps.colorize(gray,paint('#111111'),paint('#faf7f0')).convert('RGBA');person.putalpha(alpha)","person.putalpha(alpha)"),("l.im.alpha_composite(outline,(tx,ty))","composite(l.im,outline,(tx,ty))")],blocks=[("person=Image.open(A/f'full-person-{idx}.png')","  plane=Image.new")])
 # Split portrait has no auxiliary background, all final photo pieces use compositor.
 # Route the old direct foreground of 3901 through the same compositor.
 g.RENDERERS['3901']=adapt(r.warm,replacements=[("l.im.alpha_composite(back,(330,394))","composite(l.im,back,(330,394))"),("l.im.alpha_composite(p,(330,394))","composite(l.im,p,(330,394))")],blocks=[("idx=47;box="," l.slots.append")])
 for mod in (r,m,a):
  old=mod.character
  def character(l,*args,_old=old,**kw):
   if PHASE=='seed':return
   with content():return _old(l,*args,**kw)
  mod.character=character
 g.RENDERERS['3881']=adapt(r.layers,replacements=[("l.im.alpha_composite(Image.fromarray(arr,'RGBA'))","composite(l.im,Image.fromarray(arr,'RGBA'),(0,0))")])
 g.RENDERERS['3888']=adapt(m.contour,replacements=[("l.im.alpha_composite(darkness)","composite(l.im,darkness,(0,0))")],blocks=[("darkness=Image.new"," for idx,part,box")])
 g.RENDERERS['3903']=adapt(a.head_grid,replacements=[("l.im.alpha_composite(part,(xx,yy))","composite(l.im,part,(xx,yy))")])
 # A photo-filled glyph is foreground typography, excluded from generation.
 g.RENDERERS['3902']=adapt(a.type_portrait,replacements=[("l.im=grain(l.im,3,3902);return","l.im=Image.new('RGBA',(W,H),paper) if seed_only() else l.im;return")])
 # Round saved generated stars replace hand-drawn sharp stars at identical centers.
 g.RENDERERS['3879']=adapt(r.scrapbook,replacements=[("d.line(pts,fill=yellow,width=4)","star(l.im,x,y,r,yellow)")])
 g.RENDERERS['3901']=adapt(g.RENDERERS['3901']) if False else g.RENDERERS['3901']
 # The retained photo-in-glyph design is a foreground treatment, never generated.


def render(ident,phase):
 global PHASE
 PHASE=phase;g.RENDERERS[ident]();return LAST.copy(),META.copy()

def prompt(meta):
 ident=meta['id'];colors=list(dict.fromkeys(meta['colors'].values()))
 return f'''Use case: style-transfer. Generate a complete portrait glossy collage BACKGROUND for template {ident}. Image 1 is the EXACT flat layout target; image 2 is the accepted 3900 material reference ONLY. Preserve image 1's layout and colors, do not copy image 2's frames or shapes. This is a 720x1280 composition: preserve aspect ratio, exact element bounds, spacing, edges, and blank space. Set brand-appropriate vivid midtones first, then add shallow rounded glossy resin volume and restrained upper-left capsule reflections, deeper SAME-HUE edges and soft shadows. Preserve neutrals and negative space. Do not wash colored planes out with white; NO unintended pastel colors. No new panels or shapes. Sparse/empty references must stay sparse/empty: only a subtle material surface is required. Round star tips and valleys. NO TEXT, glyphs, numbers, handwriting, photos, people, faces or silhouettes. Every photograph and every text element will be composited at its original position afterward. Do not invent content in blank areas. Do not add large sparkles. Retain all crop apertures and geometry. {('Single-color tonal palette '+meta['tone']+' with deep same-hue shadows, neutral light areas; no second hue.') if meta['tone'] else ''} Render one full layout, not a contact sheet.'''

def prepare(ids):
 OUT.mkdir(exist_ok=True)
 for ident in ids:
  if ident=='3900':continue
  folder=OUT/ident;folder.mkdir(exist_ok=True)
  seed,meta=render(ident,'seed')
  if ident=='3895':
   # Face-anchored scribbles are foreground decoration, not generated background content.
   DRAW(seed).rectangle((240,379,479,757),fill=r.paint('#b4b594'))
  seed.convert('RGB').save(folder/'layout-reference.png')
  black,_=render(ident,'black');white,_=render(ident,'white');normal,_=render(ident,'normal')
  b=np.asarray(black.convert('RGB'),dtype=float);w=np.asarray(white.convert('RGB'),dtype=float)
  alpha=np.clip(1-np.median(w-b,axis=2)/255,0,1)
  rgb=np.divide(b,alpha[...,None],out=np.zeros_like(b),where=alpha[...,None]>.001)
  fg=Image.fromarray(np.uint8(np.clip(np.dstack((rgb,alpha*255)),0,255)))
  fg.save(folder/'foreground.png');normal.convert('RGB').save(folder/'flat-control.jpg',quality=96)
  meta['foregroundPixels']=int(np.count_nonzero(alpha>.01));meta['prompt']=prompt(meta)
  (folder/'metadata.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));(folder/'prompt.txt').write_text(meta['prompt'])
  print('prepared',ident,flush=True)

def compose(ids):
 patterns=json.loads((r.O/'checks/hook-patterns.json').read_text());report=[]
 for ident in ids:
  folder=OUT/ident;bg=folder/'generated-background.png'
  if ident=='3900':continue
  if not bg.exists():continue
  art=Image.open(bg).convert('RGBA').resize((720,1280),Image.Resampling.LANCZOS)
  art.alpha_composite(Image.open(folder/'foreground.png').convert('RGBA'))
  art.convert('RGB').save(folder/'art.jpg',quality=96)
  col=TONES.get(ident) or json.loads((r.O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
  frame=Image.open(r.O/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
  op.compose(art,frame,0,ident,[col],op.preferred_treatment(col,patterns[ident])).save(folder/'hook.jpg',quality=96)
  report.append(ident);print('composed',ident,flush=True)
 (OUT/'verification.json').write_text(json.dumps({'composed':report,'reviewOnly':True,'photoSheen':False,'generatedMaterial':True},indent=2))

if __name__=='__main__':
 ids=[x for x in sys.argv[1:] if x.isdigit()] or sorted(g.RENDERERS)
 if '--compose' in sys.argv:compose(ids)
 else:install();prepare(ids)
