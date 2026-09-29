"""Render review-only videos. Final iOS compositor is deliberately not modified.
540x960/30fps. Hook overlays the first four seconds of the running 3/3/4 highlights.
At the provisional Hook end, the CURRENT highlight expands without replay.
All outputs share the expensive tail. This is desktop demo optimization only.
"""
from pathlib import Path
from opening import compose,hook_style,HOOK_END,TRANSITION
from PIL import Image,ImageDraw,ImageFont
import imageio_ffmpeg,subprocess,json,math,wave,array,time,concurrent.futures
R=Path(__file__).resolve().parents[2];O=R/'docs/highlight-collage-demo';V=O/'videos';T=O/'staging';V.mkdir(exist_ok=True);T.mkdir(exist_ok=True)
F=imageio_ffmpeg.get_ffmpeg_exe();M=json.loads((O/'manifest.json').read_text());S=M['source'];W,H,FPS=540,960,30
font=lambda s:ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',s)
def run(args):
 r=subprocess.run([F,'-v','error','-y',*args],capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.decode()[-2000:])
def writer(path):
 return subprocess.Popen([F,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-g','30','-video_track_timescale','15360',str(path)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
def finish(p):
 p.stdin.close();p.wait()
 if p.returncode:raise RuntimeError(p.stderr.read().decode())
filters='[0:v]split=4[v0][v1][v2][v3];'+''.join(f'[v{i}]trim=start={s}:end={e},setpts=PTS-STARTPTS,fps=30,scale=540:960[q{i}];' for i,(s,e) in enumerate([(8,11),(12,15),(22,26),(4,956/30)]))+'[q0][q1][q2][q3]concat=n=4:v=1:a=0,format=rgb24[v]'
p=subprocess.Popen([F,'-v','error','-i',S,'-filter_complex',filters,'-map','[v]','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
out=writer(T/'tail.mp4');first=[];n=0;start=time.perf_counter()
while True:
 raw=p.stdout.read(W*H*3)
 if not raw:break
 if len(raw)!=W*H*3:raise RuntimeError('incomplete frame')
 im=Image.frombytes('RGB',(W,H),raw);t=n/30
 if t<10:
  local=t if t<3 else t-3 if t<6 else t-6
  dur=3 if t<6 else 4
  z=1+.04*math.sin(math.pi*local/dur)**2;zw,zh=round(W/z),round(H/z);im=im.crop(((W-zw)//2,(H-zh)//2,(W+zw)//2,(H+zh)//2)).resize((W,H),Image.Resampling.BILINEAR)
  # Temporary decorative glints, deliberately not represented as motion tracking.
  draw=ImageDraw.Draw(im)
  for beat in [1.1,4.0,7.4]:
   age=t-beat
   if 0<=age<.45:
    for k in range(7):
     a=k*math.pi*2/7;rad=26+100*age;x=270+math.cos(a)*rad;y=450+math.sin(a)*rad;s=round(10*(1-age/.45))
     draw.line((x-s,y,x+s,y),fill='#ffde8d',width=3);draw.line((x,y-s,x,y+s),fill='#fff5d7',width=3)
 # Preserve all source content by shrinking into a dedicated image area above the bar.
 canvas=Image.new('RGB',(W,H),'#14151a');im=im.resize((494,878),Image.Resampling.BILINEAR);canvas.paste(im,(23,0));d=ImageDraw.Draw(canvas)
 if t<10:
  idx=0 if t<3 else 1 if t<6 else 2
  d.text((20,884),f'今日のハイライト  {idx+1}/3',font=font(20),fill='white')
  spans=[(0,3),(3,6),(6,10)]
  for j,(a,b) in enumerate(spans):
   x=20+500*a/10;end=20+500*b/10;d.rounded_rectangle((x,923,end-5,933),radius=4,fill='#424652')
   if t>=a:d.rounded_rectangle((x,923,max(x+1,20+500*min(t,b)/10-5),933),radius=4,fill='#ffce70')
 else:
  pos=t-10+4;d.text((20,884),f'本編   {int(pos):02d}秒 / 32秒',font=font(20),fill='white');d.line((20,930,520,930),fill='#555966',width=6)
  for j,(a,b) in enumerate([(8,11),(12,15),(22,26)]):
   x=20+500*a/(956/30);end=20+500*b/(956/30);d.line((x,930,end,930),fill='#d6ab59',width=8);d.text((x,908),str(j+1),font=font(14),fill='#ffda85')
  x=20+500*pos/(956/30);d.ellipse((x-5,924,x+5,936),fill='white')
 if n<round((HOOK_END+TRANSITION)*FPS):first.append(canvas)
 else:out.stdin.write(canvas.tobytes())
 n+=1
finish(out);p.wait()
if p.returncode:raise RuntimeError(p.stderr.read().decode())
print(f'Common tail {n} frames in {time.perf_counter()-start:.1f}s',flush=True)
# One composed audio master for every template; original audio remains in highlights and body.
duration=n/30;rate=48000;samples=array.array('h')
for k in range(round(duration*rate)):
 t=k/rate;v=0
 for beat in [1.1,4,7.4]:
  dt=t-beat
  if 0<=dt<.45:v+=.09*math.exp(-dt*10)*(math.sin(2*math.pi*1320*dt)+.4*math.sin(2*math.pi*1980*dt))
 samples.append(int(max(-1,min(1,v))*32767))
with wave.open(str(T/'sfx.wav'),'wb') as wav:wav.setparams((1,2,rate,len(samples),'NONE',''));wav.writeframes(samples.tobytes())
af='[0:a]asplit=5[a0][a1][a2][a3][voice];'+''.join(f'[a{i}]atrim=start={s}:end={e},asetpts=PTS-STARTPTS,apad,atrim=duration={e-s}[b{i}];' for i,(s,e) in enumerate([(8,11),(12,15),(22,26),(4,956/30)]))+'[b0][b1][b2][b3]concat=n=4:v=0:a=1,volume=0:enable=lt(t\\,4)[a];[voice]atrim=start=0.2645:end=4,asetpts=PTS-STARTPTS,apad,atrim=duration=4[hook];[1:a]volume=0:enable=lt(t\\,4)[fx];[a][hook][fx]amix=inputs=3:normalize=0,alimiter=limit=0.9[aout]'
run(['-i',S,'-i',str(T/'sfx.wav'),'-filter_complex',af,'-map','[aout]','-t',str(duration),'-c:a','aac','-b:a','128k',str(T/'audio.m4a')])
def one(e):
 path=V/f'{e["id"]}.mp4';intro=T/f'{e["id"]}-intro.mp4';base=Image.open(O/e['original']['file']).convert('RGB').resize((W,H))
 base=Image.open(O/'plates'/f'{e["id"]}.jpg').convert('RGB')
 style=json.loads((O/'checks'/f'{e["id"]}-layout.json').read_text())['hookColors']
 enc=writer(intro)
 for k,frame in enumerate(first):
  im=compose(base,frame,k/FPS,e['id'],style)
  if k==0:
   im.save(O/'frames'/f'{e["id"]}.jpg',quality=96)
   color=Image.open(O/'plates'/f'{e["id"]}-color.jpg')
   compose(color,frame,0,e['id'],json.loads((O/'checks'/f'{e["id"]}-color-layout.json').read_text())['hookColors']).save(O/'frames'/f'{e["id"]}-color.jpg',quality=96)
  enc.stdin.write(im.resize((W,H),Image.Resampling.LANCZOS).tobytes())
 finish(enc)
 concat=T/f'{e["id"]}.txt';concat.write_text(f"file '{intro.name}'\nfile 'tail.mp4'\n")
 run(['-f','concat','-safe','0','-i',str(concat),'-i',str(T/'audio.m4a'),'-map','0:v','-map','1:a','-c','copy','-movflags','+faststart','-t',str(duration),str(path)])
 print('video '+e['id'],flush=True)
 return {'id':e['id'],'file':str(path.relative_to(O)),'frames':n,'seconds':duration}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(one,M['renders']))
(O/'video-manifest.json').write_text(json.dumps({'status':'layout-motion-prototype','hookSeconds':4,'hookAudio':'source voice at output 0; removed 0.2645s leading silence; preview audio muted during Hook','hookLines':'three centered lines simultaneously from frame zero','hookFont':'M PLUS Rounded 1c ExtraBold','hookColor':'sampled from selected collage','sparkles':'decorative prototype, not existing pose-tracked effect','selection':'manual demonstration only','sourceRanges':[[8,11],[12,15],[22,26]],'outputRanges':[[0,3],[3,6],[6,10]],'bodyStart':10,'bodySourceStart':4,'previewStartsAt':0,'previewCount':1,'hookEnd':HOOK_END,'replayAfterExpansion':False,'fps':30,'rendered':results,'desktopGenerationSeconds':round(time.perf_counter()-start,2)},ensure_ascii=False,indent=2))
print(f'All {len(results)} videos complete',flush=True)
