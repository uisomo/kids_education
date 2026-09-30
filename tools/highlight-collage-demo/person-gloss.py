"""Photo-only clear-coat review using existing cutout alpha and face landmarks."""
import importlib.util
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
spec=importlib.util.spec_from_file_location('lab',Path(__file__).with_name('glossy-lab.py'))
lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
r,m,g,op=lab.r,lab.m,lab.g,lab.op
OUT=lab.OUT/'person-gloss';OUT.mkdir(exist_ok=True)
IDENT='3886';LEVEL=0;INDEX=0

def protection(p,idx):
 w,h=p.size;crop=r.crop_box(idx,'waist' if IDENT=='3886' and INDEX%2 else 'chest',w/h)
 fx,fy,fw,fh=r.PARTS[idx]['faces'][0]['bounds']
 coords=[(fx-fw*.22-crop[0])*w/(crop[2]-crop[0]),(fy-fh*.22-crop[1])*h/(crop[3]-crop[1]),(fx+fw*1.22-crop[0])*w/(crop[2]-crop[0]),(fy+fh*1.22-crop[1])*h/(crop[3]-crop[1])]
 face=Image.new('L',p.size);g.DRAW(face).ellipse(coords,fill=230)
 face=face.filter(ImageFilter.GaussianBlur(max(5,w*.04)))
 return ImageChops.multiply(p.getchannel('A'),ImageChops.invert(face))

def composite(canvas,p,xy):
 global INDEX
 ids=m.IDS if IDENT=='3886' else [19,43,50,47,23,52,21]
 idx=ids[INDEX];p=lab.tone_photo(p);protect=protection(p,idx);INDEX+=1
 if LEVEL:
  yy,xx=np.mgrid[:p.height,:p.width];nx=xx/p.width;ny=yy/p.height
  if LEVEL==3:shine=np.full(p.size[::-1],.34)
  else:
   # A broad diagonal reflection plus a narrow soft highlight, on the coating.
   d=nx+.32*ny
   shine=(.16*np.exp(-((d-.37)/.24)**2)+.13*np.exp(-((d-.25)/.035)**2))*(.65 if LEVEL==1 else 1.2)
  shine=np.uint8(np.clip(shine,0,.4)*255)
  alpha=p.getchannel('A')
  mask=ImageChops.multiply(Image.fromarray(shine),protect)
  g.tint_over(p,mask,'white');p.putalpha(alpha)
 layer,pad=lab.ORIGINAL_COAT(p,'photo');canvas.alpha_composite(layer,(int(xy[0])-pad,int(xy[1])-pad))

def build():
 global IDENT,LEVEL,INDEX
 originals=(r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,r.letters,m.letters)
 checks=[]
 try:
  r.Layout.photo=lab.photo;r.Layout.save=g.save_review;r.MATERIAL_COMPOSITOR=composite
  ImageDraw.Draw=lab.CleanDraw;r.grain=m.grain=lambda im,*args,**kw:im
  r.letters=m.letters=lab.crisp_letters;g.ROUNDED=True;lab.STATE=1
  patterns=json.loads((r.O/'checks/hook-patterns.json').read_text())
  for IDENT in ['3886','3889']:
   color=json.loads((r.O/'checks'/f'{IDENT}-layout.json').read_text())['hookColors'][0]
   frame=g.OPEN(r.O/'frames'/f'{IDENT}.jpg').crop((546,875,699,1147))
   bases={}
   for LEVEL in range(4):
    INDEX=0;g.MODE=2;g.STATS={}
    m.pop() if IDENT=='3886' else lab.clean_cards()
    art=g.LAST.copy();g.MODE=0
    hook=g.strong_hook(op.compose(art,frame,0,IDENT,[color],op.preferred_treatment(color,patterns[IDENT])),IDENT,color,patterns[IDENT])
    for kind,im in [('art',art),('hook',hook)]:
     if LEVEL==0:
      bases[kind]=im.copy()
      with g.OPEN(lab.OUT/f'{IDENT}-1-{kind}.jpg') as control:
       diff=np.abs(np.asarray(control,dtype=float)-np.asarray(im,dtype=float)).mean()
       checks.append({'template':IDENT,'kind':kind,'baselineMeanDifferenceFromJPEG':round(float(diff),3)})
       assert diff<3, 'Baseline must match selected variant 1'
     if LEVEL<3:im.save(OUT/f'{IDENT}-{LEVEL}-{kind}.jpg',quality=96)
     else:
      a=np.asarray(bases[kind],dtype=float);b=np.asarray(im,dtype=float)
      denom=255-a
      alpha=np.clip(np.sum((b-a)*denom,axis=2)/np.maximum(np.sum(denom**2,axis=2),1),0,1)
      overlay=Image.new('RGBA',im.size,'white');overlay.putalpha(Image.fromarray(np.uint8(alpha*255)))
      overlay.save(OUT/f'{IDENT}-{kind}-reflection.png')
    print(IDENT,LEVEL,flush=True)
 finally:
  r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,r.letters,m.letters=originals
 for path in OUT.glob('*.jpg'):
  with Image.open(path) as im:assert im.size==(720,1280);im.verify()
 (OUT/'verification.json').write_text(json.dumps({'reviewOnly':True,'baselineChecks':checks,'staticImages':12,'reflectionMasks':4,'faceProtection':'Feathered detected face ellipse reduces reflection; original subject alpha retained.'},ensure_ascii=False,indent=2))

if __name__=='__main__':build()
