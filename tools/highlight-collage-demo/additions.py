# -*- coding: utf-8 -*-
"""Six additional code-native compositions; no generated bitmap design dependencies."""
from refine import *
from more import ellipse, star
IDS=[18,19,20,21,22,23,24,43,44,45,46,47,48,49,50,51,52]
def head_grid(v=False,hueOverride=None):
 l=Layout('3903',v)
 import refine,colorsys
 if hueOverride is not None:l.paletteAngle=hueOverride
 for key,source in [('#e9222a','#ed3443'),('#368bc0','#00a9d6'),('#dbc340','#f6d329'),('#38866a','#228354'),('#af82cf','#783abb')]:
  h,s,value=colorsys.rgb_to_hsv(*(c/255 for c in ImageColor.getrgb(source)))
  refine.PAINT_MAP[key]='#%02x%02x%02x'%tuple(round(c*255) for c in colorsys.hsv_to_rgb((h+l.paletteAngle/360)%1,s,value))
 paper=paint('#f0e8db');red=paint('#e9222a');blue=paint('#368bc0');yellow=paint('#dbc340');gray='#c7c7c5'
 l.im=Image.new('RGBA',(W,H),paper)
 techniques=['yellow face bands','red tonal portrait','red blocks and star','gray stripes','red and blue bands','yellow face bands','red lower block','red vertical overprint','black stepped frame','red arc and yellow tone','green tonal portrait','red tonal portrait','cyan tonal portrait','purple tonal portrait and yellow slash','red geometric surround']
 for j,idx in enumerate(IDS[:15]):
  x=8+j%3*238;y=8+j//3*253;w=228;h=243;d=ImageDraw.Draw(l.im)
  if j==0:d.polygon([(x+30,y),(x+206,y),(x+228,y+60),(x+211,y+243),(x,y+243),(x,y+48)],fill=gray)
  if j in [1,7]:d.rectangle((x+20,y,x+118,y+h),fill=red)
  if j==2:
   d.rectangle((x,y,x+100,y+h),fill=red);d.rectangle((x+191,y,x+w,y+h),fill=red)
  if j==3:
   for yy in range(y,y+h,8):d.line((x,yy,x+w,yy),fill=gray,width=3)
  if j==4:d.rectangle((x+9,y+9,x+w,y+45),fill=red)
  if j==5:
   for k in range(8):d.line((x+4+k*28,y+24,x+30+k*28,y+211),fill=yellow,width=10)
  if j==6:
   d.rectangle((x,y,x+w,y+60),fill=gray);d.rectangle((x,y+112,x+w,y+h),fill=red)
  if j==8:
   d.rectangle((x,y,x+w,y+h),fill='#111111')
   for k in range(5):d.rectangle((x+48-k*8,y+10+k*20,x+174+k*8,y+h),fill=paper)
  if j==9:d.arc((x+5,y-20,x+227,y+265),80,285,fill=red,width=24)
  if j in [10,12]:d.rectangle((x,y,x+w,y+h),fill=gray)
  if j==13:d.polygon([(x+156,y),(x+203,y),(x+68,y+h),(x+33,y+h)],fill=yellow)
  if j==14:
   d.rectangle((x,y,x+w,y+h),fill=red);d.polygon([(x+61,y),(x+151,y),(x+225,y+99),(x+168,y+h),(x+37,y+h),(x+5,y+158)],fill=paper)
  tone={1:red,10:paint('#38866a'),11:red,12:blue,13:paint('#af82cf')}.get(j)
  l.photo(idx,'head',(x+7,y+9,214,227),background='transparent',mono=True,flatColor=tone)
  l.slots[-1]['referenceTreatment']=techniques[j]
  # Selected bands color only the foreground alpha; they do not paint a rectangle over the face.
  regions={0:[(x,y+50,w,47,yellow),(x,y+155,w,33,yellow)],5:[(x,y+69,w,30,yellow),(x,y+133,w,32,yellow)],7:[(x+30,y,90,h,red)],9:[(x,y+80,w,120,yellow)]}.get(j,[])
  for xx,yy,ww,hh,c in regions:
   box=(xx,yy,xx+ww,yy+hh);part=l.im.crop(box);part.putalpha(l.subjectMask.crop(box));part=chromatic_tone(part,c);l.im.alpha_composite(part,(xx,yy))
  d=ImageDraw.Draw(l.im)
  if j==4:
   d.polygon([(x,y+145),(x+w,y+176),(x+w,y+217),(x,y+184)],fill=blue)
  if j==2:star(l.im,x+75,y+37,25,gray)
 l.im=grain(l.im,2,3903)
 return l.save('十五面・赤を主色に青黄の部分加工と同系色の濃淡')

