"""Five existing generated compositions, full review-only video exports."""
from pathlib import Path
import json, subprocess, hashlib, math
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg
from opening import compose, preferred_treatment
R=Path(__file__).resolve().parents[2];O=R/'docs/highlight-collage-demo';OUT=O/'glossy-lab/prototype';OUT.mkdir(exist_ok=True)
IDS=['3889','3908','3900','3897','3885'];W,H,FPS=540,960,30
F=imageio_ffmpeg.get_ffmpeg_exe();source=json.loads((O/'manifest.json').read_text())['source'];patterns=json.loads((O/'checks/hook-patterns.json').read_text())
protected=[O/'videos'/f'{i}.mp4' for i in IDS]+[O/'staging/tail.mp4',O/'staging/audio.m4a']
before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
# Read the same 3s + 3s opening highlights, then use the existing common tail.
filt='[0:v]split=2[a][b];[a]trim=start=8:end=11,setpts=PTS-STARTPTS,fps=30,scale=540:960[x];[b]trim=start=12:end=13.3,setpts=PTS-STARTPTS,fps=30,scale=540:960[y];[x][y]concat=n=2:v=1:a=0,format=rgb24[v]'
p=subprocess.Popen([F,'-v','error','-i',source,'-filter_complex',filt,'-map','[v]','-frames:v','129','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
frames=[];font=ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',20)
for k in range(129):
 raw=p.stdout.read(W*H*3)
 if len(raw)!=W*H*3:raise RuntimeError('Incomplete source frame')
 im=Image.frombytes('RGB',(W,H),raw);t=k/FPS;local=t if t<3 else t-3;z=1+.04*math.sin(math.pi*local/3)**2;zw,zh=round(W/z),round(H/z)
 im=im.crop(((W-zw)//2,(H-zh)//2,(W+zw)//2,(H+zh)//2)).resize((W,H),Image.Resampling.BILINEAR)
 canvas=Image.new('RGB',(W,H),'#14151a');canvas.paste(im.resize((494,878),Image.Resampling.BILINEAR),(23,0));d=ImageDraw.Draw(canvas)
 d.text((20,884),f'今日のハイライト  {1 if t<3 else 2}/3',font=font,fill='white')
 for a,b in [(0,3),(3,6),(6,10)]:
  x=20+500*a/10;end=20+500*b/10;d.rounded_rectangle((x,923,end-5,933),radius=4,fill='#424652')
  if t>=a:d.rounded_rectangle((x,923,max(x+1,20+500*min(t,b)/10-5),933),radius=4,fill='#ffce70')
 frames.append(canvas)
p.stdout.close();p.wait();assert p.returncode==0,p.stderr.read().decode()
report=[]
for ident in IDS:
 artpath=O/'glossy-lab'/('whole-gloss/3900-vivid-composite-art.jpg' if ident=='3900' else f'vivid-gallery/{ident}/art.jpg')
 art=Image.open(artpath).convert('RGB');assert art.size==(720,1280)
 col={'3897':'#167dc5','3885':'#c22e70'}.get(ident) or json.loads((O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
 intro=OUT/f'{ident}-intro.mp4'
 enc=subprocess.Popen([F,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','540x960','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-g','30','-video_track_timescale','15360',str(intro)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
 for k,frame in enumerate(frames):
  im=compose(art,frame,k/FPS,ident,[col],preferred_treatment(col,patterns[ident]))
  if k in [0,119,124,128]:im.save(OUT/f'{ident}-check-{k}.jpg',quality=95)
  enc.stdin.write(im.resize((W,H),Image.Resampling.LANCZOS).tobytes())
 enc.stdin.close();enc.wait();assert enc.returncode==0,enc.stderr.read().decode()
 listing=OUT/f'{ident}-concat.txt';listing.write_text(f"file '{intro.name}'\nfile '../../staging/tail.mp4'\n")
 dest=OUT/f'{ident}.mp4'
 subprocess.run([F,'-v','error','-y','-f','concat','-safe','0','-i',str(listing),'-i',str(O/'staging/audio.m4a'),'-map','0:v','-map','1:a','-c','copy','-movflags','+faststart','-t',str(1136/30),str(dest)],check=True)
 # Decode the entire export; verify stream dimensions and count, not just file existence.
 reader=imageio_ffmpeg.read_frames(str(dest),pix_fmt='rgb24');meta=next(reader);count=sum(1 for _ in reader)
 assert meta['size']==(540,960) and count==1136,(ident,meta,count)
 report.append({'id':ident,'frames':count,'size':meta['size'],'fps':meta['fps'],'duration':meta['duration'],'audio':True,'sourceArt':str(artpath.relative_to(O))})
 print('verified',ident,count,flush=True)
assert before=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
(OUT/'verification.json').write_text(json.dumps({'reviewOnly':True,'generatedNewAssets':False,'protectedFilesUnchanged':True,'hookSeconds':4,'transitionSeconds':.3,'renders':report},indent=2))
