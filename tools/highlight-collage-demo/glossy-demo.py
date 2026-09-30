"""Material-only review of all 35 code-native collage layouts.
Uses actual layer alpha, never RGB subject detection or a poster-wide gloss filter.
No production palette, approved Hook choice, or existing output is overwritten.
"""
from pathlib import Path
import json, html, sys, math
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageColor, ImageFont
import refine as r
import more as m
import additions as a
from opening import compose, preferred_treatment, hook_font, HOOK_TEXT

ROOT=r.O
OUT=ROOT/'glossy-demo'
OUT.mkdir(exist_ok=True)
RENDERERS={
 '3878':r.editorial,'3895':r.nine,'3885':r.manifesto,'3887':r.swiss,
 '3889':r.cards,'3894':r.silhouette,'3900':r.sketch,'3901':r.warm,
 '3879':r.scrapbook,'3880':r.stripe,'3881':r.layers,'3882':r.geometry,
 '3883':m.mosaic,'3884':m.jazz,'3886':m.pop,'3888':m.contour,
 '3890':m.map_page,'3891':m.fragments,'3892':m.portrait_mosaic,
 '3893':m.cinema,'3896':m.islands,'3897':m.six,'3898':m.split,
 '3899':m.tower,'3877':m.botanical,'3871':m.scatter,'3872':m.dense_rounds,
 '3873':m.grunge,'3870':m.pastel,'3902':a.type_portrait,'3903':a.head_grid,
 '3904':a.crowd,'3905':a.diagram,'3907':a.echoes,'3908':a.circle_portrait,
}
MODE=0
DRAW=ImageDraw.Draw
LAST=None
STATS={}
ROUNDED=False
ORIGINAL_LETTERS=r.letters
ORIGINAL_FONT=r.font
CACHED_FONT=lru_cache(maxsize=256)(ORIGINAL_FONT)
r.font=CACHED_FONT

@lru_cache(maxsize=64)
def rounded_font(n):
 return ImageFont.truetype(str(Path(__file__).parent/'fonts/MPLUSRounded1c-ExtraBold.ttf'),int(n))
OPEN=Image.open

@lru_cache(maxsize=64)
def decoded(path):
 im=OPEN(path);im.load();return im

def cached_open(path,*args,**kw):
 if not args and not kw and isinstance(path,(str,Path)) and ('assets-v2' in str(path) or 'characters' in str(path)):
  return decoded(str(path)).copy()
 return OPEN(path,*args,**kw)

def rounded_letters(im,s,xy,size,role='sans',*args,**kw):
 if not ROUNDED or size<45 or role in {'hand','script'}:
  return ORIGINAL_LETTERS(im,s,xy,size,role,*args,**kw)
 layer=Image.new('RGBA',im.size)
 r.font=lambda role,n:rounded_font(int(n))
 try:meta=ORIGINAL_LETTERS(layer,s,xy,size,role,*args,**kw)
 finally:r.font=CACHED_FONT
 box=layer.getbbox()
 if box:
  text=layer.crop(box)
  if MODE:
   text,pad=coat(text,'type');im.alpha_composite(text,(box[0]-pad,box[1]-pad))
  else:im.alpha_composite(layer)
 STATS['roundedHeadings']=STATS.get('roundedHeadings',0)+1
 return meta

