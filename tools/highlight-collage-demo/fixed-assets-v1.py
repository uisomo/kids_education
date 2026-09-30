"""Two layout-preserving asset samples, using generated raster material only."""
from pathlib import Path
from thumbnail_brand import branded_thumbnail
import importlib.util, inspect, json, colorsys, shutil
import numpy as np
from PIL import Image,ImageDraw,ImageColor
import refine as r
import more as m
import opening as op
BASE=Path(__file__).parent
spec=importlib.util.spec_from_file_location('brand',BASE/'brand-type.py');brand=importlib.util.module_from_spec(spec);spec.loader.exec_module(brand)
OUT=r.O/'glossy-lab/fixed-assets-v1'
TYPE=r.O/'glossy-lab/prototype/typography-v4'
oldfont=r.font;letters=brand.make_letters(r,oldfont)
for mod in (r,m):mod.letters=letters;mod.font=brand.font
LAST=None;META=None
def capture(self,name):
 global LAST,META
 LAST=self.im.copy();META={'id':self.ident,'slots':self.slots,'typography':self.types,'name':name}
 return META
r.Layout.save=capture

def thumbnail(ident,art):
 source=inspect.getsource(op.compose).replace("label=ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',16)","label=hook_font(ident,16)")
 ns=dict(op.__dict__);exec(source,ns)
 color=json.loads((r.O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
 patterns=json.loads((r.O/'checks/hook-patterns.json').read_text())
 frame=Image.open(r.O/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
 return branded_thumbnail(ns['compose'](art,frame,0,ident,[color],op.preferred_treatment(color,patterns[ident])))

def finish(ident,control,control_meta,metadata):
 folder=OUT/ident
 assert META['slots']==control_meta['slots'],ident+' photo placement/crop/mask changed'
 assert META['typography']==control_meta['typography'],ident+' typography changed between control and asset sample'
 allowed=Image.new('L',(720,1280));draw=ImageDraw.Draw(allowed)
 for asset in metadata['assets']:
  if ident=='3872':
   x,y,w,h=asset['bounds'];draw.rectangle((x-3,y-3,x+w+3,y+h+3),fill=255)
  else:draw.rectangle(asset['targetBoundsInclusive'],fill=255)
 changed=np.any(np.array(control)!=np.array(LAST),axis=2)
 assert not np.any(changed & (np.array(allowed)==0)),ident+' pixels outside the existing decoration changed'
 metadata['pixelsOutsideAssetBoundsUnchangedBeforeJPEG']=True
 control.convert('RGB').save(folder/'rounded-control.jpg',quality=96)
 LAST.convert('RGB').save(folder/'art.jpg',quality=96)
 thumb=thumbnail(ident,LAST);thumb.save(folder/'thumbnail.jpg',quality=96)
 shutil.copy2(folder/'art.jpg',TYPE/f'{ident}-art.jpg');shutil.copy2(folder/'thumbnail.jpg',TYPE/f'{ident}-thumbnail.jpg')
 metadata.update({'id':ident,'canvas':[720,1280],'font':'M PLUS Rounded 1c ExtraBold','photoSlotsUnchanged':True,'typographyUnchangedFromRoundedControl':True,'slots':META['slots'],'typography':META['typography'],'generationTool':'built-in image_gen','reviewOnly':True})
 (folder/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))

# 3872: preserve the original four centers/radii, rotations, ellipse masks and photo RGB.
m.dense_rounds();control=LAST.copy();control_meta=META
star=Image.open(OUT/'3872/generated-outline-star.png').convert('RGBA')
box=star.getchannel('A').point(lambda n:255 if n>128 else 0).getbbox();star=star.crop(box)
assert star.getchannel('A').getpixel((star.width//2,star.height//2))==0
assets=[]
def rounded_star(im,x,y,radius,color,outline=False):
 target=ImageColor.getrgb(color);h,s,_=colorsys.rgb_to_hsv(*(c/255 for c in target))
 hh,ss,vv=star.convert('RGB').convert('HSV').split();alpha=star.getchannel('A')
 item=Image.merge('HSV',(hh.point(lambda _:round(h*255)),ss.point(lambda n:round(n*s)),vv)).convert('RGBA');item.putalpha(alpha)
 size=radius*2;item=item.resize((size,size),Image.Resampling.LANCZOS)
 im.alpha_composite(item,(x-radius,y-radius))
 name=f'star-{len(assets)+1}.png';item.save(OUT/'3872'/name)
 assets.append({'file':name,'anchor':[x,y],'bounds':[x-radius,y-radius,size,size],'alpha':True,'layer':'after photos, before handwritten title','color':color})
m.star=rounded_star;m.dense_rounds()
finish('3872',control,control_meta,{'method':'individual generated hollow stars','assets':assets,'centerTransparent':True,'prompt':'prompt.txt','reference':'original star centers from more.dense_rounds'})

# 3887: whole-background generation drifted; extract its material and use exact target bounds.
r.swiss();control=LAST.copy();control_meta=META
generated=Image.open(OUT/'3887/generated-whole-background.png').convert('RGB').resize((720,1280),Image.Resampling.LANCZOS)
targets=[(164,42,410,354),(432,378,684,684),(164,781,410,1088)]
search=[(100,0,425,360),(415,330,720,670),(100,720,425,1100)]
tiles=[];assets=[]
bg=Image.new('RGB',(720,1280),r.paint('#e6e7e9'))
for j,(rect,roi) in enumerate(zip(targets,search)):
 patch=generated.crop(roi);a=np.array(patch,dtype=np.int16)
 mask=Image.fromarray(np.uint8((a[:,:,0]-a[:,:,1]>50)&(a[:,:,2]-a[:,:,1]>50))*255)
 b=mask.getbbox();assert b
 actual=[roi[0]+b[0],roi[1]+b[1],roi[0]+b[2],roi[1]+b[3]]
 x,y,x2,y2=rect;tile=generated.crop(actual).resize((x2-x+1,y2-y+1),Image.Resampling.LANCZOS)
 tile.save(OUT/'3887'/f'plane-{j+1}.png');tiles.append((tile,(x,y)));bg.paste(tile,(x,y))
 assets.append({'file':f'plane-{j+1}.png','generatedBoundsNormalized':actual,'targetBoundsInclusive':rect,'anchor':[x,y],'size':tile.size,'alpha':False,'layer':'behind all photos and type'})
bg.save(OUT/'3887/background-aligned.png')
source=inspect.getsource(r.swiss)
old="d.rectangle((164,42,410,354),fill=red);d.rectangle((432,378,684,684),fill=red);d.rectangle((164,781,410,1088),fill=red)"
assert old in source
source=source.replace(old,"\n for tile,xy in ASSET_TILES:l.im.paste(tile,xy)\n d=ImageDraw.Draw(l.im)")
ns=dict(r.__dict__);ns['ASSET_TILES']=tiles;exec(source,ns);ns['swiss']()
finish('3887',control,control_meta,{'method':'whole background rejected for geometry; individual planes aligned to exact original bounds','assets':assets,'prompt':'prompt.txt','references':['../../vivid-gallery/3887/layout-reference.png','../../whole-gloss/3900-vivid-generated-background.png'],'palette':{'main':'#d936e4','light':'#ee65f5','dark':'#8d1796'},'alignedBackground':'background-aligned.png'})
print('3872 / 3887: generated material composited; original photo and text metadata unchanged')
