"""Glossy icon material on collage shapes; natural portraits, no photo sheen."""
import importlib.util, math, json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFilter,ImageChops,ImageColor
spec=importlib.util.spec_from_file_location('lab',Path(__file__).with_name('glossy-lab.py'));lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
r,m,g,op=lab.r,lab.m,lab.g,lab.op;a=g.a
OUT=lab.OUT/'shape-gloss';OUT.mkdir(exist_ok=True)
NEW=False
USE_ASSET=False
GENERATED=False
COUNTS={}

def round_polygon(points,amount=.24):
 result=[]
 for j,p in enumerate(points):
  prev=points[j-1];nxt=points[(j+1)%len(points)]
  start=((1-amount)*p[0]+amount*prev[0],(1-amount)*p[1]+amount*prev[1])
  end=((1-amount)*p[0]+amount*nxt[0],(1-amount)*p[1]+amount*nxt[1])
  for t in np.linspace(0,1,12):result.append(((1-t)**2*start[0]+2*t*(1-t)*p[0]+t*t*end[0],(1-t)**2*start[1]+2*t*(1-t)*p[1]+t*t*end[1]))
 return result

def icon_coat(source,kind):
 if kind!='shape':return lab.ORIGINAL_COAT(source,kind)
 w,h=source.size;pad=24;mask=source.getchannel('A');rgb=np.asarray(source.convert('RGB'),dtype=float)
 y,x=np.mgrid[:h,:w];ny=y/max(h-1,1);nx=x/max(w-1,1)
 # Saturated top-to-bottom body plus a soft upper-left bulge.
 lit=.23*np.exp(-(((nx-.28)/.65)**2+((ny-.2)/.52)**2))
 dark=np.clip((ny-.32)*.28,0,.20)
 rgb=rgb*(1-dark[:,:,None]);rgb=rgb+(255-rgb)*lit[:,:,None]
 body=Image.fromarray(np.uint8(np.clip(rgb,0,255))).convert('RGBA');body.putalpha(mask)
 # A rounded, inset darker perimeter; a restrained light rim, not metallic stripes.
 width=max(2,min(12,round(min(w,h)*.027)))
 def edge_filter(f):
  expanded=Image.new('L',(w+48,h+48));expanded.paste(mask,(24,24))
  return expanded.filter(f).crop((24,24,w+24,h+24))
 eroded=edge_filter(ImageFilter.MinFilter(width*2+1))
 edge=ImageChops.subtract(mask,eroded).filter(ImageFilter.GaussianBlur(max(.6,width*.28)))
 base=np.median(np.asarray(source.convert('RGB'))[np.asarray(mask)>200],axis=0)
 rim=tuple(int(c*.65) for c in base)
 g.tint_over(body,ImageChops.multiply(edge,mask),rim,.27)
 smooth=edge_filter(ImageFilter.GaussianBlur(max(.6,width*.4)))
 top=ImageChops.subtract(smooth,g.shifted(smooth,width,width))
 g.tint_over(body,ImageChops.multiply(top,mask),'white',.27)
 # Fit a capsule entirely within the upper-left interior, including a star's lobes.
 safe=np.asarray(mask)>240;best=None
 for cy in range(max(2,int(h*.16)),max(3,int(h*.46)),max(1,int(h*.015))):
  thick=max(2,round(min(w,h)*.065));ya=max(0,cy-thick//2);yb=min(h,cy+thick//2+1)
  cols=np.all(safe[ya:yb],axis=0);runs=[];start=None
  for xx in range(w):
   if cols[xx] and start is None:start=xx
   if start is not None and (not cols[xx] or xx==w-1):
    end=xx if not cols[xx] else xx+1
    if end-start>thick*2:runs.append((start,end))
    start=None
  for left,right in runs:
   left+=width*1.6;right-=width*1.6
   length=min(right-left,w*.29)
   if length>thick*2:
    score=length-.12*cy-.09*left
    if best is None or score>best[0]:best=(score,left,cy,length,thick)
 if best:
  _,left,cy,length,thick=best
  shine=Image.new('L',(w,h));g.DRAW(shine).rounded_rectangle((left,cy-thick/2,left+length,cy+thick/2),radius=thick/2,fill=215)
  shine=shine.filter(ImageFilter.GaussianBlur(max(.35,min(w,h)*.002)))
  g.tint_over(body,ImageChops.multiply(shine,mask),'white')
 out=Image.new('RGBA',(w+pad*2,h+pad*2));full=Image.new('L',out.size);full.paste(mask,(pad,pad))
 shadow=g.shifted(full,1,max(3,min(11,round(h*.025)))).filter(ImageFilter.GaussianBlur(max(2,min(8,min(w,h)*.03))))
 g.tint_over(out,shadow,'#29162e',.27);out.alpha_composite(body,(pad,pad))
 COUNTS['shapes']=COUNTS.get('shapes',0)+1
 return out,pad

class IconDraw(lab.CleanDraw):
 def __getattr__(self,name):
  original=super().__getattr__(name)
  if not NEW or name not in ('ellipse','rectangle','rounded_rectangle','polygon'):return original
  def call(xy,*args,**kw):
   fill=kw.get('fill',args[0] if args else None)
   if fill is None or self.im.mode!='RGBA' or self.im.size!=(720,1280):return original(xy,*args,**kw)
   col=ImageColor.getrgb(fill) if isinstance(fill,str) else fill
   if not isinstance(col,tuple) or (len(col)>3 and col[3]<255):return original(xy,*args,**kw)
   pts=list(xy);pts=pts if isinstance(pts[0],(tuple,list)) else list(zip(pts[::2],pts[1::2]))
   xs,ys=zip(*pts);w=max(xs)-min(xs);h=max(ys)-min(ys)
   if min(w,h)<18 or w*h>720*1280*.78:return original(xy,*args,**kw)
   if GENERATED:
    asset_name='star' if name=='polygon' and len(pts)>=10 else 'circle' if name=='ellipse' else 'rectangle'
    with g.OPEN(OUT/'generated'/f'{asset_name}.png') as asset:
     asset=asset.convert('RGBA');bounds=asset.getchannel('A').point(lambda x:255 if x>180 else 0).getbbox()
     asset=asset.crop(bounds).resize((max(1,round(w)),max(1,round(h))),Image.Resampling.LANCZOS)
     self.im.alpha_composite(asset,(round(min(xs)),round(min(ys))))
    COUNTS['generatedAssets']=COUNTS.get('generatedAssets',0)+1
    return
   if USE_ASSET and name=='ellipse' and tuple(xy)==(77,87,644,668):
    with g.OPEN(OUT/'icon-base-yellow.png') as asset:
     self.im.alpha_composite(asset.convert('RGBA').resize((int(w),int(h)),Image.Resampling.LANCZOS),(int(min(xs)),int(min(ys))))
    COUNTS['existingIconAssets']=COUNTS.get('existingIconAssets',0)+1
    return
   shape=Image.new('RGBA',self.im.size)
   if name=='polygon' and len(pts)>=10:
    if pts[0]==pts[-1]:pts=pts[:-1]
    g.DRAW(shape).polygon(round_polygon(pts),fill=col)
    COUNTS['roundedStars']=COUNTS.get('roundedStars',0)+1
   elif name in ('rectangle','rounded_rectangle'):
    g.DRAW(shape).rounded_rectangle((min(xs),min(ys),max(xs),max(ys)),radius=min(28,min(w,h)*.18),fill=col)
   else:getattr(g.DRAW(shape),name)(xy,*args,**kw)
   box=shape.getbbox()
   if box:
    layer,pad=icon_coat(shape.crop(box),'shape');self.im.alpha_composite(layer,(box[0]-pad,box[1]-pad))
  return call

oldstar=m.star

def star(im,x,y,rad,c,outline=False):
 if not NEW:return oldstar(im,x,y,rad,c,outline)
 # Both outline scribbles and spiky bursts become plump five-point stars.
 pts=[]
 for j in range(10):
  theta=-math.pi/2+j*math.pi/5;rr=rad if j%2==0 else rad*.52
  pts.append((x+math.cos(theta)*rr,y+math.sin(theta)*rr))
 ImageDraw.Draw(im).polygon(pts,fill=c)

def letters(*args,**kw):
 mode=g.MODE
 try:
  g.MODE=0
  return lab.crisp_letters(*args,**kw)
 finally:g.MODE=mode

def build():
 global NEW,COUNTS,USE_ASSET,GENERATED
 originals=(r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,a.grain,r.letters,m.letters,a.letters,m.star,g.coat)
 report=[]
 try:
  r.Layout.photo=lab.photo;r.Layout.save=g.save_review;r.MATERIAL_COMPOSITOR=lab.composite
  ImageDraw.Draw=IconDraw;r.grain=m.grain=a.grain=lambda im,*args,**kw:im
  r.letters=m.letters=a.letters=letters;m.star=star;g.ROUNDED=True;lab.STATE=1
  patterns=json.loads((r.O/'checks/hook-patterns.json').read_text())
  for ident in ['3900','3908','3872','3870','3889']:
   color=json.loads((r.O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
   frame=g.OPEN(r.O/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
   for variant in ([0,1,2,3] if ident=='3908' else [0,1,3] if ident=='3900' else [0,1]):
    NEW=variant>0;USE_ASSET=variant==2;GENERATED=variant==3
    g.MODE=2;g.STATS={};COUNTS={};g.coat=icon_coat if NEW else lab.ORIGINAL_COAT
    lab.clean_cards() if ident=='3889' else g.RENDERERS[ident]()
    art=g.LAST.copy();g.MODE=0
    hook=op.compose(art,frame,0,ident,[color],op.preferred_treatment(color,patterns[ident]))
    for kind,im in [('art',art),('hook',hook)]:im.save(OUT/f'{ident}-{variant}-{kind}.jpg',quality=96)
    if NEW:report.append({'id':ident,**COUNTS})
    print(ident,NEW,COUNTS,flush=True)
 finally:
  r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,a.grain,r.letters,m.letters,a.letters,m.star,g.coat=originals
 for file in OUT.glob('*.jpg'):
  with Image.open(file) as im:assert im.size==(720,1280);im.verify()
 (OUT/'verification.json').write_text(json.dumps({'images':26,'photoInteriorGloss':False,'textGloss':False,'templates':report},ensure_ascii=False,indent=2))

if __name__=='__main__':build()