def friendly_sketch(v=False):
 l=r.Layout('3900',v)
 base=ImageColor.getrgb(r.paint('#5264b3'));accent=r.paint('#f03e40')
 pale=tuple(round(c*.16+255*.84) for c in base)
 l.im=Image.new('RGBA',(720,1280),'#fffdf6');d=ImageDraw.Draw(l.im)
 d.rounded_rectangle((16,16,704,270),radius=38,fill=pale)
 d.rounded_rectangle((16,958,704,1264),radius=38,fill=pale)
 def rounded_mask(w,h,radius):
  mask=Image.new('L',(w,h));DRAW(mask).rounded_rectangle((0,0,w-1,h-1),radius=radius,fill=255);return mask
 l.photo(19,'eyes',(40,76,640,167),background='#fffdf6',mask=rounded_mask(640,167,28),wash=.06)
 l.photo(23,'face',(66,342,588,571),background='#fffdf6',mask=rounded_mask(588,571,40),wash=.04)
 l.photo(47,'eyes',(40,1015,640,179),background='#fffdf6',mask=rounded_mask(640,179,28),wash=.06)
 for text,xy,size,col in [('正拳突き',(38,23),46,base),('一番の技',(32,280),54,base),('どれですか？',(290,299),42,accent),('教えてください',(127,912),43,base),('正拳',(42,967),37,base),('2026.09.25',(442,1212),25,base)]:
  r.letters(l.im,text,xy,size,'hand',col)
 # Place friendly puffy motifs in the margins, never on pupils.
 for x,y,rad,c in [(659,313,24,accent),(38,714,19,base),(678,855,22,accent),(671,1240,16,base)]:
  points=[]
  for j in range(10):
   angle=-math.pi/2+j*math.pi/5;rr=rad if j%2==0 else rad*.53
   points.append((x+math.cos(angle)*rr,y+math.sin(angle)*rr))
  ImageDraw.Draw(l.im).polygon(points,fill=c)
 return l.save('明るい目元と顔・手書きの言葉・目を隠さない丸い星')

RENDERERS['3900']=friendly_sketch

def shifted(mask,x,y):
 out=Image.new('L',mask.size);out.paste(mask,(x,y));return out

def tint_over(im,mask,color,amount=1):
 layer=Image.new('RGBA',im.size,color)
 layer.putalpha(mask.point(lambda v:round(v*amount)))
 im.alpha_composite(layer)

def coat(source,kind):
 """Same upper-left light for all materials. All edges respect source alpha."""
 pad=18
 p=Image.new('RGBA',(source.width+pad*2,source.height+pad*2))
 p.alpha_composite(source,(pad,pad))
 mask=p.getchannel('A')
 # A narrow raised edge: image interiors are deliberately untouched for faces.
 radius=3 if kind=='photo' else 5
 smooth=mask.filter(ImageFilter.GaussianBlur(.8))
 top=ImageChops.subtract(smooth,shifted(smooth,radius,radius+1))
 bottom=ImageChops.subtract(smooth,shifted(smooth,-radius,-radius-1))
 base=Image.new('RGBA',p.size)
 shadow=shifted(mask,2,6 if kind=='photo' else 7).filter(ImageFilter.GaussianBlur(4))
 tint_over(base,shadow,'#191327',.24 if MODE<3 else .32)
 if kind in ('photo','type'):
  # A slim milky sticker rim, not an opaque white halo over the face.
  rim=mask.filter(ImageFilter.MaxFilter(5))
  tint_over(base,rim,'#fffdf7',.80)
 base.alpha_composite(p)
 tint_over(base,ImageChops.multiply(bottom,mask),'#24182c',.33)
 tint_over(base,ImageChops.multiply(top,mask),'white',.80)
 if kind=='shape':
  yy,xx=np.mgrid[:p.height,:p.width]
  ny=(yy-pad)/max(1,source.height);nx=(xx-pad)/max(1,source.width)
  # Curved lacquer reflection, with a clean edge and broad, quiet falloff.
  boundary=.27+.12*(nx-.3)**2
  shine=(.20*np.exp(-((ny-.10)/.20)**2)+.31*np.exp(-((ny-boundary)/.016)**2))
  shine*=np.clip(1-nx*.55,0,1)
  shine=np.uint8(np.clip(shine,0,.55)*255)
  tint_over(base,ImageChops.multiply(Image.fromarray(shine),mask),'white')
 return base,pad

def photo_composite(canvas,p,xy):
 if MODE<2:
  canvas.alpha_composite(p,xy);return
 layer,pad=coat(p,'photo')
 canvas.alpha_composite(layer,(int(xy[0])-pad,int(xy[1])-pad))
 STATS['photoLayers']=STATS.get('photoLayers',0)+1

