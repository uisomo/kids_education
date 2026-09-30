"""3900 whole-background generation experiment: deterministic photo/text overlay."""
import importlib.util,sys,inspect
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
spec=importlib.util.spec_from_file_location('lab',Path(__file__).with_name('glossy-lab.py'));lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
r,g,op=lab.r,lab.g,lab.op
OUT=lab.OUT/'whole-gloss';OUT.mkdir(exist_ok=True)

def seed_photo(self,idx,part,box,**kw):
 x,y,w,h=box
 ImageDraw.Draw(self.im).rounded_rectangle((x,y,x+w,y+h),radius=28 if h<200 else 40,fill='white')
 return {}

def create_seed():
 photo,letters,save=r.Layout.photo,r.letters,r.Layout.save
 try:
  r.Layout.photo=seed_photo;r.letters=lambda *a,**k:None;r.Layout.save=g.save_review
  source=inspect.getsource(g.friendly_sketch)
  source=source.replace('pale=tuple(round(c*.16+255*.84) for c in base)','pale=base')
  namespace=dict(g.__dict__);exec(compile(source,'<vivid-reference>','exec'),namespace)
  namespace['friendly_sketch']();g.LAST.save(OUT/'3900-vivid-layout-reference.png')
 finally:r.Layout.photo,r.letters,r.Layout.save=photo,letters,save

def compose():
 vivid='--vivid' in sys.argv
 l=r.Layout('3900');l.im=Image.open(OUT/('3900-vivid-generated-background.png' if vivid else '3900-generated-background.png')).convert('RGBA').resize((720,1280),Image.Resampling.LANCZOS)
 photo,grain=r.Layout.photo,r.grain
 try:
  r.Layout.photo=lab.photo;r.grain=lambda im,*a,**kw:im
  def mask(w,h,radius):
   im=Image.new('L',(w,h));ImageDraw.Draw(im).rounded_rectangle((0,0,w-1,h-1),radius=radius,fill=255);return im
  l.photo(19,'eyes',(40,76,640,167),background='#fffdf6',mask=mask(640,167,28))
  l.photo(23,'face',(66,342,588,571),background='#fffdf6',mask=mask(588,571,40))
  l.photo(47,'eyes',(40,1015,640,179),background='#fffdf6',mask=mask(640,179,28))
 finally:r.Layout.photo,r.grain=photo,grain
 base=r.paint('#5264b3');accent=r.paint('#f03e40')
 if vivid:
  # Restore the fourth star omitted by generation, using a generated alpha asset.
  import colorsys
  star=Image.open(lab.OUT/'shape-gloss/generated/star.png').convert('RGBA');alpha=star.getchannel('A')
  bounds=alpha.point(lambda v:255 if v>180 else 0).getbbox();star=star.crop(bounds);alpha=star.getchannel('A')
  hsv=star.convert('RGB').convert('HSV');hh,ss,vv=hsv.split();hh=hh.point(lambda v:round(colorsys.rgb_to_hsv(221/255,68/255,70/255)[0]*255))
  star=Image.merge('HSV',(hh,ss,vv)).convert('RGBA');star.putalpha(alpha)
  l.im.alpha_composite(star.resize((32,32),Image.Resampling.LANCZOS),(655,1224))
 for text,xy,size,col in [('正拳突き',(38,23),46,base),('一番の技',(32,280),54,base),('どれですか？',(290,299),42,accent),('教えてください',(127,912),43,base),('正拳',(42,967),37,base),('2026.09.25',(442,1212),25,base)]:r.letters(l.im,text,xy,size,'hand',('#ffffff' if vivid and (xy[1]<76 or xy[1]>=958) else col))
 l.im.convert('RGB').save(OUT/('3900-vivid-composite-art.jpg' if vivid else '3900-composite-art.jpg'),quality=96)
 import json
 color=json.loads((r.O/'checks/3900-layout.json').read_text())['hookColors'][0];pattern=json.loads((r.O/'checks/hook-patterns.json').read_text())['3900']
 frame=Image.open(r.O/'frames/3900.jpg').crop((546,875,699,1147))
 op.compose(l.im,frame,0,'3900',[color],op.preferred_treatment(color,pattern)).save(OUT/('3900-vivid-composite-hook.jpg' if vivid else '3900-composite-hook.jpg'),quality=96)
if __name__=='__main__':compose() if '--compose' in sys.argv else create_seed()
