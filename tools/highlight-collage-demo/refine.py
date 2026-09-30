"""Reference-specific layouts using detected anatomical regions, never text distortion.
Run after build.py. Reference 3895 is one nine-panel composition.
"""
from pathlib import Path
import json,math,random
import numpy as np
from PIL import ImageColor,Image,ImageFont,ImageDraw,ImageOps,ImageFilter,ImageEnhance,ImageChops
from palette import rotate_palette,bright_palette,BRAND_BRIGHT,BASE_ROLES,hook_base
O=Path(__file__).resolve().parents[2]/'docs/highlight-collage-demo';A=O/'assets-v2';W,H=720,1280
PARTS={r['frame']:r for r in json.loads((A/'parts.json').read_text())['frames']}
F={
 'jplight':('/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',0),
 'hand':(str(Path(__file__).parent/'fonts/yomogi/Yomogi-Regular.ttf'),0),
 'ultranarrow':(str(Path(__file__).parent/'fonts/SixCaps.ttf'),0),
 'light':('/System/Library/Fonts/HelveticaNeue.ttc',7),
 'sans':('/System/Library/Fonts/HelveticaNeue.ttc',0),
 'bold':('/System/Library/Fonts/HelveticaNeue.ttc',9),
 'serif':('/System/Library/Fonts/ヒラギノ明朝 ProN.ttc',0),
 'jp':('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',0),
 'script':('/System/Library/Fonts/Supplemental/Brush Script.ttf',0),
 'rounded':('/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf',0),
}
RAW_COLORS=['#050505', '#080808', '#0a0a0c', '#0b0c0d', '#101010', '#101012', '#101111', '#101315', '#101616', '#111111', '#121313', '#131313', '#141016', '#141414', '#151515', '#151917', '#161315', '#161b20', '#17130e', '#171716', '#171917', '#171919', '#181818', '#1b1b1b', '#202222', '#202d30', '#203533', '#212026', '#228997', '#242322', '#247384', '#2496c2', '#24aeb7', '#25203d', '#252424', '#262323', '#263230', '#263eaa', '#29221c', '#299bc4', '#2c2330', '#353932', '#368bc0', '#38866a', '#3c8371', '#49a9b8', '#4db1c4', '#5264b3', '#63645d', '#696b69', '#6b6454', '#72835f', '#777f79', '#78bfd4', '#84817b', '#86a6aa', '#91b8bf', '#948b62', '#96383d', '#97a08b', '#99bbc7', '#a4a5a2', '#a5a52b', '#a7beb5', '#aed34b', '#af82cf', '#b2aba1', '#b44b58', '#b4b594', '#b75e36', '#b7a67c', '#b7d65a', '#b8442e', '#b85c47', '#bc4d59', '#bd2b1f', '#bea695', '#c6c6c1', '#c7c3ba', '#cc4315', '#ce711c', '#cfcbbd', '#d18c77', '#d19b45', '#d3d0c6', '#d4d4d2', '#d68d43', '#d88732', '#d8d1bd', '#d9c7b1', '#d9d9d3', '#dbc340', '#ddddcf', '#dea43e', '#dedfdd', '#e1cc3b', '#e2ddbb', '#e2ded5', '#e3c9b7', '#e49360', '#e4c438', '#e5e4dc', '#e6e7e9', '#e7d4a0', '#e7dcca', '#e7e0cd', '#e8a1bb', '#e8dfc8', '#e8e5dc', '#e9222a', '#e9262c', '#e9e3d5', '#e9e6df', '#ebe3cc', '#ebe5d3', '#ebe7dc', '#ec4051', '#ecd1a0', '#ece7df', '#ece9e1', '#ecebe5', '#eddb46', '#eee6d3', '#eeebe2', '#eeeee7', '#eeeeee', '#efbf31', '#efe8d8', '#efecdf', '#efefeb', '#f03e40', '#f0e8db', '#f1e5d4', '#f1eee7', '#f2f1ea', '#f3f1e7', '#f4f1e7', '#f5f5ef', '#f8f8f0', '#f9f8ec', '#faf7f0', '#fafaf6', '#fafaf7', '#fafaf8', '#fc7b18', '#fff5e9']
PAINT_MAP={}
DRAWN_TEXT=[]
# Optional material compositor for isolated review renders; production defaults are unchanged.
MATERIAL_COMPOSITOR=None
def paint(c):return PAINT_MAP.get(c,c)
def font(role,size):return ImageFont.truetype(F[role][0],int(size),index=F[role][1])
def letters(im,s,xy,size,role='sans',fill=paint('#111111'),maxwidth=None,angle=0,strokeColor=None,strokeWidth=0):
 DRAWN_TEXT.append(s)
 # Japanese content uses real Japanese glyphs, without stretching Latin fonts.
 if any(ord(c)>255 for c in s) and role not in {'hand','serif','jp','jplight'}:
  role='hand' if role=='script' else 'jplight' if role in {'light','sans'} else 'jp'
 # Only point size changes. Neither axes nor glyph outlines are distorted.
 f=font(role,size)
 while maxwidth and f.getlength(s)>maxwidth and size>8:size-=1;f=font(role,size)
 b=f.getbbox(s);pad=max(2,strokeWidth+1);layer=Image.new('RGBA',(max(1,b[2]-b[0]+pad*2),max(1,b[3]-b[1]+pad*2)))
 ImageDraw.Draw(layer).text((pad-b[0],pad-b[1]),s,font=f,fill=fill,stroke_width=strokeWidth,stroke_fill=strokeColor)
 if angle:layer=layer.rotate(angle,expand=True,resample=Image.Resampling.BICUBIC)
 im.alpha_composite(layer,tuple(map(int,xy)))
 return {'text':s,'font':f.getname(),'pointSize':size,'rotation':angle,'scaleX':1,'scaleY':1}
def grain(im,amount=9,seed=17):
 a=np.array(im.convert('RGB'),dtype=np.float32);n=np.random.default_rng(seed).normal(0,amount,a.shape[:2]);a+=n[:,:,None]
 out=Image.fromarray(np.uint8(np.clip(a,0,255))).convert('RGBA');out.putalpha(im.getchannel('A'));return out