def crowd(v=False):
 l=Layout('3904',v);paper=paint('#c7c3ba');accent=paint('#368bc0');l.im=Image.new('RGBA',(W,H),paper)
 # One sample per recorded pose; staggered ranks grow toward the foreground.
 boxes=[]
 for row,(yy,count,w,h) in enumerate([(340,6,147,282),(498,5,182,335),(695,4,229,407),(912,2,390,480)]):
  for col in range(count):boxes.append((col*(W/(count-.4))-w*.15,int(yy),w,h))
 for j,(idx,b) in enumerate(zip(IDS,boxes)):
  x,y,w,h=map(int,b);l.photo(idx,'waist',(x,y,w,h),background='transparent',mono=True,tint=accent if j==13 else None,tintStrength=.94,outlineColor=paper)
 l.im=grain(l.im,5,3904);return l.save('奥から手前へ重なる群像・一人だけ色で強調')

def diagram(v=False):
 l=Layout('3905',v);paper=paint('#263230');accent=paint('#e9222a');light=paint('#e7e0cd');l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im)
 for x,y,r in [(213,257,109),(492,237,160),(140,854,122),(621,989,96),(233,1156,64)]:d.ellipse((x-r,y-r,x+r,y+r),fill=accent)
 l.photo(43,'head',(25,162,710,1120),background='transparent',mono=True)
 overlay=Image.new('RGBA',(W,H));d=ImageDraw.Draw(overlay)
 for x,y,r in [(552,367,161),(70,566,26),(633,762,46)]:d.ellipse((x-r,y-r,x+r,y+r),outline=light,width=1)
 for j,(x,y,w,h) in enumerate([(43,113,329,338),(254,471,432,155),(67,737,293,323),(359,973,313,265)]):
  d.line([(x,y+h),(x,y),(x+w,y),(x+w,y+h*.75)],fill=light,width=1)
  for k in range(4):letters(overlay,'正拳突き　空手',(x+8,y+10+k*11),7,'serif',light)
  d.ellipse((x-2,y-2,x+2,y+2),fill=light)
 d.arc((281,253,688,709),70,311,fill=light,width=2)
 for x,y in [(344,111),(579,604),(445,850)]:d.polygon([(x-15,y),(x+15,y),(x,y+29)],fill=accent)
 l.im.alpha_composite(overlay);l.type('2026.09.25',(285,44),27,'jp',light,behindSubjects=False);l.im=grain(l.im,3,3905);return l.save('巨大な頭部・円形アクセント・極細の図形と日本語注記')

def echoes(v=False,masked=False,referenceColors=False,hueOverride=None):
 l=Layout('3907',v);l.faceMasked=masked
 import refine,colorsys
 if referenceColors:l.paletteAngle=0
 if hueOverride is not None:l.paletteAngle=hueOverride
 # Reference CMY family, rotated together only in the randomized version.
 for key,source in [('#bc4d59','#ec008c'),('#368bc0','#00afe4'),('#dbc340','#f6ee00')]:
  h,s,value=colorsys.rgb_to_hsv(*(c/255 for c in ImageColor.getrgb(source)))
  refine.PAINT_MAP[key]='#%02x%02x%02x'%tuple(round(c*255) for c in colorsys.hsv_to_rgb((h+l.paletteAngle/360)%1,s,value))
 paper=paint('#efefeb');l.im=Image.new('RGBA',(W,H),paper)
 # The privacy selection, never missing feet, determines whether characters are used.
 if masked:
  character(l,'izzy-cheer',(-130,265,605,925),paint('#bc4d59'),flat=True)
  character(l,'leo-cheer',(-37,91,609,1001),paint('#368bc0'),flat=True)
  character(l,'alan-cheer',(257,0,603,1069),paint('#dbc340'),flat=True)
  character(l,'alan-stand',(40,575,640,705),paint('#c7c3ba'))
 else:
  l.photo(19,'waist',(-133,183,568,1130),background='transparent',mono=True,flatColor=paint('#bc4d59'))
  l.photo(23,'waist',(-52,79,556,1195),background='transparent',mono=True,flatColor=paint('#368bc0'))
  l.photo(47,'waist',(278,-11,532,1283),background='transparent',mono=True,flatColor=paint('#dbc340'))
  l.photo(43,'waist',(126,166,492,1114),background='transparent',mono=True)

 return l.save('人物切り抜き・三つの色付きポーズと白黒の主役')