class MaterialDraw:
 """Decorate filled code-native shapes at their original point in the layer order."""
 def __init__(self,im,*args,**kw):self.im=im;self.draw=DRAW(im,*args,**kw)
 def __getattr__(self,name):
  original=getattr(self.draw,name)
  if name not in ('rectangle','rounded_rectangle','ellipse','polygon'):return original
  def call(xy,*args,**kw):
   fill=kw.get('fill',args[0] if args else None)
   if not MODE or fill is None or self.im.mode!='RGBA' or self.im.size!=(720,1280):return original(xy,*args,**kw)
   col=ImageColor.getrgb(fill) if isinstance(fill,str) else fill
   if not isinstance(col,tuple) or max(col[:3])-min(col[:3])<28:return original(xy,*args,**kw)
   flat=list(xy)
   points=flat if isinstance(flat[0],(tuple,list)) else list(zip(flat[::2],flat[1::2]))
   xs=[p[0] for p in points];ys=[p[1] for p in points]
   bw,bh=max(xs)-min(xs),max(ys)-min(ys)
   if min(bw,bh)<24 or bw*bh>720*1280*.78:return original(xy,*args,**kw)
   # Derive exact alpha by replaying this shape only, not by color thresholding the poster.
   shape=Image.new('RGBA',self.im.size)
   if name=='rectangle':DRAW(shape).rounded_rectangle(xy,radius=min(20,min(bw,bh)*.12),**kw)
   else:getattr(DRAW(shape),name)(xy,*args,**kw)
   if name=='polygon':
    alpha=shape.getchannel('A').filter(ImageFilter.GaussianBlur(3))
    alpha=alpha.point(lambda v:max(0,min(255,(v-90)*3.4)))
    shape=Image.new('RGBA',shape.size,col);shape.putalpha(alpha)
   box=shape.getbbox()
   if box is None:return original(xy,*args,**kw)
   w,h=box[2]-box[0],box[3]-box[1]
   if min(w,h)<24 or w*h>720*1280*.78:return original(xy,*args,**kw)
   layer,pad=coat(shape.crop(box),'shape')
   self.im.alpha_composite(layer,(box[0]-pad,box[1]-pad))
   STATS['colorShapes']=STATS.get('colorShapes',0)+1
  return call

def save_review(self,name):
 global LAST
 LAST=self.im.convert('RGB')
 return {'template':self.ident,'name':name,'sources':[s['sourceFrame'] for s in self.slots]}

def strong_hook(im,ident,color,pattern):
 """Raise only colored Hook glyphs. The black middle line stays completely flat."""
 out=im.convert('RGBA');d=DRAW(out);size=130;f=hook_font(ident,size)
 while max(f.getlength(line) for line in HOOK_TEXT)>640:size-=1;f=hook_font(ident,size)
 for j,line in enumerate(HOOK_TEXT):
  if j==1:continue
  box=d.textbbox((0,0),line,font=f,stroke_width=7)
  x=(720-f.getlength(line))/2;y=610+(j-1)*(size+22)-(box[1]+box[3])/2
  mask=Image.new('L',out.size);DRAW(mask).text((x,y),line,font=f,fill=255)
  top=ImageChops.subtract(mask,shifted(mask,0,3))
  bottom=ImageChops.subtract(mask,shifted(mask,0,-3))
  tint_over(out,bottom,'#171717',.28);tint_over(out,top,'white',.7)
 return out.convert('RGB')

