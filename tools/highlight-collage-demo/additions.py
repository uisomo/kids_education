# -*- coding: utf-8 -*-
"""Six additional code-native compositions; no generated bitmap design dependencies."""
from refine import *
from more import ellipse, star
IDS=[18,19,20,21,22,23,24,43,44,45,46,47,48,49,50,51,52]
def head_grid(v=False):
 l=Layout('3903',v);paper=paint('#f0e8db');accent=paint('#e9222a');second=paint('#368bc0');third=paint('#dbc340');l.im=Image.new('RGBA',(W,H),paper)
 for j,idx in enumerate(IDS[:15]):
  x=8+j%3*238;y=8+j//3*253;w=228;h=243;d=ImageDraw.Draw(l.im);c=[accent,second,third][j%3]
  if j%5==0:d.polygon([(x,y+12),(x+205,y),(x+228,y+60),(x+207,y+237),(x,y+221)],fill=paint('#c7c3ba'))
  elif j%5==1:d.rectangle((x+17,y,x+117,y+h),fill=c)
  elif j%5==2:d.rectangle((x,y,x+w,y+h),fill=c);d.polygon([(x+30,y),(x+204,y),(x+220,y+200),(x+40,y+242)],fill=paper)
  elif j%5==3:
   for yy in range(y,y+h,8):d.line((x,yy,x+w,yy),fill=paint('#c7c3ba'),width=3)
  else:d.ellipse((x+5,y+10,x+218,y+239),fill=c)
  l.photo(idx,'head',(x+7,y+9,214,227),background='transparent',mono=True,tint=c if j in [0,1,5,7,9,10,11,12,13] else None,tintStrength=.63)
  if j%4==0:
   overlay=Image.new('RGBA',(W,H));ImageDraw.Draw(overlay).polygon([(x,y+170),(x+228,y+188),(x+227,y+228),(x,y+208)],fill=c);a=overlay.getchannel('A').point(lambda z:int(z*.53));overlay.putalpha(a);l.im.alpha_composite(overlay)
  if j in [2,8]:star(l.im,x+70,y+34,24,paper)
 l.im=grain(l.im,4,3903);meta=l.save('十五面の頭部切り抜き・異なる色面と刷り重ね');return meta

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

def echoes(v=False,masked=False):
 l=Layout('3907',v);l.faceMasked=masked;paper=paint('#efefeb');l.im=Image.new('RGBA',(W,H),paper)
 # The privacy selection, never missing feet, determines whether characters are used.
 if masked:
  character(l,'izzy-cheer',(-130,265,605,925),paint('#bc4d59'))
  character(l,'leo-cheer',(-37,91,609,1001),paint('#368bc0'))
  character(l,'alan-cheer',(257,0,603,1069),paint('#dbc340'))
  character(l,'alan-stand',(40,575,640,705),paint('#c7c3ba'))
 else:
  l.photo(19,'waist',(-133,183,568,1130),background='transparent',mono=True,tint=paint('#bc4d59'),tintStrength=1)
  l.photo(23,'waist',(-52,79,556,1195),background='transparent',mono=True,tint=paint('#368bc0'),tintStrength=1)
  l.photo(47,'waist',(278,-11,532,1283),background='transparent',mono=True,tint=paint('#dbc340'),tintStrength=1)
  l.photo(43,'waist',(126,166,492,1114),background='transparent',mono=True)

 l.im=grain(l.im,2,3907);return l.save('人物切り抜き・三つの色付きポーズと白黒の主役')

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