def circle_portrait(v=False,masked=False):
 l=Layout('3908',v);l.faceMasked=masked;paper=paint('#c7c3ba');accent=paint('#ce711c');l.im=Image.new('RGBA',(W,H),paper);d=ImageDraw.Draw(l.im);d.ellipse((77,87,644,668),fill=accent)
 shadow=Image.new('RGBA',(W,H));sd=ImageDraw.Draw(shadow);sd.ellipse((168,1060,555,1130),fill='#00000043');shadow=shadow.filter(ImageFilter.GaussianBlur(16));l.im.alpha_composite(shadow)
 if masked:character(l,'alan-stand',(35,435,650,650),paint('#e7e0cd'))
 else:l.photo(43,'waist',(114,164,496,969),background='transparent',mono=True)
 l.type('2026.09.25',(289,1201),12,'jp',paint('#263230'),behindSubjects=False);l.im=grain(l.im,2,3908);return l.save('大きな円・白黒の人物切り抜き・余白と柔らかい影')

def type_portrait(v=False):
 l=Layout('3902',v);paper=paint('#f0e8db');l.im=Image.new('RGBA',(W,H),paper)
 l.photo(43,'face',(25,85,670,1120),background='transparent',mono=False);portrait=l.im.copy();l.im=Image.new('RGBA',(W,H),paper)
 glyphs=Image.new('L',(W,H));d=ImageDraw.Draw(glyphs);f=font('jp',250)
 for text,y in [('正',194),('拳',450),('突',714),('技',973)]:
  b=f.getbbox(text);d.text((36,y-b[1]),text,font=f,fill=255)
 d.rectangle((360,0,720,1280),fill=255)
 # Same photographic plane continues through the glyphs into the visible right half.
 ink=Image.new('RGBA',(W,H),paint('#171919'));ink=Image.composite(portrait,ink,l.subjectMask)
 l.im=Image.composite(ink,l.im,glyphs);l.im.paste(portrait.crop((363,0,W,H)),(363,0));ImageDraw.Draw(l.im).rectangle((350,0,363,1280),fill=paper)
 l.im=grain(l.im,3,3902);return l.save('半顔と漢字の字形内に連続する同じポートレート')

if __name__=='__main__':
 renderers={'3902':type_portrait,'3903':head_grid,'3904':crowd,'3905':diagram,'3907':echoes,'3908':circle_portrait};m=json.loads((O/'manifest.json').read_text())
 import sys
 for ident,fn in renderers.items():
  if sys.argv[1:] and ident not in sys.argv[1:]:continue
  meta=fn();fn(True);e=next((e for e in m['renders'] if e['id']==ident),None)
  if e is None:e={'id':ident,'reference':f'IMG_{ident}.JPG','panel':None,'kind':'additional'};m['renders'].append(e)
  e.update(name=meta['name'],layoutRevision=3)
  for v in ['original','color']:e[v]={'file':f'frames/{ident}{"-color" if v=="color" else ""}.jpg','sourceFrameIds':[s['sourceFrame'] for s in meta['slots']],'fontRole':'reference-specific','partsRecognized':True}
  print('added',ident,flush=True)
 m['templateCount']=len(m['renders']);(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
