"""Deterministic, local layout prototypes. No production app files are changed.
Photos/alpha mattes: extract.swift. All displayed content: recorded drill title/date.
Reference photographs, text, signatures and watermarks are never reused in outputs.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter
import math, random, json, time, colorsys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/highlight-collage-demo'
AS=OUT/'assets'; PNG=OUT/'frames'; PNG.mkdir(exist_ok=True)
W,H=720,1280
GOTH='/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'
MIN='/System/Library/Fonts/ヒラギノ明朝 ProN.ttc'
FONT=lambda size,serif=False:ImageFont.truetype(MIN if serif else GOTH,int(size))
# One entry per standalone design, including panel designs inside contact sheets.
ENTRIES=[
('3894','分割シルエット','silhouette',(232,78,89)),
*[(f'3895-{i+1}',n,k,c) for i,(n,k,c) in enumerate([
('ノートと破れ紙','note',(213,99,66)),('反復文字と青い紙','repeatblue',(39,153,198)),('楕円と細い文字','oval',(235,142,78)),
('雲形と斜線','cloud',(76,169,216)),('手描きの線','doodle',(234,184,78)),('雑誌の表紙','cover',(202,70,42)),
('反復文字の切り替え','repeatmono',(152,58,51)),('夜色と蛍光文字','night',(55,72,171)),('切り貼り文字','ransom',(165,79,57))])],
('3889','枠から飛び出す人物','cards',(250,121,22)),('3900','三段の二色刷り','triptych',(85,100,177)),
('3901','大きな網点と重ね写真','halftone',(192,83,41)),('3878','映画の編集ページ','editorial',(166,158,146)),
('3879','テープと青黄スクラップ','tape',(240,196,45)),('3880','白黒と縦の色面','stripe',(237,31,35)),
('3881','紙の層と二色の重なり','layers',(235,145,120)),('3882','幾何学と二重露光','geometry',(216,112,25)),
('3883','写真のタイルと中央の顔','mosaic',(237,67,82)),('3884','余白と大きな文字','jazz',(112,192,216)),
('3885','細長い見出しと整列写真','manifesto',(60,61,62)),('3886','網点人物と巨大文字','pop',(235,216,59)),
('3887','余白と色の四角','swiss',(184,75,84)),('3888','輪郭に沿う言葉と線','contour',(44,155,195)),
('3890','紙片と地図のような線','map',(175,78,61)),('3892','人物形のモザイク','masks',(28,173,176)),
('3891','顔の断片と文字の紙','fragments',(200,131,86)),('3893','分割ポートレートと切り抜き','cinema',(66,162,174)),
*[(f'3897-{i+1}',n,'headwords',(60+i*5,61+i*5,63+i*5)) for i,n in enumerate(['頭の中の縦書き','頭の中の曲線文字','頭の中の強弱文字','頭の中の筆文字','頭の中の細かな行','頭の中の大きな言葉'])],
('3899','縦の色面と切り抜きの塔','tower',(234,26,36)),('3896','写真の島と透ける文字','islands',(227,206,46)),
('3898','切り離したポートレート','split',(96,97,98)),('3877','緑黄と大きな文字','botanical',(61,132,99)),
('3871','白地に浮かぶ切り抜き','scatter',(118,143,141)),('3872','赤い輪郭とハート','hearts',(144,38,45)),
('3873','白黒の刷り重ね','grunge',(32,33,34)),('3870','ピンクと紫のスクラップ','pastel',(225,133,165))]
assert len(ENTRIES)==42

def rgb_to_ok(c):
 r,g,b=[v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4 for v in c]
 l=(.4122214708*r+.5363325363*g+.0514459929*b)**(1/3)
 m=(.2119034982*r+.6806995451*g+.1073969566*b)**(1/3)
 s=(.0883024619*r+.2817188376*g+.6299787005*b)**(1/3)
 L=.2104542553*l+.793617785*m-.0040720468*s
 a=1.9779984951*l-2.428592205*m+.4505937099*s
 b=.0259040371*l+.7827717662*m-.808675766*s
 return L,math.hypot(a,b),math.atan2(b,a)
def ok_to_linear(L,C,h):
 a=C*math.cos(h);b=C*math.sin(h)
 l=(L+.3963377774*a+.2158037573*b)**3;m=(L-.1055613458*a-.0638541728*b)**3;s=(L-.0894841775*a-1.291485548*b)**3
 return (4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s)
def rotate_palette(p,angle):
 vals=[rgb_to_ok(c) for c in p];angle=math.radians(angle)
 # Common chroma scaling keeps relative hue and chroma proportions.
 factor=1.
 while True:
  linear=[ok_to_linear(L,C*factor,h+angle) for L,C,h in vals]
  if all(-1e-6<=v<=1.000001 for c in linear for v in c) or factor<.001:break
  factor*=.98
 def encode(v):return int(round(255*(12.92*v if v<=.0031308 else 1.055*v**(1/2.4)-.055)))
 return [tuple(max(0,min(255,encode(v))) for v in c) for c in linear]

def tinted(im,c):
 alpha=im.getchannel('A') if im.mode=='RGBA' else None
 out=ImageOps.colorize(ImageOps.grayscale(im),(20,20,22),c).convert('RGBA')
 if alpha:out.putalpha(alpha)
 return out
photos=[Image.open(AS/f'photo-{i}.png').convert('RGBA') for i in range(8)]
people=[Image.open(AS/f'person-{i}.png').convert('RGBA') for i in range(8)]
photos[3]=photos[6].copy();people[3]=people[6].copy()
# Crop transparent edges so cutouts fill their requested slots.
for i,p in enumerate(people):
 box=p.getchannel('A').getbbox()
 if box: people[i]=p.crop(box)

def build(entry,variant):
 ident,name,kind,base=entry;rng=random.Random(ident+'-fixed-layout')
 complementary={'triptych':(232,59,62),'layers':(18,139,162),'pastel':(156,122,201),'botanical':(245,198,40),'tape':(54,148,199),'pop':(187,34,23),'night':(180,218,72),'cinema':(198,151,68)}
 accent=complementary.get(kind,base)
 paper=(246,242,231);ink=(22,23,26)
 if kind in ['editorial','swiss','islands']:paper=(228,227,224)
 if kind in ['silhouette','jazz','manifesto','cinema','split','scatter','masks']:paper=(252,252,248)
 if kind in ['headwords','night','halftone','grunge']:paper=(28,28,32);ink=(247,244,235)
 if kind=='pop':paper=base
 if kind=='mosaic':paper=base
 if kind=='pastel':paper=(246,209,221)
 palette=[paper,ink,base,accent]
 if variant:palette=rotate_palette(palette,137)
 paper,ink,main,accent=palette
 img=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(img)
 def rect(x,y,w,h,c):d.rectangle((x,y,x+w,y+h),fill=c)
 def line(points,c=None,width=2):d.line(points,fill=c or ink,width=width)
 def text(s,x,y,size=32,color=None,serif=False,angle=0):
  c=color or ink;f=FONT(size,serif)
  if angle:
   box=f.getbbox(s);lay=Image.new('RGBA',(box[2]+24,box[3]+24));ImageDraw.Draw(lay).text((8,0),s,font=f,fill=c)
   lay=lay.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True);img.alpha_composite(lay,(int(x),int(y)))
  else:d.text((x,y),s,font=f,fill=c)
 def pic(i,x,y,w,h,mode='mono',shape=None,rot=0,border=0):
  p=photos[i%8].copy()
  if mode=='mono':p=tinted(p,(230,230,225))
  elif mode=='tint':p=tinted(p,main)
  elif mode=='accent':p=tinted(p,accent)
  p=ImageOps.fit(p,(int(w),int(h)),centering=(.62,.48))
  if shape:
   mask=Image.new('L',p.size);md=ImageDraw.Draw(mask)
   if shape=='ellipse':md.ellipse((0,0,w,h),fill=255)
   elif shape=='heart':
    pts=[]
    for k in range(181):
     a=k/180*2*math.pi;xx=16*math.sin(a)**3; yy=13*math.cos(a)-5*math.cos(2*a)-2*math.cos(3*a)-math.cos(4*a)
     pts.append(((xx+17)/34*w,(18-yy)/35*h))
    md.polygon(pts,fill=255)
   else:md.polygon([(w/2,0),(w*.63,h*.32),(w,h*.4),(w*.72,h*.65),(w*.82,h),(w*.5,h*.8),(w*.18,h),(w*.28,h*.65),(0,h*.4),(w*.37,h*.32)],fill=255)
   p.putalpha(mask)
  if border:p=ImageOps.expand(p,border=border,fill=paper)
  if rot:p=p.rotate(rot,resample=Image.Resampling.BICUBIC,expand=True)
  img.alpha_composite(p,(int(x),int(y)))
 def person(i,x,y,w,h,mode='mono',outline=0):
  p=people[i%8].copy()
  if mode=='mono':p=tinted(p,(235,235,230))
  elif mode=='tint':p=tinted(p,main)
  p.thumbnail((int(w),int(h)),Image.Resampling.LANCZOS)
  if outline:
   a=p.getchannel('A');mask=a.filter(ImageFilter.MaxFilter(outline*2+1));back=Image.new('RGBA',p.size,paper);back.putalpha(mask);img.alpha_composite(back,(int(x),int(y)))
  img.alpha_composite(p,(int(x),int(y)))
 def scribble(x,y,s=1,c=None):
  points=[(x+math.cos(k*.71)*45*s+k*.7,y+math.sin(k*.53)*29*s+k*.3) for k in range(90)]
  line(points,c or accent,2)
 def star(x,y,r=40,c=None):
  pts=[]
  for j in range(20):
   a=j*math.pi/10;rr=r if j%2==0 else r*.4;pts.append((x+math.cos(a)*rr,y+math.sin(a)*rr))
  d.polygon(pts,fill=c or accent)
 def bigtitle(x=36,y=42,color=None,serif=False,vertical=False):
  if vertical:
   for j,ch in enumerate('正拳突き'):text(ch,x,y+j*105,94,color,serif)
  else:text('正拳突き',x,y,94,color,serif)
 def news():
  for y in range(30,1120,33):
   text('正拳突き  2026.09.25  正拳突き',12,y,17,ink,True)
 # Composition-specific arrangements, not a recoloured common card.
 if kind in ['silhouette','masks','cinema']:
  # A photo mosaic clipped inside an actual participant's silhouette.
  layer=Image.new('RGBA',(W,H),paper);ld=ImageDraw.Draw(layer)
  for row in range(5):
   for col in range(3):
    p=ImageOps.fit(photos[(row+col+3)%8],(235,205));p=tinted(p,main if (row+col)%3==0 else (235,235,230));layer.paste(p,(col*242,row*214+190))
  silhouette=Image.new('L',(W,H));p=people[3].getchannel('A');p=ImageOps.fit(p,(650,990));silhouette.paste(p,(35,170));layer.putalpha(silhouette);img.alpha_composite(layer)
  if kind=='cinema':person(6,10,630,225,440,outline=4);person(4,505,460,205,540,'tint');bigtitle(y=36)
  elif kind=='masks':bigtitle(y=40,serif=True);text('2026.09.25',34,1035,26,main)
  else:bigtitle();rect(220,448,260,13,paper);rect(110,700,520,14,paper)
 elif kind=='note':
  for y in range(36,H,32):line([(0,y),(W,y)],(149,175,186),1)
  person(3,72,185,590,950,'mono');rect(0,205,80,790,ink);bigtitle(y=40,color=main)
  for i in range(7):text('正拳突き',32+(i%2)*355,245+i*126,32,main,angle=(-1)**i*9)
 elif kind=='repeatblue':
  rect(0,0,150,H,main);pic(3,170,230,475,780,'color');bigtitle(y=50)
  for j in range(4):text('正拳突き',22,275+j*54,46,ink)
  for j in range(4):text('正拳突き',377,810+j*50,45,main)
 elif kind=='oval':
  rect(0,0,W,H,main);pic(6,92,220,545,820,'color','ellipse');bigtitle(y=33,color=paper,serif=True);text('正拳突き',80,855,64,paper,True,angle=12)
 elif kind=='cloud':
  rect(0,0,W,H,main);pic(3,60,235,590,740,'color');
  for x,y in [(-50,300),(530,100),(510,830),(-20,900)]:d.ellipse((x,y,x+250,y+200),fill=paper)
  for q in range(-400,900,22):line([(q,0),(q+400,250)],paper,2)
  bigtitle(y=62,color=ink,serif=True);text('正拳突き',65,930,63,main,True)
 elif kind=='doodle':
  pic(3,0,180,W,970,'color');bigtitle(y=40);scribble(105,230,1.4);scribble(620,770,1.7);star(595,270,60)
  for x,y in [(80,650),(565,470)]:d.ellipse((x,y,x+60,y+80),outline=ink,width=8)
  text('正拳突き',50,990,58,ink,angle=10)
 elif kind=='cover':
  rect(0,0,W,H,main);pic(3,42,248,635,840,'color');bigtitle(y=85,color=paper);text('2026.09.25',43,27,26,paper);text('正拳突き',28,540,24,paper,angle=90)
 elif kind in ['repeatmono','night']:
  pic(6,70,220,590,860,'color');bigtitle(y=45,color=accent if kind=='night' else ink)
  if kind=='repeatmono':d.polygon([(0,380),(500,690),(0,1050)],fill=paper)
  for j in range(8):text('正 拳 突 き',27,390+j*74,43,accent if kind=='night' else main)
 elif kind=='ransom':
  pic(3,0,0,W,H,'color')
  for j,ch in enumerate('正拳突き'):
   x=30+j*170;rect(x,40+(j%2)*27,145,145,paper);text(ch,x+20,49+(j%2)*27,98,main,angle=(-1)**j*6)
  for j in range(4):star(50+j*198,1000-j*20,28,main)
 elif kind=='cards':
  bigtitle(y=32)
  for j,(x,y,w,h) in enumerate([(40,285,245,370),(344,200,330,410),(68,720,295,330),(405,665,260,375)]):
   rect(x,y,w,h,main);text('正拳突き',x+8,y+10,31,paper,True);person([3,6,4,5][j],x-20,y+40,w+45,h-15,outline=5)
 elif kind=='triptych':
  for j,(y,c) in enumerate([(0,main),(385,(233,225,191)),(810,accent)]):
   p=ImageOps.fit(photos[[3,6,4][j]],(W,435));img.alpha_composite(tinted(p,c),(0,y));text('正拳突き',34,y+35,69,(245,239,218),True,angle=(-1)**j*7) if j!=1 else None;scribble(550,y+330,1,paper)
  bigtitle(y=485,color=(20,20,24))
 elif kind=='halftone':
  pic(3,-75,0,850,1250,'accent');
  for y in range(0,H,9):
   for x in range(0,W,9):d.ellipse((x,y,x+3,y+3),fill=paper)
  pic(4,430,70,230,280,'color',border=5);pic(6,48,600,220,300,'color',border=5);person(3,285,435,430,650,'tint',4)
  star(575,435,70,(250,244,234));bigtitle(y=990,color=(250,244,234))
 elif kind=='editorial':
  bigtitle(y=35,serif=True);pic(3,28,206,432,410,'color');pic(4,482,206,210,260,'color');pic(6,264,650,430,340,'mono');pic(5,28,775,210,250,'mono')
  text('正拳突き',28,640,46,ink,True);text('2026.09.25',28,712,28);text('正拳突き',487,491,39,ink,True);line([(26,175),(692,175)]);line([(245,655),(245,1045)])
 elif kind=='tape':
  for j,(x,y) in enumerate([(330,70),(20,330),(352,528),(45,790)]):pic([4,3,6,5][j],x,y,315,340,'color',rot=(-1)**j*7,border=5)
  rect(30,105,450,105,main);text('正拳突き',48,104,75,ink,angle=-6);rect(100,850,430,100,main);text('正拳突き',116,852,63,ink)
  for x,y in [(50,480),(620,425),(335,750)]:star(x,y,42,accent)
 elif kind=='stripe':
  rect(510,0,156,1010,main);person(3,5,200,670,900);bigtitle(y=40);rect(40,740,130,295,main);text('正拳突き',35,520,33,ink,angle=90)
 elif kind=='layers':
  news();pic(3,112,245,560,710,'tint');pic(6,290,340,380,530,'accent');pic(4,25,190,265,235,'mono',border=7)
  for j in range(16):rect(rng.randrange(0,700),rng.randrange(150,1060),rng.randrange(18,100),rng.randrange(4,20),main if j%2 else accent)
  rect(0,0,W,145,paper);bigtitle(y=20,serif=True);line([(13,260),(710,590),(25,1070)],accent,3)
 elif kind=='geometry':
  for j in range(20):
   x=rng.randrange(0,18)*40;y=rng.randrange(180,1100)//40*40;rect(x,y,80,80,main if j%2 else ink)
  person(3,70,225,610,860);d.ellipse((435,245,685,495),outline=main,width=12)
  for x in range(20,720,60):line([(x,160),(x,1100)],main,1)
  bigtitle(y=32,serif=True)
 elif kind=='mosaic':
  person(3,45,380,640,630,'color')
  for j in range(18):
   row=j//6;col=j%6;pic((j+2)%8,col*120,row*127,116,123,'tint' if j%2 else 'color')
  for j in range(6):pic(j,j*120,985,116,125,'color')
  bigtitle(y=422,color=(252,247,234))
 elif kind=='jazz':
  for j,(x,y,w,h) in enumerate([(155,180,280,310),(364,390,260,345),(87,628,255,260),(300,760,290,310)]):pic(j+3,x,y,w,h)
  for j,ch in enumerate('正拳突き'):text(ch,30+(j%2)*350,110+j*225,190,main,True)
  text('正拳突き',28,26,51,ink,True)
 elif kind=='manifesto':
  bigtitle(y=28);line([(24,166),(690,166)],ink,5)
  for i,(x,y,w,h) in enumerate([(25,200,185,420),(226,200,310,320),(552,200,142,420),(25,640,230,390),(271,540,264,245),(550,640,145,390),(272,825,263,260)]):pic(i+2,x,y,w,h)
  text('正拳突き',230,550,49);text('2026.09.25',270,780,24)
 elif kind=='pop':
  for i in range(6):person(i+2,(i%2)*355-10,90+(i//2)*330,360,420)
  for j,ch in enumerate('正拳突き'):text(ch,220,40+j*260,230,accent)
 elif kind=='swiss':
  for x,y in [(395,35),(36,450),(395,850)]:rect(x,y,280,260,main)
  pic(3,35,190,285,240,'color');pic(6,394,460,280,270,'color');pic(4,38,800,285,240,'color')
  bigtitle(y=24);text('正拳突き',48,442,65);text('2026.09.25',75,728,45)
 elif kind=='contour':
  person(3,60,190,610,870);pic(6,410,710,280,360,'color');bigtitle(y=34,serif=True)
  for j in range(5):text('正拳突き',10+j*30,200+j*160,32,main,True,angle=30-j*13)
  scribble(240,225,2,ink);scribble(510,860,2,paper)
 elif kind=='map':
  news();rect(0,0,W,H,(227,222,209,235));person(3,100,250,550,730)
  for j in range(10):
   x=rng.randint(50,650);y=rng.randint(210,1020);line([(x,y),(x+65,y+70),(x-80,y+90)],main,3);text('×',x,y,28,main)
  rect(33,770,120,125,ink);text('30',40,790,68,paper);bigtitle(y=53,serif=True)
 elif kind=='fragments':
  news()
  for j in range(16):pic(j%8,65+(j%3)*145,120+j*56,340,190,'mono' if j%2 else 'color',rot=rng.randint(-9,9))
  rect(20,28,660,125,paper);bigtitle(y=30)
 elif kind=='headwords':
  n=int(ident[-1])-1;pic(3,0,160,W,1050,'mono');rect(0,0,W,145,paper);bigtitle(y=22,color=ink,serif=n%2==1)
  for j in range(5+n):
   size=[25,34,42,49,20,55][n];x=120+(j%2)*80;y=230+j*(38 if n==4 else 55)
   text('正拳突き' if j%2==0 else '2026.09.25',x,y,size,ink,serif=n%2==1,angle=[0,9,-7,4,0,-12][n])
 elif kind=='tower':
  rect(390,0,260,1050,main);rect(70,750,250,500,main)
  for j,(x,y,w,h) in enumerate([(220,230,390,480),(22,540,330,440),(370,650,320,430)]):person([3,6,4][j],x,y,w,h,'mono',4)
  bigtitle(y=40,serif=True)
 elif kind=='islands':
  for j,ch in enumerate('正拳突き'):text(ch,(j%2)*300+25,50+j*260,180,main)
  for j in range(14):
   x=[220,55,420,235,50,450,220][j%7];y=140+j*63;pic(j%8,x,y,178,170,'mono',border=5)
  text('正拳突き',25,24,42)
 elif kind=='split':
  p=ImageOps.fit(tinted(photos[3],(237,236,229)),(640,1000));img.alpha_composite(p.crop((0,0,640,220)),(40,120));img.alpha_composite(p.crop((0,285,640,1000)),(40,455));bigtitle(y=337,serif=True)
 elif kind=='botanical':
  for j,ch in enumerate('正拳突き'):text(ch,(j%2)*330+10,10+j*240,180,main if j%2==0 else accent)
  for j,(x,y,w,h) in enumerate([(200,150,490,540),(20,420,360,510),(330,730,370,390)]):person([3,6,4][j],x,y,w,h,'mono',6)
  for j in range(7):d.ellipse((35+j*8,880+j*19,110+j*8,915+j*19),outline=main,width=3)
  text('正拳突き',32,52,68)
 elif kind=='scatter':
  for j in range(8):person((j+2)%8,(j%3)*230-10,130+(j//3)*350,265,365,'mono',3)
  bigtitle(y=30,serif=True)
 elif kind=='hearts':
  for j,(x,y) in enumerate([(20,220),(350,450),(40,760)]):pic([3,6,4][j],x,y,370,365,'color','heart',rot=(-1)**j*7,border=4)
  person(3,235,150,480,550,'mono',4);bigtitle(y=40,color=main)
  for x,y in [(95,660),(610,915),(565,150)]:star(x,y,30,accent)
 elif kind=='grunge':
  pic(3,25,150,670,940,'mono');news()
  for j in range(24):rect(rng.randrange(0,700),rng.randrange(160,1120),rng.randrange(15,120),rng.randrange(5,90),paper if j%2 else ink)
  rect(30,35,660,130,paper);bigtitle(y=30,color=ink)
 elif kind=='pastel':
  rect(410,0,310,H,accent)
  for x in range(40,680,35):line([(x,30),(x,1170)],paper,2)
  for y in range(40,1200,35):line([(20,y),(700,y)],paper,2)
  person(3,10,185,470,550,'color',6);person(6,350,560,365,480,'color',5);pic(4,28,800,330,295,'color','heart')
  bigtitle(y=34,color=ink,serif=True)
  for x,y in [(600,225),(330,680),(85,730)]:star(x,y,30,main)
 else:raise ValueError(kind)
 # Content-neutral paper grain, generated rather than copied from references.
 if kind not in ['swiss','islands','manifesto','split','jazz']:
  grain=Image.new('RGBA',(W,H));gd=ImageDraw.Draw(grain)
  for j in range(19000):
   x=rng.randrange(W);y=rng.randrange(H);gd.point((x,y),fill=(10,10,10,24) if j%2 else (255,255,255,35))
  img=Image.alpha_composite(img,grain);d=ImageDraw.Draw(img)
 # Reserved bottom-right preview area: 3 actual scene stills and explicit label.
 d.rounded_rectangle((360,1090,708,1268),radius=15,fill=(250,249,245,245),outline=(32,32,34),width=2)
 d.text((375,1098),'今日のハイライト',font=FONT(27),fill=(20,20,22))
 for j,idx in enumerate([2,3,6]):
  p=ImageOps.fit(Image.open(AS/f'photo-{idx}.png').convert('RGB'),(100,90));img.paste(p,(375+j*106,1140))
  d.text((380+j*106,1232),f'{j+1} / {[3,3,4][j]}秒',font=FONT(17),fill=(20,20,22))
 # Safe unobtrusive source date, if not already a headline element.
 d.text((22,1229),'2026.09.25',font=FONT(18),fill=ink)
 path=PNG/f'{ident}{"-color" if variant else ""}.jpg';img.convert('RGB').save(path,quality=93)
 return {'file':str(path.relative_to(OUT)),'palette':palette}

start=time.perf_counter();manifest=[]
for e in ENTRIES:
 a=build(e,False);b=build(e,True)
 source=e[0].split('-')[0];suffix='jpg' if source in ['3878','3879'] else 'PNG' if source=='3870' else 'JPG'
 manifest.append({'id':e[0],'name':e[1],'kind':e[2],'reference':f'IMG_{source}.{suffix}','panel':int(e[0].split('-')[1]) if '-' in e[0] else None,'original':a,'color':b})
(OUT/'manifest.json').write_text(json.dumps({'status':'layout-prototype','source':'/Users/uk/Downloads/karate-training-29F3FE5B-9818-4545-84D4-9A5B97852507.MP4','hook':'正拳突き','hookProvenance':'visible drill label in recording; NOT speech transcription','demoHighlightSourceRanges':[[8,11],[12,15],[22,26]],'templateCount':42,'renders':manifest,'generationSeconds':round(time.perf_counter()-start,2)},ensure_ascii=False,indent=2))
# A legible six-page contact sheet, seven designs per page.
for page in range(6):
 sheet=Image.new('RGB',(1440,1600),'#f1efea');draw=ImageDraw.Draw(sheet)
 draw.text((25,20),f'コラージュ構図デモ {page+1}/6',font=FONT(35),fill='#222')
 for k,e in enumerate(manifest[page*7:page*7+7]):
  x=(k%4)*360+12;y=(k//4)*750+95
  p=Image.open(OUT/e['original']['file']);p.thumbnail((336,620));sheet.paste(p,(x,y));draw.text((x,y+610),e['id']+' '+e['name'][:13],font=FONT(17),fill='#222')
 sheet.save(OUT/f'contact-{page+1}.jpg',quality=91)
(OUT/'TEMPLATES.md').write_text('# 参照画像と42案の対応\n\n構図プロトタイプ。元配色と色相回転版を各1点生成。本番採用・品質検証は別工程。\n\n|ID|参照|パネル|構図|\n|---|---|---|---|\n'+''.join(f'|{e["id"]}|{e["reference"]}|{e["panel"] or "全体"}|{e["name"]}|\n' for e in manifest))
print(f'Generated {len(manifest)*2} first-frame layout prototypes in {time.perf_counter()-start:.1f}s')
