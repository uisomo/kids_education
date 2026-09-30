"""Source-layer tonal palette experiment, preserving geometry and glyphs."""
import importlib.util,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageColor
spec=importlib.util.spec_from_file_location('lab',Path(__file__).with_name('glossy-lab.py'));lab=importlib.util.module_from_spec(spec);spec.loader.exec_module(lab)
r,m,g,op=lab.r,lab.m,lab.g,lab.op
OUT=lab.OUT/'shape-gloss';OLD_INIT=r.Layout.__init__
COLORS={'3897':'#248acf','3885':'#d45185'}

def init(self,ident,variant=False):
 OLD_INIT(self,ident,variant)
 primary=ImageColor.getrgb(COLORS[ident]);lab.PRIMARY=primary
 dark=lab.mix(primary,(5,9,22),.83);light=lab.mix(primary,(255,255,255),.93)
 for key in list(r.PAINT_MAP):
  rgb=ImageColor.getrgb(key);value=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255
  r.PAINT_MAP[key]=lab.mix(dark,light,value)
 self.im=Image.new('RGBA',(720,1280),r.paint('#c7c3ba'))

def letters(*args,**kw):
 args=list(args)
 if len(args)>5 and args[5]=='#111111':args[5]=r.paint('#111111')
 if len(args)<=5 and 'fill' not in kw:kw['fill']=r.paint('#111111')
 mode=g.MODE
 try:g.MODE=0;return lab.crisp_letters(*args,**kw)
 finally:g.MODE=mode

originals=(r.Layout.__init__,r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,r.letters,m.letters)
try:
 r.Layout.__init__=init;r.Layout.photo=lab.photo;r.Layout.save=g.save_review;r.MATERIAL_COMPOSITOR=lab.composite
 ImageDraw.Draw=lab.CleanDraw;r.grain=m.grain=lambda im,*args,**kw:im
 r.letters=m.letters=letters;g.ROUNDED=True;lab.STATE=4
 patterns=json.loads((r.O/'checks/hook-patterns.json').read_text())
 for ident,color in COLORS.items():
  g.MODE=2;g.STATS={};g.RENDERERS[ident]()
  art=g.LAST.copy();g.MODE=0
  frame=g.OPEN(r.O/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
  hook=op.compose(art,frame,0,ident,[color],op.preferred_treatment(color,patterns[ident]))
  for kind,im in [('art',art),('hook',hook)]:
   im.save(OUT/f'{ident}-1-{kind}.jpg',quality=96)
   with g.OPEN(r.O/'glossy-demo'/f'{ident}-3-{kind}-round.jpg') as base:base.save(OUT/f'{ident}-0-{kind}.jpg',quality=96)
  print(ident,flush=True)
finally:
 r.Layout.__init__,r.Layout.photo,r.Layout.save,r.MATERIAL_COMPOSITOR,ImageDraw.Draw,r.grain,m.grain,r.letters,m.letters=originals
(OUT/'single-tone.json').write_text(json.dumps({'colors':COLORS,'photoReflection':False,'reviewOnly':True,'hook':'approved black middle retained'},indent=2))
