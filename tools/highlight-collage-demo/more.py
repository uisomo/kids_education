"""The remaining reference-specific layouts. Each reference is one complete collage."""
from refine import *
IDS=[19,21,23,43,47,50,52,18,20,22,24,44,45,46,48,49,51]

def palette(colors,variant):
 return colors

def star(im,x,y,r,c,outline=False):
 pts=[]
 for j in range(21):
  a=-math.pi/2+j*math.pi/10;rr=r if j%2==0 else r*.38;pts.append((x+math.cos(a)*rr,y+math.sin(a)*rr))
 d=ImageDraw.Draw(im)
 if outline:d.line(pts,fill=c,width=4)
 else:d.polygon(pts,fill=c)

def ellipse(w,h):
 mask=Image.new('L',(w,h));ImageDraw.Draw(mask).ellipse((0,0,w-1,h-1),fill=255);return mask

def mosaic(v=False):
 l=Layout('3883',v);red,gold,blue=palette([paint('#ec4051'),paint('#dea43e'),paint('#247384')],v);l.im=Image.new('RGBA',(W,H),red)
 l.photo(19,'face',(28,257,664,754),background='transparent',tint=gold,tintStrength=.35)
 used=[i for i in IDS if i!=19]
 for j,idx in enumerate(used):
  col=j%4;row=j//4;y=row*142 if row<2 else 994+(row-2)*142
  l.photo(idx,'eyes-nose' if j%3==0 else 'face',(col*180,y,180,142),background=gold if j%2 else blue,tint=gold,tintStrength=.2+j%3*.2)
  if j%3==1:letters(l.im,'正拳突き',(col*180+6,y+111),20,'jp',gold,maxwidth=167)
 l.im=grain(l.im,7,3883);return l.save('中央の大きな顔と上下の密集した色刷りタイル')

def jazz(v=False):
 l=Layout('3884',v);cyan=palette([paint('#78bfd4')],v)[0];l.im=Image.new('RGBA',(W,H),paint('#fafaf8'))
 l.type('正拳',(28,74),32,'serif');l.type('突き',(28,112),32,'serif');l.type('25',(29,158),61,'serif')
 for s,x,y,size in [('正',214,103,254),('突',149,351,271),('拳',357,625,245),('25',245,901,180)]:l.type(s,(x,y),size,'serif',cyan)
 for idx,part,box in [(19,'chest',(165,236,351,404)),(43,'head',(378,145,234,280)),(47,'face',(362,651,276,312)),(23,'waist',(105,653,253,276)),(50,'head',(245,960,240,221))]:
  l.photo(idx,part,box,background='transparent',mono=True)
 for x,y in [(520,235),(50,638),(556,923)]:letters(l.im,'正拳突き',(x,y),17,'hand')
 return l.save('白い余白・水色の巨大文字・重なる白黒の人物')

def pop(v=False):
 l=Layout('3886',v);yellow,red=palette([paint('#eddb46'),paint('#bd2b1f')],v);l.im=Image.new('RGBA',(W,H),yellow)
 for s,x,y in [('正',81,124),('拳',73,392),('突',97,658),('き',125,928)]:l.type(s,(x,y),216,'bold',red,maxwidth=631)
 for j,(idx,box) in enumerate(zip(IDS,[(0,18,308,478),(383,-29,350,425),(-55,443,344,436),(482,439,290,435),(20,838,349,426),(399,815,347,459)])):
  l.photo(idx,'waist' if j%2 else 'chest',box,background='transparent',mono=True)
 # Halftone only on the person silhouette, not rectangular photos.
 d=ImageDraw.Draw(l.im)
 for y in range(0,H,6):
  for x in range(0,W,6):
   if l.subjectMask.getpixel((x,y))>150:d.ellipse((x,y,x+1,y+1),fill=paint('#181818'))
 return l.save('黄色地・巨大な赤い文字・網点の切り抜き人物')