def generate():
 global MODE,LAST,STATS,ROUNDED
 patterns=json.loads((ROOT/'checks/hook-patterns.json').read_text())
 manifest=json.loads((ROOT/'manifest.json').read_text())['renders']
 wanted=set(sys.argv[1:]) or set(RENDERERS)
 report=[]
 oldsave=r.Layout.save;oldmaterial=r.MATERIAL_COMPOSITOR
 try:
  r.Layout.save=save_review;r.MATERIAL_COMPOSITOR=photo_composite;ImageDraw.Draw=MaterialDraw;Image.open=cached_open
  r.letters=m.letters=a.letters=rounded_letters
  for entry in manifest:
   ident=entry['id']
   if ident not in wanted:continue
   meta=json.loads((ROOT/'checks'/f'{ident}-layout.json').read_text())
   color=meta['hookColors'][0];pattern=patterns[ident]
   frame=Image.open(ROOT/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
   existing=[OUT/f'{ident}-{mode}-{kind}{suffix}.jpg' for suffix in ['', '-round'] for mode in range(4) for kind in ['art','hook','white']]+[OUT/f'{ident}-{kind}{suffix}-sheen.png' for suffix in ['', '-round'] for kind in ['art','hook','white']]
   if all(p.exists() for p in existing):
    report.append({'id':ident,'name':entry['name'],'pattern':pattern,'hookColor':color,'hueRotation':meta['palette']['hueRotation'],'layers':{'resumed':True}})
    print('resumed',ident,flush=True);continue
   stats={}
   for rounded in [False,True]:
    ROUNDED=rounded;suffix='-round' if rounded else ''
    plates={};hooks={};whitehooks={}
    for mode in range(4):
     MODE=mode;STATS={}
     if mode==0:LAST=Image.open(ROOT/'plates'/f'{ident}.jpg').convert('RGB')
     elif mode==3:LAST=plates[2].copy()
     else:RENDERERS[ident]()
     plates[mode]=LAST.copy();stats[str(mode)+suffix]=dict(STATS)
     MODE=0
     hook=compose(LAST,frame,0,ident,[color],preferred_treatment(color,pattern))
     if mode==3:hook=strong_hook(hook,ident,color,pattern)
     hooks[mode]=hook
     LAST.save(OUT/f'{ident}-{mode}-art{suffix}.jpg',quality=94)
     hook.save(OUT/f'{ident}-{mode}-hook{suffix}.jpg',quality=94)
     white={'fill':'#ffffff','outline':color,'shadow':'#171717'}
     white_hook=compose(LAST,frame,0,ident,[color],[white,preferred_treatment(color,pattern)[1],white])
     if mode==3:white_hook=strong_hook(white_hook,ident,color,pattern)
     whitehooks[mode]=white_hook
     white_hook.save(OUT/f'{ident}-{mode}-white{suffix}.jpg',quality=94)
    # Restrict moving reflection to the bright edge pixels introduced by coating.
    # For 3900 compare against its new uncoated layout to avoid sweeping across faces.
    baseline=plates[0]
    if ident=='3900':
     MODE=0;friendly_sketch();baseline=LAST
    for kind,images in [('art',plates),('hook',hooks),('white',whitehooks)]:
     compare=baseline if kind=='art' else compose(baseline,frame,0,ident,[color],preferred_treatment(color,pattern) if kind=='hook' else [white,preferred_treatment(color,pattern)[1],white])
     aa=np.asarray(images[3],dtype=float);bb=np.asarray(compare,dtype=float)
     # Only coherent, bright, low-chroma newly raised pixels receive a moving glint.
     delta=np.min(aa-bb,axis=2);chroma=np.max(aa,axis=2)-np.min(aa,axis=2)
     mask=np.uint8(np.clip((delta-22)*3,0,180)*(chroma<45)*(np.min(aa,axis=2)>180))
     if kind!='art':mask[834:1158,537:711]=0;mask[1208:]=0
     sheen=Image.new('RGBA',(720,1280),'white');sheen.putalpha(Image.fromarray(mask))
     sheen.save(OUT/f'{ident}-{kind}{suffix}-sheen.png')
   report.append({'id':ident,'name':entry['name'],'pattern':pattern,'hookColor':color,'hueRotation':meta['palette']['hueRotation'],'layers':stats})
   print('glossy',ident,flush=True)
 finally:
  ImageDraw.Draw=DRAW;Image.open=OPEN;r.Layout.save=oldsave;r.MATERIAL_COMPOSITOR=oldmaterial
  r.letters=m.letters=a.letters=ORIGINAL_LETTERS
 if wanted!=set(RENDERERS) and (OUT/'data.json').exists():
  prior={e['id']:e for e in json.loads((OUT/'data.json').read_text())}
  prior.update({e['id']:e for e in report});report=[prior[e['id']] for e in manifest if e['id'] in prior]
 (OUT/'verification.json').write_text(json.dumps({'templateCount':len(report),'variantsPerTemplate':4,'fontVariants':2,'staticImages':len(report)*24,'reviewOnly':True,'light':'upper left','photoInterior':'unchanged by gloss; 3900 has a separate friendly layout revision','templates':report},ensure_ascii=False,indent=2))
 return report

if __name__=='__main__':
 report=generate()
 (OUT/'data.json').write_text(json.dumps(report,ensure_ascii=False))