def region(idx,part):
 r=PARTS[idx];f=max(r['faces'],key=lambda f:f['bounds'][2]*f['bounds'][3]);x,y,w,h=f['bounds'];lm=f['landmarks'];cx=x+w/2
 if part=='mouth':
  pts=lm['lips'];xs=[p[0] for p in pts];ys=[p[1] for p in pts]
  return [min(xs)-w*.2,min(ys)-h*.28,max(xs)+w*.2,max(ys)+h*.3]
 if part=='left-half':return [x-w*.05,y-h*.15,cx,y+h*1.1]
 if part=='right-half':return [cx,y-h*.15,x+w*1.05,y+h*1.1]
 if part=='vertical-eye':
  pts=lm['leftEye'];ex=sum(p[0] for p in pts)/len(pts)
  return [ex-w*.2,y-h*.12,ex+w*.2,y+h*1.04]
 if part=='eyes':
  pts=lm['leftEye']+lm['rightEye'];xs=[p[0] for p in pts];ys=[p[1] for p in pts]
  return [min(xs)-w*.17,min(ys)-h*.19,max(xs)+w*.17,max(ys)+h*.19]
 if part=='eyes-nose':return [x-w*.12,y+h*.08,x+w*1.12,y+h*.8]
 if part=='face':return [x-w*.35,y-h*.45,x+w*1.35,y+h*1.17]
 if part=='head':return [x-w*.45,y-h*.65,x+w*1.45,y+h*1.45]
 # Shoulder/hip landmarks drive body extents. Missing joints are a rejected candidate.
 b=r['bodies'][0] if r['bodies'] else {};shoulders=[v for k,v in b.items() if 'shoulder' in k]
 if len(shoulders)<2:raise ValueError(f'{idx}: no two shoulders')
 sx=[v[0] for v in shoulders];sy=max(v[1] for v in shoulders);left=min(min(sx)-w*.25,x-w*.4);right=max(max(sx)+w*.25,x+w*1.4)
 if part=='hands':
  wrists=[v for k,v in b.items() if 'wrist' in k or 'hand_joint' in k]
  if not wrists:raise ValueError(f'{idx}: no wrists')
  xx=[v[0] for v in wrists];yy=[v[1] for v in wrists]
  return [min(xx)-w*.7,min(yy)-h*.5,max(xx)+w*.7,max(yy)+h*.65]
 if part=='wide-chest':
  return [left-w*.9,y-h*.85,right+w*.9,sy+h*1.6]
 if part=='chest':bottom=sy+h*.7
 elif part=='waist':
  hips=[v[1] for k,v in b.items() if 'hip' in k or 'upLeg' in k]
  if not hips:raise ValueError(f'{idx}: no hips')
  bottom=max(hips)+h*.15
 else:raise ValueError(part)
 return [left,y-h*.55,right,bottom]

def crop_box(idx,part,ratio):
 x0,y0,x1,y1=region(idx,part);cx=(x0+x1)/2;cy=(y0+y1)/2;w=x1-x0;h=y1-y0
 # For half-face/vertical strips preserve the narrow horizontal span, expanding vertically.
 if part=='mouth':
  w=h*ratio;return [cx-w/2,cy-h/2,cx+w/2,cy+h/2]
 if part in ['left-half','right-half','vertical-eye']:
  h=w/ratio;return [cx-w/2,cy-h/2,cx+w/2,cy+h/2]
 # Enlarge to fit the anatomical region. Never center-crop away the requested face.
 if w/h<ratio:w=h*ratio
 else:h=w/ratio
 return [cx-w/2,cy-h/2,cx+w/2,cy+h/2]