def inset(l,idx,part,box,master,tone=None,effect='full',polygon=None):
 x,y,w,h=box;crop=crop_box(idx,part,w/h)
 p=Image.open(A/f'full-person-{idx}.png').convert('RGBA');bg=Image.new('RGBA',p.size,paint('#252424'));bg.alpha_composite(p)
 p=bg.transform((w,h),Image.Transform.EXTENT,tuple(crop),Image.Resampling.BICUBIC)
 if tone:
  tinted=ImageOps.colorize(ImageOps.grayscale(p),paint('#161b20'),tone).convert('RGBA')
  mask=Image.new('L',(w,h),255);d=ImageDraw.Draw(mask)
  if effect=='left-half':d.rectangle((w//2,0,w,h),fill=0)
  elif effect=='right-half':d.rectangle((0,0,w//2,h),fill=0)
  elif effect=='diagonal':d.polygon([(0,0),(w,0),(0,h)],fill=0)
  elif effect=='gradient':mask=Image.fromarray(np.tile(np.linspace(0,255,w,dtype=np.uint8),(h,1)))
  p=Image.composite(tinted,p,mask)
 clip=master.crop((x,y,x+w,y+h))
 if polygon:
  shape=Image.new('L',(w,h));ImageDraw.Draw(shape).polygon(polygon,fill=255);clip=ImageChops.multiply(clip,shape)
 p.putalpha(clip)
 import refine
 if refine.MATERIAL_COMPOSITOR:refine.MATERIAL_COMPOSITOR(l.im,p,(x,y))
 else:l.im.alpha_composite(p,(x,y))
 l.slots.append({'sourceFrame':idx,'part':part,'sourceCrop':crop,'destination':list(box),'clip':'master-person-alpha'+(' + polygon' if polygon else ''),'colorPattern':effect,'tone':tone,'polygon':polygon})

def contour(v=False):
 l=Layout('3888',v);blue=palette([paint('#299bc4')],v)[0];l.im=Image.new('RGBA',(W,H),paint('#f5f5ef'))
 l.photo(19,'waist',(24,130,676,1124),background='transparent',mono=True)
 master=l.subjectMask.copy()
 # Collage is INSIDE the primary person. The head remains the original portrait.
 darkness=Image.new('RGBA',(W,H),paint('#101315'));mask=master.copy();ImageDraw.Draw(mask).rectangle((0,0,720,574),fill=0);darkness.putalpha(mask);l.im.alpha_composite(darkness)
 for idx,part,box in [(43,'left-half',(23,698,258,380)),(47,'eyes',(369,749,320,156)),(23,'head',(430,943,264,283))]:
  inset(l,idx,part,box,master,blue,'full')
 words=Image.new('RGBA',(W,H))
 for j in range(15):letters(words,'正拳突き\u3000空手\u300009.25',(244,672+j*27),14 if j%3 else 21,'serif',paint('#f4f1e7'),maxwidth=259)
 words.putalpha(ImageChops.multiply(words.getchannel('A'),master));l.im.alpha_composite(words)
 for j,c in enumerate('空手正拳突き'):
  a=-2.75+j*.4;x=353+math.cos(a)*308;y=318+math.sin(a)*220;letters(l.im,c,(x,y),44,'hand',angle=70-j*20)
 d=ImageDraw.Draw(l.im)
 for cx,cy,col in [(294,200,paint('#111111')),(248,710,paint('#f3f1e7')),(484,962,paint('#eeeeee'))]:
  pts=[(cx+math.cos(i*.58)*(27+i*.7),cy+math.sin(i*.77)*(23+i*.5)) for i in range(80)];d.line(pts,fill=col,width=2)
 return l.save('主役の人物内に青い写真片・黒い面・白い文字を重ねる')


def map_page(v=False):
 l=Layout('3890',v);red,paper=palette([paint('#b85c47'),paint('#d8d1bd')],v);l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 l.type('二十五',(311,84),155,'jp',paint('#efecdf'),maxwidth=368)
 # Diagonal red stripes on a separate torn paper fragment, behind the person.
 tile=Image.new('RGBA',(160,243),paint('#eee6d3'));td=ImageDraw.Draw(tile)
 for yy in range(-170,360,55):td.polygon([(0,yy),(160,yy+165),(160,yy+194),(0,yy+29)],fill=red)
 tile=tile.rotate(13,expand=True,resample=Image.Resampling.BICUBIC);l.im.alpha_composite(tile,(119,284))
 for x,y,w,h in [(387,464,172,489),(201,716,170,430),(58,560,185,85)]:
  d.rectangle((x,y,x+w,y+h),fill=paint('#e8dfc8'))
  for yy in range(y+7,y+h-9,13):letters(l.im,'正拳突き  09.25',(x+7,yy),9,'serif',paint('#353932'),maxwidth=w-14)
 l.photo(19,'waist',(83,186,531,789),background='transparent',mono=True)
 d=ImageDraw.Draw(l.im)
 for j in range(9):
  x=146+j*33;y=538+(j%3)*59;d.line((x,y,x+99,y+70,x+61,y+182),fill=paint('#cfcbbd'),width=1)
 for x,y in [(70,286),(524,426),(495,822)]:d.line((x,y,x+94,y+82,x-20,y+109),fill=red,width=3);letters(l.im,'×',(x,y),32,'hand',red)
 stamp=Image.new('RGBA',(212,119));sd=ImageDraw.Draw(stamp);sd.ellipse((2,3,209,113),outline=red,width=2);sd.ellipse((9,9,202,107),outline=red,width=1)
 letters(stamp,'空手',(67,19),25,'serif',red);letters(stamp,'2026.09.25',(22,55),26,'serif',red)
 l.im.alpha_composite(stamp.rotate(-9,expand=True,resample=Image.Resampling.BICUBIC),(443,166))
 stamp2=Image.new('RGBA',(133,83));ImageDraw.Draw(stamp2).rectangle((3,3,128,78),outline=red,width=3);letters(stamp2,'正拳突き',(13,23),25,'serif',red);l.im.alpha_composite(stamp2.rotate(7,expand=True),(448,1092))
 d=ImageDraw.Draw(l.im);d.rectangle((81,885,192,1003),fill=paint('#151917'));letters(l.im,'25',(91,898),86,'jp',paint('#ebe7dc'))
 l.im=grain(l.im,6,3890);return l.save('赤い斜線の紙片・赤い日付印・地図と人物の重なり')


def fragments(v=False):
 l=Layout('3891',v);paper=palette([paint('#d9c7b1')],v)[0];l.im=Image.new('RGBA',(W,H),paper)
 for y in range(0,H,26):letters(l.im,'正拳突き  09.25  正拳突き  2026.09.25',(1,y),20,'serif',paint('#242322'))
 placements=[(57,16,329,208,'head'),(381,9,270,165,'eyes'),(70,186,420,111,'eyes'),(242,259,393,173,'eyes-nose'),(33,399,335,151,'left-half'),(305,409,351,159,'eyes'),(90,522,332,109,'mouth'),(237,638,379,139,'eyes'),(58,765,301,112,'mouth'),(343,753,310,220,'right-half'),(149,875,336,171,'eyes-nose'),(244,1033,391,237,'head')]
 for j,(x,y,w,h,part) in enumerate(placements):l.photo(IDS[j],part,(x,y,w,h),background=paint('#ece7df'),mono=j%3!=0,tilt=[-5,3,0,7][j%4])
 return l.save('文字の紙面に重なる目・鼻・口・髪の断片')

def portrait_mosaic(v=False):
 l=Layout('3892',v);cyan,gold,orange,teal=palette([paint('#24aeb7'),paint('#a5a52b'),paint('#d88732'),paint('#3c8371')],v);l.im=Image.new('RGBA',(W,H),paint('#fafaf7'))
 l.photo(19,'waist',(25,35,670,1218),background='transparent',mono=True);master=l.subjectMask.copy()
 # Leave original facial fragments in place, replace only selected irregular cells.
 cells=[(21,'left-half',(35,52,169,208),gold,'full'),(23,'head',(214,52,189,208),None,'full'),(43,'right-half',(413,52,272,208),cyan,'right-half'),(47,'eyes',(30,270,386,133),gold,'full'),(50,'head',(426,270,253,133),None,'full'),(52,'mouth',(49,413,216,164),None,'full'),(18,'face',(275,413,404,164),orange,'gradient'),(20,'face',(238,587,211,205),cyan,'right-half'),(22,'eyes-nose',(459,587,220,205),gold,'diagonal'),(24,'head',(91,802,275,186),None,'full'),(44,'left-half',(376,802,169,186),orange,'left-half'),(45,'eyes',(555,802,141,186),teal,'full'),(46,'head',(51,998,195,242),teal,'left-half'),(48,'face',(256,998,222,242),None,'full'),(49,'mouth',(488,998,195,242),orange,'full')]
 for j,(idx,part,box,tone,effect) in enumerate(cells):
  x,y,w,h=box;poly=[(0,0),(w,0),(w,h),(w*.12,h*.85)] if j in [0,5,9] else None
  clip=master.copy()
  # Keep a fragment of the original nose/cheek rather than replacing the complete face.

  fx,fy,fw,fh=PARTS[19]['faces'][0]['bounds'];cx,cy,ex,ey=l.slots[0]['sourceCrop'];sx=670/(ex-cx);sy=1218/(ey-cy)
  left=25+(fx-cx)*sx;top=35+(fy-cy)*sy;fw*=sx;fh*=sy
  ImageDraw.Draw(clip).polygon([(left+fw*.45,top),(left+fw*.85,top+fh*.12),(left+fw*.76,top+fh),(left+fw*.45,top+fh*.9)],fill=0)
  inset(l,idx,part,box,clip,tone,effect,poly)
  # Thin white seams vary in direction and cell size.
  seam=Image.new('RGBA',(W,H));ImageDraw.Draw(seam).line((x,y,x+w,y),fill=paint('#fafaf7'),width=6);seam.putalpha(ImageChops.multiply(seam.getchannel('A'),master));l.im.alpha_composite(seam)
 letters(l.im,'正拳突き',(3,530),30,'serif',paint('#6b6454'),angle=90)
 return l.save('原顔の断片を残す不均等区画・半分着色・多色と濃淡')


def cinema(v=False):
 l=Layout('3893',v);blue,orange=palette([paint('#4db1c4'),paint('#d19b45')],v);l.im=Image.new('RGBA',(W,H),paint('#fafaf7'))
 l.photo(19,'waist',(132,97,463,1051),background='transparent',mono=True);master=l.subjectMask.copy()
 for idx,part,box,tone,effect in [(21,'eyes',(157,326,178,142),orange,'full'),(23,'right-half',(344,326,246,142),blue,'left-half'),(43,'mouth',(175,478,305,133),None,'full'),(47,'face',(133,622,216,171),blue,'full'),(50,'left-half',(359,622,231,171),orange,'left-half'),(52,'head',(131,802,242,175),blue,'full'),(18,'eyes',(383,802,210,175),orange,'full'),(20,'face',(141,988,201,145),orange,'right-half'),(22,'eyes-nose',(352,988,242,145),blue,'full')]:
  inset(l,idx,part,box,master,tone,effect)
 # Extra elements sit around the silhouette, with varied anatomical crops and characters.
 l.photo(24,'head',(40,641,177,281),background='transparent',mono=True)
 l.photo(44,'left-half',(514,414,168,328),background='transparent',mono=True,tint=orange,tintStrength=.55)
 character(l,'alan-cheer',(21,908,181,271),orange);character(l,'leo-stand',(555,860,156,286),blue)
 character(l,'izzy-cheer',(375,13,136,228),blue)
 l.type('正拳突き',(140,1150),65,'jp',blue,maxwidth=510);l.type('空手',(233,1221),32,'serif',orange)
 return l.save('青橙の顔断片・原顔・周囲の半顔とキャラクターを重ねる')


def islands(v=False):
 l=Layout('3896',v);yellow=palette([paint('#e1cc3b')],v)[0];l.im=Image.new('RGBA',(W,H),paint('#dedfdd'))
 for s,x,y in [('正',25,78),('拳',240,316),('突',15,799),('き',98,1053)]:l.type(s,(x,y),151,'light',yellow,maxwidth=690)
 boxes=[(240,106,203,226),(61,189,141,123),(154,340,132,145),(410,322,171,150),(27,487,162,177),(223,489,170,172),(458,510,190,155),(95,693,152,163),(295,684,177,186),(494,721,163,206),(56,918,159,178),(240,941,169,165),(432,1000,156,172)]
 for j,(idx,box) in enumerate(zip(IDS,boxes)):
  l.photo(idx,'head' if j%3 else 'chest',box,background=paint('#a4a5a2'),mono=True)
  if j in [1,4,7,10]:
   x,y,w,h=box;l.im.paste(ImageOps.mirror(l.im.crop((x,y,x+w,y+h))),(x,y));l.slots[-1]['mirrorX']=True
 l.type('25',(587,22),57,'light');l.type('2026',(550,116),40,'light')
 return l.save('余白に浮かぶ写真の島・背後の黄色文字・左右反転')

def six(v=False):
 l=Layout('3897',v);l.im=Image.new('RGBA',(W,H),paint('#f2f1ea'))
 for j,idx in enumerate(IDS[:6]):
  x=14+(j%2)*356;y=13+(j//2)*414;pts=l.photo(idx,'head',(x,y,340,395),background=paint('#696b69'),mono=True)
  # Six portraits form ONE template, with different handwritten text densities.
  face=PARTS[idx]['faces'][0]['bounds'];slot=l.slots[-1];crop=slot['sourceCrop']
  fx=x+(face[0]-crop[0])*340/(crop[2]-crop[0]);fy=y+(face[1]-crop[1])*395/(crop[3]-crop[1]);fw=face[2]*340/(crop[2]-crop[0])
  for k in range([6,4,5,4,9,4][j]):
   size=[22,31,27,34,15,36][j];word=['正拳突き','09.25','正拳','突き'][k%4]
   letters(l.im,word,(max(x+7,fx-fw*.35),max(y+12,fy-83)+k*(size+3)),size,'hand',paint('#f9f8ec'),maxwidth=260,angle=[0,7,-5,4,0,-9][j])
 return l.save('6枚で1つ／頭部に重なる6種類の手書き文字組み')

def split(v=False):
 l=Layout('3898',v);l.im=Image.new('RGBA',(W,H),paint('#fafaf8'));idx=19
 fx,fy,fw,fh=PARTS[idx]['faces'][0]['bounds'];cw=fw*1.8
 box=[fx-fw*.4,fy-fh*.65,fx+fw*1.4,fy-fh*.65+cw*1060/700]
 p=Image.open(A/f'full-person-{idx}.png').convert('RGBA');a=p.getchannel('A');p=ImageOps.colorize(ImageOps.grayscale(p),paint('#101010'),paint('#ecebe5')).convert('RGBA');p.putalpha(a);p=p.transform((700,1060),Image.Transform.EXTENT,tuple(box),Image.Resampling.BICUBIC)
 # The cut is anchored to the forehead, not a fixed y that may lie above all hair.
 cut=round((fy+fh*.08-box[1])*1060/(box[3]-box[1]));gap=126
 import refine
 composite=refine.MATERIAL_COMPOSITOR or (lambda canvas,image,xy:canvas.alpha_composite(image,xy))
 composite(l.im,p.crop((0,0,700,cut)),(10,14))
 composite(l.im,p.crop((0,cut,700,1060)),(10,14+cut+gap))
 l.slots=[{'sourceFrame':idx,'part':'head','sourceCrop':box,'destination':[10,14,700,1060],'splitAtY':cut,'gap':gap,'clip':'same cutout portrait split at detected forehead, transparent outside person'}]
 l.type('正拳突き',(64,cut+46),37,'serif')
 return l.save('背景を抜いた人物アップ／額で分割し頭頂を離す')

def tower(v=False):
 l=Layout('3899',v);red,paper=palette([paint('#e9222a'),paint('#ebe3cc')],v);l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 # Two opposite quadrants, never one continuous right-side red stripe.
 d.rectangle((346,0,659,653),fill=red);d.rectangle((54,650,348,1279),fill=red)
 specs=[(19,'head',(119,165,228,286)),(21,'eyes',(344,54,220,158)),(23,'left-half',(377,219,231,345)),(43,'face',(64,419,253,321)),(47,'eyes-nose',(328,542,271,227)),(50,'right-half',(98,769,226,311)),(52,'mouth',(359,896,265,190))]
 for idx,part,box in specs:l.photo(idx,part,box,background='transparent',mono=True,tint=paper,tintStrength=1)
 character(l,'alan-stand',(317,664,253,472),paper);character(l,'izzy-stand',(40,1033,220,246),paper)
 d=ImageDraw.Draw(l.im)
 for x in [560,585,610]:d.ellipse((x,1150,x+10,1160),fill=paint('#171917'))
 l.type('正拳突き',(361,1193),32,'serif',red,maxwidth=300)
 return l.save('右上・左下の赤／目・顔・半顔・口元とキャラクター')


def botanical(v=False):
 l=Layout('3877',v);green,yellow,paper=palette([paint('#38866a'),paint('#efbf31'),paint('#ebe5d3')],v);l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 # Backmost type, then two rear portraits, then a second typography plane,
 # followed by three front portraits: precisely FIVE people with interleaved depth.
 l.type('正',(40,170),306,'bold',green);l.type('突',(418,77),295,'bold',green)
 d.ellipse((53,589,252,788),fill=green);d.rectangle((371,112,385,545),fill=yellow)
 l.photo(19,'chest',(245,57,380,523),background='transparent',mono=True,outlineColor=paper)
 l.photo(43,'waist',(42,202,304,535),background='transparent',mono=True,outlineColor=paper)
 l.type('拳',(252,477),312,'bold',yellow,behindSubjects=False)
 l.photo(47,'chest',(16,546,276,408),background='transparent',mono=True,outlineColor=paper)
 l.photo(23,'waist',(463,419,244,590),background='transparent',mono=True,outlineColor=paper)
 l.type('正',(104,815),300,'bold',green,behindSubjects=False)
 l.photo(50,'waist',(215,686,458,557),background='transparent',mono=True,outlineColor=paper)
 d=ImageDraw.Draw(l.im)
 for x,y in [(105,205),(586,104),(440,663)]:d.line((x-20,y,x+20,y),fill=green,width=2);d.line((x,y-20,x,y+20),fill=green,width=2)
 for yy in range(545,790,12):
  for xx in range(11,100,12):d.ellipse((xx,yy,xx+2,yy+2),fill=green)
 letters(l.im,'正拳突き',(20,1200),29,'serif')
 return l.save('5人の切り抜き・文字と人物を交互に重ねる緑黄の構図')

def scatter(v=False):
 l=Layout('3871',v);l.im=Image.new('RGBA',(W,H),paint('#fafaf6'))
 # Each transformed cutout remains inside its own disjoint cell, including rotation.
 # Full-body photographs are unavailable; the two full-body inserts use Alan art.
 photo_cells=[0,2,3,4,5,7,8,10,11,12,14,16,17]
 for j,(idx,cell) in enumerate(zip(IDS,photo_cells)):
  x=cell%4*180+15;y=cell//4*226+16
  part=['left-half','hands','chest','eyes-nose','head','right-half','waist'][j%7]
  w,h=(130,170) if part not in ['hands','eyes-nose'] else (132,125)
  l.photo(idx,part,(x,y,w,h),background='transparent',mono=True,tilt=[-8,7,0,9][j%4])
  l.slots[-1]['reservedCell']=[cell%4*180,cell//4*226,180,226]
 for cell,name in [(1,'alan-cheer'),(6,'leo-stand'),(9,'alan-stand'),(13,'leo-cheer'),(15,'alan-cheer'),(18,'leo-stand')]:
  character(l,name,(cell%4*180+24,cell//4*226+24,132,177),paint('#d9d9d3'))
 l.type('正拳突き',(21,1178),28,'serif')
 return l.save('小さな切り抜きを重ねず配置／顔の断片・手・全身キャラクター')

def dense_rounds(v=False):
 l=Layout('3872',v);red,yellow,paper=palette([paint('#96383d'),paint('#e4c438'),paint('#e9e3d5')],v);l.im=Image.new('RGBA',(W,H),paper)
 # Dense underlying photo field; round and oval crops deliberately overlap it.
 for j,(idx,box) in enumerate([(19,(0,0,397,542)),(43,(361,0,359,504)),(47,(0,490,437,429)),(23,(386,469,334,476)),(50,(0,860,402,420)),(52,(365,894,355,386))]):
  l.photo(idx,'chest' if j%2==0 else 'head',box,background=paint('#84817b'),mono=j in [0,1,4],outlineColor=red)
 for idx,box,shape in [(18,(441,114,279,265),'circle'),(20,(470,615,247,310),'oval'),(21,(-12,863,290,324),'oval'),(22,(250,927,288,276),'circle')]:
  l.photo(idx,'head',box,background=paint('#b2aba1'),mask=ellipse(box[2],box[3]) if shape=='circle' else ellipse(box[2],box[3]),outlineColor=red,mono=idx==20)
 # Sparse ink dots, softened grain and hand-drawn red rings bind the photos.
 l.im=grain(l.im,5,3872);d=ImageDraw.Draw(l.im)
 for y in range(21,479,7):
  for x in range(10,383,7):
   if (x+y)%3==0:d.ellipse((x,y,x+1,y+1),fill=paint('#262323'))
 for x,y,r in [(632,92,38),(339,506,37),(433,902,34),(93,985,36)]:star(l.im,x,y,r,yellow,True)
 letters(l.im,'正拳突き',(27,426),47,'hand',yellow,angle=8)
 return l.save('赤黄・網点の白黒写真・丸い写真が隙間なく重なる構図')

def grunge(v=False):
 l=Layout('3873',v);l.im=Image.new('RGBA',(W,H),paint('#0b0c0d'));d=ImageDraw.Draw(l.im)
 for j in range(13):
  x=[0,374,67,508][j%4];y=j*94;d.rectangle((x,y,min(720,x+256),y+216),fill=paint('#eeeee7'))
  for yy in range(y+5,y+205,10):letters(l.im,'正拳突き 09.25 2026.09.25',(x+4,yy),7,'serif',paint('#202222'),maxwidth=247)
 l.type('正',(17,34),392,'bold',paint('#f8f8f0'));l.type('拳',(541,888),253,'bold',paint('#f8f8f0'))
 l.photo(19,'eyes-nose',(111,172,534,693),background='transparent',mono=True)
 l.photo(43,'waist',(25,835,217,424),background='transparent',mono=True)
 l.photo(47,'eyes',(303,882,299,190),background=paint('#171919'),mono=True)
 l.im=grain(l.im,22,3873)
 d=ImageDraw.Draw(l.im);rng=random.Random(3873)
 for j in range(150):
  x=rng.randrange(W);y=rng.randrange(H);d.rectangle((x,y,x+rng.randrange(1,11),y+rng.randrange(2,67)),fill=paint('#ddddcf') if j%2 else paint('#101010'))
 return l.save('白黒の刷り重ね・顔の断片・細かな紙面と擦れ')

def pastel(v=False):
 l=Layout('3870',v);pink,purple,blue,paper=palette([paint('#e8a1bb'),paint('#af82cf'),paint('#49a9b8'),paint('#f1e5d4')],v);l.im=Image.new('RGBA',(W,H),pink);d=ImageDraw.Draw(l.im)
 d.rectangle((411,0,720,H),fill=purple);d.polygon([(209,0),(465,0),(397,1260),(220,1260)],fill=paper)
 for x in range(221,465,21):d.line((x,0,x,H),fill=paint('#777f79'),width=1)
 for y in range(0,H,21):d.line((218,y,465,y),fill=paint('#777f79'),width=1)
 l.type('正',(15,461),176,'bold',blue);l.type('拳',(190,983),181,'serif',paint('#212026'))
 for idx,box in zip(IDS,[(0,119,364,488),(437,229,290,451),(19,703,312,485),(297,589,306,519),(357,-25,291,300)]):l.photo(idx,'chest',box,background='transparent',outlineColor=paper,wash=.08)
 for x,y,r in [(646,84,32),(453,508,39),(176,636,31)]:star(l.im,x,y,r,pink)
 l.type('正拳突き',(43,1201),29,'jp',purple)
 return l.save('ピンク紫・方眼紙・白縁人物・大きな切り貼り文字')

if __name__=='__main__':
 renderers={'3883':mosaic,'3884':jazz,'3886':pop,'3888':contour,'3890':map_page,'3891':fragments,'3892':portrait_mosaic,'3893':cinema,'3896':islands,'3897':six,'3898':split,'3899':tower,'3877':botanical,'3871':scatter,'3872':dense_rounds,'3873':grunge,'3870':pastel}
 import sys
 chosen=sys.argv[1:] or list(renderers);revisions=[]
 for ident in chosen:
  revisions.append(renderers[ident]());renderers[ident](True);print('refined',ident,flush=True)
 m=json.loads((O/'manifest.json').read_text());m['renders']=[e for e in m['renders'] if not e['id'].startswith('3897-')]
 for meta in revisions:
  ident=meta['template'];e=next((e for e in m['renders'] if e['id']==ident),None)
  if not e:e={'id':ident,'reference':f'IMG_{ident}.JPG','panel':None,'kind':'six-panel'};m['renders'].append(e)
  e.update(name=meta['name'],layoutRevision=3)
  for v in ['original','color']:e[v]={'file':f'frames/{ident}{"-color" if v=="color" else ""}.jpg','sourceFrameIds':[s['sourceFrame'] for s in meta['slots']],'fontRole':'reference-specific','partsRecognized':True}
 m['templateCount']=len(m['renders']);(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));print('Active templates',len(m['renders']))
