from pathlib import Path
import re
import json,subprocess,imageio_ffmpeg,concurrent.futures
from PIL import Image,ImageChops,ImageStat,ImageDraw
root=Path(__file__).resolve().parents[2];p=root/'docs/highlight-collage-demo';m=json.loads((p/'manifest.json').read_text());vm=json.loads((p/'video-manifest.json').read_text());ff=imageio_ffmpeg.get_ffmpeg_exe();q=p/'checks';q.mkdir(exist_ok=True)
assert len({e['reference'] for e in m['renders']})==35
assert len(m['renders'])==len(vm['rendered'])==35
assert not any(e['id'].startswith('3895-') for e in m['renders'])
for ident in [e['id'] for e in m['renders']]:
 layout=json.loads((q/f'{ident}-layout.json').read_text())
 assert not any(re.search(r'[A-Za-z]',t) for t in layout['allRenderedText']),ident
 assert all(n in {'2026','09','25'} for t in layout['allRenderedText'] for n in re.findall(r'\d+',t)),ident
 assert layout['palette']['selection']=='random hue per selection, retained on revision'
 assert len(layout['hookColors'])==1
 assert all(t['scaleX']==t['scaleY']==1 for t in layout['typography'])
 assert len({slot['sourceFrame'] for slot in layout['slots']})==len(layout['slots'])
 if ident=='3903':assert len(layout['slots'])==15
 if ident=='3904':assert len(layout['slots'])==17
 if ident=='3907':assert len(layout['characters'])==0 and len(layout['slots'])==4
 if ident=='3908':assert len(layout['characters'])==0 and len(layout['slots'])==1
 if ident=='3895':assert len(layout['slots'])==9
 if ident=='3878':assert {'face','eyes','wide-chest','chest'} <= {slot['part'] for slot in layout['slots']}
 if ident=='3897':assert len(layout['slots'])==6
 if ident=='3877':assert len(layout['slots'])==5
 if ident=='3889':
  boxes=[s['frameRect'] for s in layout['slots']]
  for i,a in enumerate(boxes):
   for b in boxes[i+1:]:assert not (a[0]<b[0]+b[2] and b[0]<a[0]+a[2] and a[1]<b[1]+b[3] and b[1]<a[1]+a[3])
 if ident=='3896':assert sum(bool(s.get('mirrorX')) for s in layout['slots'])==4
assert vm['sourceRanges']==[[8,11],[12,15],[22,26]]
assert vm['outputRanges']==[[0,3],[3,6],[6,10]]
assert vm['bodyStart']==10 and vm['previewCount']==1 and vm['previewStartsAt']==0
assert vm['replayAfterExpansion'] is False
assert [round((e-s)*vm['fps']) for s,e in vm['outputRanges']]==[90,90,120]
for e in m['renders']:
 for v in ['original','color']:
  with Image.open(p/e[v]['file']) as im:assert im.size==(720,1280)
def check(e):
 r=subprocess.run([ff,'-v','error','-i',str(p/e['file']),'-map','0:v:0','-c','copy','-f','null','-','-progress','pipe:1'],capture_output=True,text=True)
 assert r.returncode==0,(e['id'],r.stderr)
 frames=[int(l.split('=')[1]) for l in r.stdout.splitlines() if l.startswith('frame=')]
 assert frames[-1]==1136,(e['id'],frames)
 r=subprocess.run([ff,'-v','error','-i',str(p/e['file']),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True)
 assert r.returncode==0 and len(r.stdout)==540*960*3
 im=Image.frombytes('RGB',(540,960),r.stdout);source=Image.open(p/'frames'/f'{e["id"]}.jpg').convert('RGB').resize((540,960))
 error=sum(ImageStat.Stat(ImageChops.difference(im,source)).mean)/3
 assert error<12,(e['id'],error)
 return {'id':e['id'],'frames':frames[-1],'firstFrameMeanError':round(error,2)}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(check,vm['rendered']))
times=[0,.6,2.96,3,3.96,4,4.15,4.3,5.96,6,9.96,10]
sheet=Image.new('RGB',(1080,740),'#e8e8e5');d=ImageDraw.Draw(sheet)
for i,t in enumerate(times):
 out=q/f'frame-{i}.jpg';subprocess.run([ff,'-v','error','-ss',str(t),'-i',str(p/'videos/3894.mp4'),'-frames:v','1','-y',str(out)],check=True)
 im=Image.open(out);im.thumbnail((180,320));x=(i%6)*180;y=(i//6)*370;sheet.paste(im,(x,y));d.text((x+5,y+330),f'{t:.2f}s',fill='black')
sheet.save(q/'timing-contact.jpg')
# Correctly ordered source contact sheet with accurate source timestamps.
source=Image.new('RGB',(1080,1020),'#eee');d=ImageDraw.Draw(source)
for i in range(8):
 im=Image.open(p/'assets'/f'frame-{i}.jpg');im.thumbnail((270,480));x=(i%4)*270;y=(i//4)*510;source.paste(im,(x,y));d.text((x+8,y+485),f'frame-{i} : {i*4}s',fill='black')
source.save(p/'assets/source-contact.jpg')
report={'templateCount':35,'referenceCount':35,'imageCount':70,'videoCount':35,'videoFramesEach':1136,'durationSecondsEach':1136/30,'highlightsFrames':[90,90,120],'sourceRanges':vm['sourceRanges'],'firstFrameVerification':'Decoded first video frame compared with its title/collage JPEG; threshold mean RGB error <12/255','checks':results,'limitations':['No iPhone performance measurement','Source Hook voice starts at output 0; three lines visible together; Hook end is a provisional 4 seconds','Manual scene selection','Temporary sparkle positions, not pose tracking','Reference style fidelity is provisional','Collage privacy handling is not yet connected to preview/body export']}
# Opening window must contain moving video, never a 4-second still hold.
a=Image.open(q/'frame-0.jpg');b=Image.open(q/'frame-1.jpg')
assert sum(ImageStat.Stat(ImageChops.difference(a.crop((410,660,520,850)),b.crop((410,660,520,850)))).mean)>3
(q/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='checks'},ensure_ascii=False))