class Layout:
 def __init__(self,ident,variant=False):
  global PAINT_MAP
  DRAWN_TEXT.clear()
  self.brandBase='#ffd166';self.randomHue=random.SystemRandom().uniform(0,360)
  # Keep the selected hue for a revision/retry; do not change composition and hue together.
  previous=O/'checks'/f'{ident}{"-color" if variant else ""}-layout.json'
  if previous.exists():self.randomHue=json.loads(previous.read_text())['palette']['hueRotation']
  transformed,self.paletteAngle=bright_palette([tuple(bytes.fromhex(c[1:])) for c in RAW_COLORS],self.randomHue)
  PAINT_MAP=dict(zip(RAW_COLORS,['#%02x%02x%02x'%c for c in transformed]))
  self.characters=[];self.variant=variant;self.ident=ident;self.im=Image.new('RGBA',(W,H),paint('#c7c3ba'));self.slots=[];self.types=[];self.used=set();self.subjectMask=Image.new('L',(W,H))
 def type(self,*args,**kw):
  behind=kw.pop('behindSubjects',True)
  layer=Image.new('RGBA',(W,H));meta=letters(layer,*args,**kw)
  if behind:layer.putalpha(ImageChops.multiply(layer.getchannel('A'),ImageOps.invert(self.subjectMask)))
  self.im.alpha_composite(layer);meta['layer']='behind-subject' if behind else 'between-person-layers';meta['afterPhotoCount']=len(self.slots);self.types.append(meta)
 def photo(self,idx,part,box,background='black',mono=False,mask=None,tilt=0,tint=None,tintStrength=.6,outlineColor=None,wash=0,flatColor=None):
  if idx in self.used:raise ValueError('Duplicate source photograph')
  self.used.add(idx);x,y,w,h=box;crop=crop_box(idx,part,w/h)
  p=Image.open(A/f'full-photo-{idx}.png').convert('RGBA')
  if background!='source':
   person=Image.open(A/f'full-person-{idx}.png').convert('RGBA');p=Image.new('RGBA',p.size,paint('#080808') if background=='black' else '#00000000' if background=='transparent' else background);p.alpha_composite(person)
  # Crop padding is a design background; never bring room pixels back when hidden.
  if mono:
   alpha=p.getchannel('A');gray=ImageOps.autocontrast(ImageOps.grayscale(p),cutoff=1);p=ImageOps.colorize(gray,paint('#050505'),paint('#e2ded5')).convert('RGBA');p.putalpha(alpha)
  p=p.transform((w,h),Image.Transform.EXTENT,tuple(crop),Image.Resampling.BICUBIC,fillcolor=paint('#080808') if background=='black' else '#00000000' if background=='transparent' else paint('#e8e5dc'))
  if tint:
   tone=ImageOps.colorize(ImageOps.grayscale(p),paint('#141016'),tint).convert('RGBA');tone.putalpha(p.getchannel('A'));p=Image.blend(p,tone,tintStrength)
  p=chromatic_tone(p,flatColor) if flatColor else grain(p,3.5,idx)
  if wash:
   a=p.getchannel('A');p=Image.blend(p,Image.new('RGBA',p.size,paint('#e7dcca')),wash);p.putalpha(a)
  if mask is not None:p.putalpha(ImageChops.multiply(p.getchannel('A'),mask))
  if tilt:p=p.rotate(tilt,expand=True,resample=Image.Resampling.BICUBIC)
  if outlineColor:
   back=Image.new('RGBA',p.size,outlineColor);back.putalpha(p.getchannel('A').filter(ImageFilter.MaxFilter(11)));self.im.alpha_composite(back,(x,y))
  if MATERIAL_COMPOSITOR:MATERIAL_COMPOSITOR(self.im,p,(x,y))
  else:self.im.alpha_composite(p,(x,y))
  subject=Image.open(A/f'full-person-{idx}.png').getchannel('A').transform((w,h),Image.Transform.EXTENT,tuple(crop),Image.Resampling.BICUBIC)
  if mask is not None:subject=ImageChops.multiply(subject,mask)
  if tilt:subject=subject.rotate(tilt,expand=True,resample=Image.Resampling.BICUBIC)
  plane=Image.new('L',(W,H));plane.paste(subject,(x,y));self.subjectMask=ImageChops.lighter(self.subjectMask,plane)
  landmarks={key:[[(px-crop[0])*w/(crop[2]-crop[0])+x,(py-crop[1])*h/(crop[3]-crop[1])+y] for px,py in val] for key,val in PARTS[idx]['faces'][0]['landmarks'].items()}
  self.slots.append({'sourceFrame':idx,'sourceTimeApprox':idx*.5+.233,'part':part,'destination':box,'sourceCrop':crop,'landmarksInCanvas':landmarks,'background':background,'clip':'mask' if mask else 'rectangle','rotation':tilt,'flatColor':flatColor,'z':len(self.slots)})
  return landmarks
 def fade(self,box,vertical=False):
  x,y,w,h=box;n=np.random.default_rng(x+y);axis=np.linspace(0,1,h if vertical else w);a=np.repeat(axis[:,None],w,axis=1) if vertical else np.repeat(axis[None,:],h,axis=0)
  # Stochastic ink gradient, like the reference's grainy printing dividers.
  alpha=np.uint8((n.random((h,w))>a)*210);l=Image.new('RGBA',(w,h),paint('#171716'));l.putalpha(Image.fromarray(alpha));self.im.alpha_composite(l,(x,y))
 def preview(self):
  d=ImageDraw.Draw(self.im);d.rectangle((375,1150,707,1270),fill=paint('#f1eee7'),outline=paint('#1b1b1b'),width=1)
  letters(self.im,'今日のハイライト',(386,1158),21,'jp')
  for j,(idx,secs) in enumerate([(19,3),(23,3),(48,4)]):
   # These are previews of scenes, intentionally allowed to reappear in main collage.
   p=Image.new('RGBA',(720,1280),paint('#080808'));p.alpha_composite(Image.open(A/f'full-person-{idx}.png').convert('RGBA'));p=p.transform((96,60),Image.Transform.EXTENT,tuple(crop_box(idx,'chest',96/60)),Image.Resampling.BICUBIC);self.im.paste(p,(387+j*103,1187))
   letters(self.im,f'{j+1} / {secs}s',(389+j*103,1250),13)
 def save(self,name):
  plate=O/'plates';plate.mkdir(exist_ok=True)
  self.im.convert('RGB').save(plate/f'{self.ident}{"-color" if self.variant else ""}.jpg',quality=96)
  self.im.convert('RGB').save(O/'frames'/f'{self.ident}{"-color" if self.variant else ""}.jpg',quality=96)
  # Palette-only variant: retain subject photos; color paper/ink is handled in template render later.

  metadata={'hookColors':[hook_base(self.ident,PAINT_MAP,self.paletteAngle)],'hookColorSource':BASE_ROLES[self.ident] or 'single independent color for neutral design','allRenderedText':list(DRAWN_TEXT),'palette':{'selection':'random hue per selection, retained on revision','brandBase':self.brandBase,'hueRotation':self.paletteAngle,'space':'HSV (logo vividness); OKLab only for neutral classification','relationship':'shared HSV hue rotation; monotonic S^0.6/V^0.4 brightening preserves ordering, not exact contrast; neutral colors unchanged'},'characters':self.characters,'textPolicy':{'alphabet':'replace with source-grounded Japanese','decorativeNumbers':'recording date 2026.09.25'},'template':self.ident,'name':name,'canvas':[W,H],'slots':self.slots,'typography':self.types,'privacyDemo':{'room':True,'face':getattr(self,'faceMasked',False),'background':'black design background; source room removed'},'fontTransform':'uniform font point size only','layoutRevision':3,'defaultLayerOrder':['background','shapes-and-text','cutout-person'],'cutoutDefault':True}
  (O/'checks'/f'{self.ident}{"-color" if self.variant else ""}-layout.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2))
  return metadata

def editorial(variant=False):
 l=Layout('3878',variant);d=ImageDraw.Draw(l.im);paper=paint('#c7c3ba');ink=paint('#141414')
 # Match reference: two headline columns, thin rules, asymmetrical photo/letter blocks.
 l.type('正拳',(12,10),64,'light',maxwidth=218);l.type('突き',(12,74),64,'light',maxwidth=218)
 l.type('空手',(240,10),62,'light',maxwidth=282);l.type('正拳突き',(242,74),51,'serif',maxwidth=280)
 d.line((231,12,231,127),fill=ink,width=1);d.line((527,12,527,127),fill=ink,width=1)
 l.type('2026.09.25',(541,18),19);l.type('09.25',(541,87),28,'serif')
 # Face is the explicit focal point, not a center crop of the torso.
 l.photo(19,'face',(98,145,371,408),mono=True)
 l.photo(43,'chest',(481,145,222,190),mono=True)
 l.type('正拳突き',(480,347),43,'serif',maxwidth=226)
 l.photo(21,'eyes',(481,433,222,117),mono=True)
 l.fade((12,145,76,408),vertical=True);l.fade((481,395,222,28))
 l.type('正拳突き',(12,563),40,'serif',maxwidth=275)
 l.photo(47,'head',(12,620,109,147),mono=True)
 l.fade((130,620,139,31));l.fade((130,678,139,42));l.fade((130,738,139,28))
 l.photo(50,'face',(283,564,225,200),mono=True)
 l.type('正拳',(525,568),64,'light',angle=-90);l.type('突き',(600,568),64,'light',angle=-90)
 l.type('正',(12,791),46,'serif');l.type('拳',(12,846),46,'serif');l.type('突',(12,901),46,'serif');l.type('き',(12,956),46,'serif')
 l.photo(46,'wide-chest',(86,850,185,144),mono=True);l.fade((85,785,186,47));l.fade((283,784,68,203),vertical=True)
 l.type('09.25',(362,789),28,'serif',angle=-90);l.type('正拳突き',(669,778),28,'serif',angle=-90)
 l.type('正拳突き',(300,1010),38,'serif',maxwidth=396)
 l.photo(52,'head',(307,1064,190,75),mono=True)
 l.photo(45,'chest',(12,1016,259,240),mono=True)
 l.type('25',(284,1160),58,'light');l.type('日',(297,1220),26,'serif')
 # One unified paper grain layer, plus heavier dither only in dividers.
 l.im=grain(l.im,3,3878)
 return l.save('映画の編集ページ／顔・眼・粒子・縦文字')

def nine(variant=False):
 l=Layout('3895',variant);l.im=Image.new('RGBA',(W,H),paint('#f0e8db'));d=ImageDraw.Draw(l.im)
 cw,ch=240,379
 raw=[paint('#2496c2'),paint('#e49360'),paint('#b8442e'),paint('#efe8d8'),paint('#97a08b'),paint('#72835f'),paint('#91b8bf'),paint('#b4b594'),paint('#86a6aa'),paint('#a7beb5'),paint('#263eaa'),paint('#aed34b'),paint('#b7d65a')]
 rotated=[tuple(bytes.fromhex(c[1:])) for c in raw]
 colors=dict(zip(raw,['#%02x%02x%02x'%c for c in rotated]));C=lambda c:colors[c]
 blue,orange,red,cream=[C(c) for c in raw[:4]]
 # Panel 1: ruled paper, jagged photo edge, scattered lettering.
 d.rectangle((0,0,239,378),fill=cream)
 for y in range(10,ch,15):d.line((0,y,240,y),fill=paint('#99bbc7'),width=1)
 mask=Image.new('L',(230,354));md=ImageDraw.Draw(mask);md.polygon([(0,0),(220,3),(215,65),(184,112),(197,165),(152,212),(124,253),(88,316),(0,349)],fill=255)
 l.photo(19,'head',(4,6,230,354),mask=mask)
 for j,c in enumerate('正拳突き空手'):l.type(c,(16+(j%3)*76,18+(j//3)*258),30,'script',red)
 # Panel 2: blue torn column + repeated bold labels.
 d.rectangle((240,0,479,378),fill=blue);d.polygon([(240,0),(278,0),(264,38),(276,121),(259,211),(280,294),(256,378),(240,378)],fill=cream)
 l.photo(43,'chest',(300,12,165,310),background=C(paint('#97a08b')),mono=False)
 for j in range(4):l.type('正拳',(248,45+j*26),28,'sans','#111',maxwidth=132)
 for j in range(4):l.type('突き',(393,256+j*26),28,'bold',blue,maxwidth=85)
 # Panel 3: tilted oval and thin cursive around the contour.
 d.rectangle((480,0,719,378),fill=orange);mask=Image.new('L',(187,259));ImageDraw.Draw(mask).ellipse((0,0,186,258),fill=255)
 l.photo(50,'head',(517,48,187,259),background=C(paint('#72835f')),mask=mask)
 l.type('正拳',(487,11),51,'script',cream,maxwidth=221);l.type('突き',(483,267),67,'script',cream,angle=15)
 l.type('25',(651,313),46,'light',cream)
 # Panel 4: cyan clouds, diagonal hatching, framed portrait.
 y=ch;d.rectangle((0,y,239,y+ch-1),fill=blue)
 for k in range(-ch,240,11):d.line((k,y+ch,k+ch,y),fill=cream,width=2)
 l.photo(21,'face',(20,y+78,202,235),background=C(paint('#91b8bf')),mono=False)
 for x,yy,r in [(10,y+95,44),(213,y+293,41),(27,y+336,40),(207,y+38,39)]:d.ellipse((x-r,yy-r,x+r,yy+r),fill=blue)
 l.type('正拳',(51,y+16),51,'script',cream,maxwidth=184);l.type('突き',(16,y+304),45,'bold',cream,maxwidth=214)
 # Panel 5: portrait full bleed. Scribble eyes and mouth anchored to landmarks.
 pts=l.photo(23,'face',(240,y,240,ch),background=C(paint('#b4b594')),mono=False);d=ImageDraw.Draw(l.im)
 for key in ['leftEye','rightEye']:
  a=pts[key];cx=sum(p[0] for p in a)/len(a);cy=sum(p[1] for p in a)/len(a)
  d.ellipse((cx-15,cy-29,cx+15,cy+24),outline=paint('#17130e'),width=4);d.ellipse((cx-3,cy-6,cx+5,cy+5),fill=paint('#17130e'))
 mouth=pts['lips'];mx=sum(p[0] for p in mouth)/len(mouth);my=sum(p[1] for p in mouth)/len(mouth)
 d.rectangle((mx-18,my-6,mx+17,my+32),outline=paint('#17130e'),width=4);d.line((mx,my+20,275,y+274,244,y+266),fill=paint('#17130e'),width=4)
 l.type('九月',(398,y+8),37,'script',paint('#17130e'));l.type('正拳',(251,y+310),35,'bold',paint('#17130e'),maxwidth=221)
 # Panel 6: orange-red cover, broad rounded masthead and small vertical caption.
 d.rectangle((480,y,719,y+ch-1),fill=red);l.photo(47,'head',(501,y+87,202,263),background=C(paint('#86a6aa')),mono=False)
 l.type('突き',(486,y+10),56,'rounded',cream,maxwidth=229);l.type('2026.09.25',(483,y+127),13,'sans',cream,angle=-90)
 # Panel 7: photo plus white diagonal with repeated alternating words.
 y=ch*2;l.photo(52,'chest',(0,y,240,ch),mono=True);d=ImageDraw.Draw(l.im);d.polygon([(0,y+ch),(0,y+181),(238,y+215)],fill=cream)
 for j in range(7):l.type('正 拳 突 き',(7,y+14+j*48),31,'sans',cream if j<4 else red,maxwidth=224)
 # Panel 8: royal-blue border, green handwritten title and repetition.
 d.rectangle((240,y,479,y+ch-1),fill=C(paint('#263eaa')));l.photo(44,'chest',(266,y+34,191,317),mono=False)
 l.type('正拳',(255,y+1),53,'script',C(paint('#aed34b')),maxwidth=225);l.type('突き',(349,y+37),35,'bold',cream,maxwidth=127)
 for j in range(5):l.type('正 拳 突 き',(247,y+172+j*40),22,'sans',C(paint('#b7d65a')),maxwidth=227)
 # Panel 9: cut-paper letters arranged in two uneven rows.
 l.photo(48,'head',(480,y,240,ch),background=C(paint('#a7beb5')),mono=False);d=ImageDraw.Draw(l.im)
 for j,c in enumerate('正拳突き空手'):
  xx=487+(j%3)*78;yy=y+14+(j//3)*62+(j%2)*9;d.polygon([(xx,yy+8),(xx+55,yy),(xx+61,yy+48),(xx+3,yy+55)],fill=cream)
  l.type(c,(xx+16,yy+8),36,'bold',red)
 l.type('正拳突き',(493,y+320),37,'jp',red,maxwidth=217)
 # The entire 3×3 is the template. Borders are shared; no independently selected cells.
 l.type('正拳突き',(24,1176),42,'jp',red,maxwidth=320);l.im=grain(l.im,4,3895);return l.save('9マスの編集コラージュ（全体で1テンプレート）')


def manifesto(variant=False):
 l=Layout('3885',variant);l.im=Image.new('RGBA',(W,H),paint('#efefeb'))
 # The source uses face fragments, not seven whole portraits.
 l.photo(19,'left-half',(16,66,187,448),mono=True)
 l.photo(21,'vertical-eye',(616,18,90,496),mono=True)
 l.type('正拳突き',(217,17),300,'ultranarrow',maxwidth=382)
 l.type('正拳突き',(219,250),34,'jp',maxwidth=382)
 l.photo(50,'mouth',(218,300,383,214),mono=True)
 l.type('09.25',(19,16),27,'jp');l.type('2026.09.25',(21,526),26,'bold',maxwidth=240)
 l.photo(23,'right-half',(17,574,282,310),mono=True)
 l.type('25.09.2026',(317,534),134,'ultranarrow',maxwidth=197)
 l.photo(43,'mouth',(316,708,195,321),mono=True)
 l.photo(47,'left-half',(526,708,179,484),mono=True)
 l.photo(52,'eyes-nose',(16,898,284,358),mono=True)
 l.type('正拳突き',(527,534),24,'jp',maxwidth=180)
 l.type('09.25',(527,578),24,'jp')
 l.type('2026.09.25',(527,620),20,'bold',maxwidth=180)
 l.type('正拳',(317,1050),30,'jp');l.type('突き',(317,1093),30,'jp')
 return l.save('顔の断片と縦長の文字／口元・半顔・縦の目元')

def swiss(variant=False):
 l=Layout('3887',variant);l.im=Image.new('RGBA',(W,H),paint('#e6e7e9'));d=ImageDraw.Draw(l.im)
 red=paint('#bc4d59');black=paint('#111111')
 d.rectangle((164,42,410,354),fill=red);d.rectangle((432,378,684,684),fill=red);d.rectangle((164,781,410,1088),fill=red)
 # Face close-up, half-face and hands have separate anatomical requirements.
 l.photo(50,'face',(431,42,253,312),background=paint('#d4d4d2'))
 l.photo(19,'left-half',(36,378,249,306),background=paint('#c6c6c1'))
 l.photo(23,'hands',(431,709,253,330),background=red)
 l.type('正拳',(35,49),100,'jp',maxwidth=370);l.type('突き',(35,170),100,'jp',maxwidth=370)
 l.type('正拳',(300,378),74,'bold',maxwidth=385);l.type('突き',(300,471),74,'bold',maxwidth=385)
 l.type('25',(486,593),91,'bold');l.type('日',(604,620),52,'jp')
 l.type('正拳突き',(37,704),91,'jp',maxwidth=652)
 l.type('2026',(259,812),91,'bold',maxwidth=407);l.type('09.25',(298,923),62,'bold',maxwidth=350)
 l.type('正拳突き',(37,930),22,'jp');l.type('09.25',(37,966),22,'jp')
 return l.save('色面と顔の切り取り／顔アップ・左半分・手元')


def cards(variant=False):
 l=Layout('3889',variant);l.im=Image.new('RGBA',(W,H),paint('#fff5e9'));d=ImageDraw.Draw(l.im)
 orange=paint('#fc7b18');paper=paint('#fff5e9')
 l.type('正拳突き',(49,29),68,'bold',maxwidth=633);l.type('正拳突き',(248,111),40,'jp')
 boxes=[(88,250,166,297),(269,165,253,233),(469,414,211,266),(42,567,210,294),(267,412,196,451),(468,697,164,297),(200,935,250,180)]
 ids=[19,43,50,47,23,52,21]
 # Paint all non-overlapping frames first. Portraits are composited later in z order.
 for j,(x,y,w,h) in enumerate(boxes):
  d.rectangle((x,y,x+w,y+h),fill=orange,outline=paint('#131313'),width=2)
  for yy in range(y+35,y+h,7):
   for xx in range(x+4,x+w-3,7):
    rr=.6+1.25*(yy-y)/h;d.ellipse((xx,yy,xx+rr,yy+rr),fill=paint('#29221c'))
  l.type('正拳' if j%2==0 else '突き',(x+7,y+10),49,'ultranarrow',paper,maxwidth=w-14)
 for j,((x,y,w,h),idx) in enumerate(zip(boxes,ids)):
  above=[41,62,30,39,57,46,23][j];side=[8,14,10,22,12,11,10][j]
  target=(x-side,y-above,w+2*side,h+above);tx,ty,tw,th=target
  crop=crop_box(idx,'chest',tw/th)
  person=Image.open(A/f'full-person-{idx}.png').convert('RGBA');alpha=person.getchannel('A')
  gray=ImageOps.autocontrast(ImageOps.grayscale(person),cutoff=1);person=ImageOps.colorize(gray,paint('#111111'),paint('#faf7f0')).convert('RGBA');person.putalpha(alpha)
  person=person.transform((tw,th),Image.Transform.EXTENT,tuple(crop),Image.Resampling.BICUBIC)
  person=grain(person,3,idx)
  # The frame rectangle clips the body; above it, only the detected head may cross the border.
  keep=Image.new('L',(tw,th));kd=ImageDraw.Draw(keep);kd.rectangle((side,above,side+w,above+h),fill=255)
  fx,fy,fw,fh=PARTS[idx]['faces'][0]['bounds']
  head=[fx-fw*.45,fy-fh*.7,fx+fw*1.45,fy+fh*1.4]
  head=[(head[0]-crop[0])*tw/(crop[2]-crop[0]),(head[1]-crop[1])*th/(crop[3]-crop[1]),(head[2]-crop[0])*tw/(crop[2]-crop[0]),(head[3]-crop[1])*th/(crop[3]-crop[1])]
  kd.rectangle((head[0],0,head[2],above+1),fill=255)
  # Side overflow only for the foreground shoulder/arm regions declared by this template.
  if j in [1,3,4]:kd.rectangle((0,above+int(h*.2),tw,above+int(h*.55)),fill=255)
  from PIL import ImageChops
  a=ImageChops.multiply(person.getchannel('A'),keep);person.putalpha(a)
  outline=Image.new('RGBA',person.size,paper);outline.putalpha(a.filter(ImageFilter.MaxFilter(7)))
  l.im.alpha_composite(outline,(tx,ty))
  if MATERIAL_COMPOSITOR:MATERIAL_COMPOSITOR(l.im,person,(tx,ty))
  else:l.im.alpha_composite(person,(tx,ty))
  plane=Image.new('L',(W,H));plane.paste(a,(tx,ty));l.subjectMask=ImageChops.lighter(l.subjectMask,plane)
  l.used.add(idx);l.slots.append({'sourceFrame':idx,'part':'chest','destination':[x,y,w,h],'sourceCrop':crop,'clip':'frame rectangle + detected head overflow + declared arm overflow','frameRect':[x,y,w,h],'personRect':list(target),'headRegionInPerson':head,'z':j,'background':'transparent person over halftone card'})
 l.type('正拳',(33,883),34,'jp',orange);l.type('突き',(33,930),34,'jp',orange)
 l.type('09.25',(519,1015),37,'jp',orange);l.type('2026.09.25',(36,1183),26,'bold')
 # Validate card topology independently from allowed person overlaps.
 for i,a in enumerate(boxes):
  for b in boxes[i+1:]:assert not (a[0]<b[0]+b[2] and b[0]<a[0]+a[2] and a[1]<b[1]+b[3] and b[1]<a[1]+a[3])
 return l.save('中央を囲む7枠／切り抜き人物だけが枠を越える')


def silhouette(variant=False):
 l=Layout('3894',variant);l.im=Image.new('RGBA',(W,H),paint('#fafaf7'));red=paint('#b44b58')
 l.type('正拳',(32,29),70,'bold',maxwidth=630);l.type('突き',(32,102),70,'bold',maxwidth=630)
 idx=19;crop=crop_box(idx,'waist',650/1060);rect=(35,185,650,1060)
 source=Image.open(A/f'full-person-{idx}.png').convert('RGBA');a=source.getchannel('A')
 source=ImageOps.colorize(ImageOps.autocontrast(ImageOps.grayscale(source),cutoff=1),paint('#0a0a0c'),paint('#ece9e1')).convert('RGBA');source.putalpha(a)
 cut=source.transform((650,1060),Image.Transform.EXTENT,tuple(crop),Image.Resampling.BICUBIC)
 master=Image.new('RGBA',(W,H));master.alpha_composite(cut,(35,185));sil=master.getchannel('A')
 fx,fy,fw,fh=PARTS[idx]['faces'][0]['bounds'];sx=650/(crop[2]-crop[0]);sy=1060/(crop[3]-crop[1])
 face=[35+(fx-crop[0])*sx,185+(fy-crop[1])*sy,fw*sx,fh*sy]
 # Preserve the original face across the partitions. Replacement photographs start below it.
 start=int(face[1]+face[3]+18);start=min(start,700)
 cells=[(35,start,247,197),(294,start,391,197),(35,start+209,379,210),(426,start+209,259,210),(35,start+431,182,210),(229,start+431,456,210)]
 for j,((x,y,w,h),fid) in enumerate(zip(cells,[43,47,50,52,21,23])):
  box=crop_box(fid,'face' if j%2 else 'chest',w/h)
  person=Image.open(A/f'full-person-{fid}.png').convert('RGBA');bg=Image.new('RGBA',person.size,paint('#151515'));bg.alpha_composite(person)
  gray=ImageOps.autocontrast(ImageOps.grayscale(bg),cutoff=1);photo=ImageOps.colorize(gray,paint('#101012'),red if j in [1,4] else paint('#e9e6df')).convert('RGBA')
  photo=photo.transform((w,h),Image.Transform.EXTENT,tuple(box),Image.Resampling.BICUBIC)
  master.alpha_composite(photo,(x,y));l.slots.append({'sourceFrame':fid,'part':'face' if j%2 else 'chest','sourceCrop':box,'destination':[x,y,w,h],'clip':'master person silhouette intersection','z':j+1})
 # Duotone blocks alter the original hero pixels without replacing their identity.
 tintBoxes=[(int(face[0]),int(face[1]-face[3]*.3),int(face[2]*.64),int(face[3]*.39)),(int(face[0]),int(face[1]+face[3]*.5),int(face[2]*.6),int(face[3]*.57))]
 for x,y,w,h in tintBoxes:
  block=master.crop((x,y,x+w,y+h));block=ImageOps.colorize(ImageOps.grayscale(block),paint('#161315'),red).convert('RGBA');master.alpha_composite(block,(x,y))
 # White cuts are irregular, and reveal the paper. They do not change the outer person shape.
 gaps=Image.new('L',(W,H));gd=ImageDraw.Draw(gaps)
 for x,y,w,h in cells:gd.rectangle((x-6,y-6,x+w+6,y+h+6),outline=255,width=12)
 yy=int(face[1]+face[3]*.32);gd.line((0,yy,720,yy),fill=255,width=12)
 yy2=int(face[1]+face[3]*.51);gd.line((0,yy2,720,yy2),fill=255,width=12)
 vx=int(face[0]+face[2]*.64);gd.line((vx,int(face[1]-face[3]*.5),vx,yy),fill=255,width=12)
 gd.line((int(face[0]+face[2]*.59),yy2,int(face[0]+face[2]*.59),start),fill=255,width=12)
 master.putalpha(ImageChops.multiply(sil,ImageOps.invert(gaps)))
 if MATERIAL_COMPOSITOR:MATERIAL_COMPOSITOR(l.im,grain(master,6,3894),(0,0))
 else:l.im.alpha_composite(grain(master,6,3894))
 l.subjectMask=sil
 l.slots.insert(0,{'sourceFrame':idx,'part':'waist','sourceCrop':crop,'destination':list(rect),'clip':'master foreground person alpha','role':'hero face retained','faceInCanvas':face,'z':0})
 l.used={idx,43,47,50,52,21,23};l.type('正拳突き',(28,1246),18,'jp')
 return l.save('主役の顔を残す分割シルエット／一部だけ別写真')


def sketch(variant=False):
 l=Layout('3900',variant);cols=[paint('#5264b3'),paint('#f03e40'),paint('#e2ddbb'),paint('#2c2330')]
 blue,accent,paper,ink=cols;l.im=Image.new('RGBA',(W,H),ink)
 # Three close-up bands; the anatomy is anchored on eyes, not the center of a torso.
 top=l.photo(19,'eyes',(0,0,720,337),mono=True,tint=blue,tintStrength=1)
 mid=l.photo(23,'eyes-nose',(0,337,720,602),mono=True,tint=paper,tintStrength=1)
 bot=l.photo(47,'eyes',(0,939,720,341),mono=True,tint=accent,tintStrength=1)
 # Handwritten annotations are explicitly foreground exceptions, tied to detected eyes.
 for text,x,y,size,angle,color in [('正拳突き',25,24,48,-12,paper),('09.25',395,26,43,8,paper),('正拳',11,264,27,8,paper),('一番の技',16,399,45,16,accent),('どれですか？',12,491,40,8,accent),('教えて下さい',392,781,39,-12,paper),('正拳',32,1000,43,13,paper),('突き',532,1070,51,-14,paper),('2026.09.25',280,1229,23,0,paper)]:
  meta=letters(l.im,text,(x,y),size,'hand',color,angle=angle);meta['layer']='handwritten-annotation';l.types.append(meta)
 d=ImageDraw.Draw(l.im)
 for pts,col in [(top,paper),(mid,accent),(bot,paper)]:
  for k in ['leftEye','rightEye']:
   eye=pts[k];cx=sum(p[0] for p in eye)/len(eye);cy=sum(p[1] for p in eye)/len(eye);r=25
   points=[]
   for j in range(11):
    a=-math.pi/2+j*math.pi/5;rr=r if j%2==0 else r*.38;points.append((cx+math.cos(a)*rr,cy+math.sin(a)*rr))
   d.line(points,fill=col,width=3)
   d.line([(cx-58,cy+52),(cx-20,cy+70),(cx+15,cy+64),(cx+60,cy+48)],fill=col,width=3)
 # Hand-drawn loose circle and irregular hatching create texture without generated raster assets.
 d.arc((22,354,264,512),18,342,fill=paper,width=3)
 rng=random.Random(3900)
 for j in range(2600):
  x=rng.randrange(W);y=rng.randrange(H);d.line((x,y,x+3,y-4),fill=ink+("35"),width=1)
 return l.save('目を中心にした切り抜きと手書きの書き込み')

def warm(variant=False):
 l=Layout('3901',variant);colors=[paint('#d68d43'),paint('#b75e36'),paint('#ecd1a0'),paint('#121313')]
 accent,dark,paper,ink=colors;l.im=Image.new('RGBA',(W,H),ink)
 # Every photograph uses the same palette hue, with independent tone strength.
 l.photo(19,'face',(-40,0,780,1280),mono=True,tint=paper,tintStrength=1)
 d=ImageDraw.Draw(l.im)
 for yy in range(0,H,5):
  for xx in range(0,W,5):d.ellipse((xx,yy,xx+1,yy+1),fill=ink)
 l.type('正拳',(215,705),40,'sans',paper);l.type('突き',(215,752),95,'ultranarrow',paper)
 l.photo(50,'face',(360,90,180,266),background=ink,tint=accent,tintStrength=.65)
 # Static colored silhouette behind the foreground cutout. No generated body parts.
 idx=47;box=crop_box(idx,'waist',390/805);p=Image.open(A/f'full-person-{idx}.png').convert('RGBA');p=p.transform((390,805),Image.Transform.EXTENT,tuple(box),Image.Resampling.BICUBIC)
 alpha=p.getchannel('A');back=Image.new('RGBA',p.size,accent);back.putalpha(alpha.filter(ImageFilter.MaxFilter(31)))
 l.im.alpha_composite(back,(330,394))
 gray=ImageOps.colorize(ImageOps.grayscale(p),ink,accent).convert('RGBA');gray.putalpha(alpha);p=Image.blend(p,gray,.48);l.im.alpha_composite(p,(330,394))
 l.slots.append({'sourceFrame':idx,'part':'waist','destination':[330,394,390,805],'sourceCrop':box,'clip':'foreground person alpha','backing':'static dilated silhouette','toneStrength':.48,'sourceLimitation':'full body is not visible in this test recording'})
 l.photo(23,'head',(26,806,207,282),background=dark,tint=accent,tintStrength=.38)
 l.photo(43,'face',(127,1020,260,245),background=ink,tint=accent,tintStrength=.72)
 # Translucent star motif placed over the detected eye region of the top inset.
 pts=l.slots[1]['landmarksInCanvas']['leftEye'];cx=sum(p[0] for p in pts)/len(pts);cy=sum(p[1] for p in pts)/len(pts)
 overlay=Image.new('RGBA',(W,H));od=ImageDraw.Draw(overlay)
 for x,y,r,opacity in [(cx,cy,79,115),(546,362,76,225),(192,1058,80,200)]:
  points=[]
  for j in range(20):
   a=j*math.pi/10;rr=r if j%2==0 else r*.38;points.append((x+math.cos(a)*rr,y+math.sin(a)*rr))
  od.polygon(points,fill=tuple(bytes.fromhex(paper[1:]))+(opacity,))
 l.im.alpha_composite(overlay);l.im=grain(l.im,4,3901)
 return l.save('連動する色加工・人物の色面・半透明の星')


def scrapbook(variant=False):
 l=Layout('3879',variant);colors=[paint('#dbc340'),paint('#368bc0'),paint('#e7e0cd'),paint('#203533')]
 yellow,blue,paper,ink=colors;l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 # Organic blue backing shapes, not rectangular photo cards.
 d.rounded_rectangle((404,178,716,574),radius=116,fill=blue)
 d.ellipse((41,928,376,1238),fill=blue);d.rounded_rectangle((448,780,701,1194),radius=108,fill=blue)
 # Tape and handwriting are behind the cutout people.
 d.polygon([(12,61),(382,167),(369,245),(1,143)],fill=yellow)
 l.type('正拳突き',(33,72),53,'hand',ink,angle=-13)
 d.polygon([(33,860),(401,937),(381,1011),(17,934)],fill=yellow)
 l.type('正拳',(58,887),53,'hand',ink,angle=-10)
 l.type('25',(231,530),99,'hand',blue,strokeColor=yellow,strokeWidth=3)
 l.type('2026.09.25',(314,29),23,'hand',blue)
 l.photo(43,'chest',(395,20,320,250),background='transparent',outlineColor=blue,wash=.24)
 l.photo(19,'head',(20,204,252,288),background='transparent',outlineColor=blue,wash=.2,tilt=6)
 l.photo(50,'face',(385,289,337,328),background='transparent',outlineColor=blue,wash=.22)
 l.photo(23,'chest',(0,488,386,397),background='transparent',outlineColor=paper,wash=.26)
 l.photo(47,'head',(264,632,235,306),background='transparent',outlineColor=yellow,wash=.23)
 l.photo(52,'face',(473,873,251,314),background='transparent',outlineColor=blue,wash=.23)
 mask=Image.new('L',(283,250));ImageDraw.Draw(mask).ellipse((0,0,282,249),fill=255)
 l.photo(21,'face',(24,993,283,250),background='transparent',mask=mask,outlineColor=blue,wash=.23)
 l.photo(44,'waist',(287,990,210,270),background='transparent',outlineColor=paper,wash=.21)
 # Hand-drawn stars and thin captions remain outside the photographed faces.
 d=ImageDraw.Draw(l.im)
 for x,y,r in [(620,300,38),(39,803,31),(390,961,35),(682,775,27)]:
  pts=[]
  for j in range(17):
   a=-math.pi/2+j*math.pi/8;rr=r if j%2==0 else r*.34;pts.append((x+math.cos(a)*rr,y+math.sin(a)*rr))
  d.line(pts,fill=yellow,width=4)
 letters(l.im,'正拳突き',(520,665),31,'hand',yellow,angle=90)
 letters(l.im,'09.25',(62,1228),29,'hand',ink)
 l.im=grain(l.im,5,3879);return l.save('褪せた青黄・曲線の切り抜き・人物と文字の縁取り')


def stripe(variant=False):
 l=Layout('3880',variant);paper=paint('#e5e4dc');red=paint('#e9262c');ink=paint('#101111');l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 # Preserve the established large portrait + right-hand color stripe arrangement.
 d.rectangle((510,0,666,1010),fill=red)
 for x,y,w,h in [(20,406,235,218),(490,563,216,438),(17,811,218,298),(70,126,114,251)]:
  d.rectangle((x,y,x+w,y+h),fill=paint('#d3d0c6'))
  for yy in range(y+5,y+h-8,13):letters(l.im,'正拳突き  09.25  2026.09.25',(x+4,yy),8,'serif',paint('#63645d'),maxwidth=w-8)
 # Large type fragments and rotated words are behind the subject.
 l.type('突',(560,302),207,'bold',ink,angle=-90);l.type('正',(31,105),148,'bold',ink,angle=90)
 l.type('正拳',(567,649),71,'ultranarrow',ink,angle=-90);l.type('突き',(33,526),55,'ultranarrow',ink,angle=90)
 l.type('正拳突き',(34,35),104,'jp',ink,maxwidth=655)
 d.rectangle((39,790,176,1095),fill=red)
 for yy in range(810,1080,24):letters(l.im,'正拳突き  09.25',(44,yy),13,'serif',ink,maxwidth=125)
 l.photo(43,'waist',(5,200,670,900),background='transparent',mono=True)
 l.im=grain(l.im,7,3880);return l.save('人物の後ろに隠れる文字・回転文字・細かな紙面模様')


def chromatic_tone(p,color):
 # Preserve source luminance with a broad same-hue ramp, never a black endpoint.
 alpha=p.getchannel('A');rgb=ImageColor.getrgb(color)
 dark=tuple(round(c*.55) for c in rgb)
 light=tuple(round(c+(255-c)*.65) for c in rgb)
 out=ImageOps.colorize(ImageOps.grayscale(p),dark,light).convert('RGBA')
 out.putalpha(alpha);return out

def character(l,name,box,color,flat=False):
 l.characters.append({'asset':name,'destination':box,'tone':color})
 root=O.parents[2]/'アランの基盤'/'brand'/'characters'
 p=Image.open(root/(name+'.png')).convert('RGBA');alpha=p.getchannel('A')
 p=chromatic_tone(p,color) if flat else ImageOps.colorize(ImageOps.grayscale(p),paint('#101616'),color).convert('RGBA');p.putalpha(alpha)
 p.thumbnail((box[2],box[3]),Image.Resampling.LANCZOS)
 if MATERIAL_COMPOSITOR:MATERIAL_COMPOSITOR(l.im,p,(box[0],box[1]))
 else:l.im.alpha_composite(p,(box[0],box[1]))

def layers(variant=False):
 l=Layout('3881',variant);colors=[paint('#d18c77'),paint('#228997'),paint('#e3c9b7'),paint('#202d30')]
 orange,blue,paper,ink=colors;l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 # Underlying paper patches, dark plates, columns of microtype and offset rectangular fragments.
 for x,y,w,h,c in [(43,158,257,235,orange),(177,70,301,550,ink),(450,267,209,746,ink),(79,631,406,539,ink),(16,314,198,199,paper)]:d.rectangle((x,y,x+w,y+h),fill=c)
 for x,y,w,h in [(19,44,144,330),(541,23,160,638),(289,615,230,560)]:
  for yy in range(y,y+h,15):letters(l.im,'正拳突き  09.25  2026.09.25',(x,yy),8,'serif',ink,maxwidth=w)
 for xx in range(0,W,28):d.line((xx,0,xx,H),fill=paint('#bea695'),width=1)
 l.type('正拳突き',(9,478),29,'serif',orange,angle=90)
 l.photo(19,'waist',(84,162,578,1095),background='transparent',mono=True)
 # Two-color glaze intersects only the foreground person, with independent opacity.
 mask=l.subjectMask;arr=np.zeros((H,W,4),dtype=np.uint8);a=np.array(tuple(bytes.fromhex(orange[1:])),float);b=np.array(tuple(bytes.fromhex(blue[1:])),float)
 for x in range(W):arr[:,x,:3]=a*(1-x/(W-1))+b*x/(W-1)
 arr[:,:,3]=np.array(mask)*.37;l.im.alpha_composite(Image.fromarray(arr,'RGBA'))
 # A few translucent rectangles are allowed IN FRONT, unlike the default typography layer.
 glaze=Image.new('RGBA',(W,H));gd=ImageDraw.Draw(glaze)
 gd.rectangle((329,576,664,623),fill=tuple(bytes.fromhex(blue[1:]))+(65,));gd.rectangle((51,749,340,797),fill=tuple(bytes.fromhex(orange[1:]))+(93,));l.im.alpha_composite(glaze)
 character(l,'alan-cheer',(20,801,356,398),orange);character(l,'leo-cheer',(286,945,302,326),blue)
 l.im=grain(l.im,5,3881);return l.save('大きな切り抜き・紙片・2色の重なり・加工したキャラクター')

def geometry(variant=False):
 l=Layout('3882',variant);colors=[paint('#ce711c'),paint('#cc4315'),paint('#e7d4a0'),paint('#263230')]
 orange,rust,paper,ink=colors;l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 # Geometry reproduces the reference's placement; illustrations replace city architecture.
 for x,y,w,h,c in [(367,0,196,316,orange),(232,381,383,235,orange),(331,595,296,307,rust),(119,705,348,365,orange),(154,1042,349,230,orange)]:d.rectangle((x,y,x+w,y+h),fill=c)
 for xx in range(116,646,29):d.line((xx,81,xx,1234),fill=paint('#948b62'),width=1)
 for yy in range(102,1200,31):d.line((72,yy,651,yy),fill=paint('#b7a67c'),width=1)
 l.photo(18,'head',(53,47,466,691),background='transparent',mono=True,tint=paper,tintStrength=1)
 # The circular insert belongs behind/over the upper side of the head, not centered randomly.
 mask=Image.new('L',(244,244));ImageDraw.Draw(mask).ellipse((0,0,243,243),fill=255)
 l.photo(47,'face',(362,151,244,244),mask=mask,mono=True,tint=paper,tintStrength=1)
 d=ImageDraw.Draw(l.im)
 for row in range(5):
  for col in range(5):
   if (row+col)%3!=1:d.rectangle((374+col*46,361+row*46,418+col*46,405+row*46),fill=orange if (row+col)%2 else ink)
 # Dense lower collage occupies the same architectural mass as the original skyline.
 character(l,'alan-stand',(252,503,277,489),paper);character(l,'leo-stand',(411,630,254,397),paper)
 character(l,'alan-cheer',(88,744,237,328),paper);character(l,'leo-cheer',(325,910,250,303),paper)
 for row in range(3):
  for col in range(5):
   if (row*2+col)%3!=0:d.rectangle((155+col*52,1062+row*64,205+col*52,1124+row*64),fill=orange if (row+col)%2 else ink)
 for yy in range(24,206,17):letters(l.im,'正拳突き 09.25',(571,yy),10,'serif',ink,maxwidth=125)
 l.type('正拳突き',(33,33),31,'serif',ink);l.im=grain(l.im,7,3882)
 return l.save('幾何学・円形・方眼・色面とキャラクターの密集配置')

if __name__=='__main__':
 import sys
 renderers={'3878':editorial,'3895':nine,'3885':manifesto,'3887':swiss,'3889':cards,'3894':silhouette,'3900':sketch,'3901':warm,'3879':scrapbook,'3880':stripe,'3881':layers,'3882':geometry}
 chosen=sys.argv[1:] or list(renderers)
 revisions=[]
 for ident in chosen:
  revisions.append(renderers[ident]());renderers[ident](True);print('refined',ident,flush=True)
 m=json.loads((O/'manifest.json').read_text());m['renders']=[e for e in m['renders'] if not e['id'].startswith('3895-')]
 for meta in revisions:
  ident=meta['template'];e=next((e for e in m['renders'] if e['id']==ident),None)
  if not e:e={'id':ident,'reference':f'IMG_{ident}.JPG','panel':None,'kind':'nine-panel'};m['renders'].append(e)
  e.update(name=meta['name'],layoutRevision=3)
  for v in ['original','color']:
   e[v]={'file':f'frames/{ident}{"-color" if v=="color" else ""}.jpg','sourceFrameIds':[s['sourceFrame'] for s in meta['slots']],'fontRole':'reference-specific','fontFamilies':list({t['font'][0] for t in meta['typography']}),'partsRecognized':True}
  e['colorVariantPending']=False
  e['variantNotes']='3878 is a neutral monochrome palette; 3895 rotates design colors together, preserving photo colors.'
 m['templateCount']=len(m['renders']);m['status']='anatomical-layout-revision-3';m['renders'].sort(key=lambda e:0 if e['id']=='3878' else 1 if e['id']=='3895' else 2)
 (O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));print('Refined 3878, 3895, 3885 and 3887; templates:',m['templateCount'])
