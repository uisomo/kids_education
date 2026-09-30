"""Existing glossy assets: 0.5s thumbnail, 4s Hook in three beats, then body."""
from pathlib import Path
import json, subprocess, hashlib, importlib.util, sys
from PIL import Image,ImageChops
import imageio_ffmpeg
from opening import preferred_treatment,HOOK_TEXT
spec=importlib.util.spec_from_file_location('motion',Path(__file__).with_name('glossy-hook-motion.py'));motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(motion)
R=Path(__file__).resolve().parents[2];O=R/'docs/highlight-collage-demo';OUT=O/'glossy-lab/prototype';W,H,FPS=540,960,30
GLOSSY={'3889','3908','3900','3897','3885'}
ALL_IDS=sorted(e['id'] for e in json.loads((O/'manifest.json').read_text())['renders'])
IDS=[i for i in sys.argv[1:] if i in ALL_IDS] or ALL_IDS
F=imageio_ffmpeg.get_ffmpeg_exe();source=json.loads((O/'manifest.json').read_text())['source'];patterns=json.loads((O/'checks/hook-patterns.json').read_text())
protected=[O/'videos'/f'{i}.mp4' for i in IDS];before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
def run(args):subprocess.run([F,'-v','error','-y',*map(str,args)],check=True)
# No playback speed change: select 40 original frames from each highlight.
starts=[8,12,22];frames=[]
for start in starts:
 p=subprocess.Popen([F,'-v','error','-ss',str(start),'-i',source,'-vf','fps=30,scale=540:960','-frames:v','40','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 for _ in range(40):
  raw=p.stdout.read(W*H*3);assert len(raw)==W*H*3;frames.append(Image.frombytes('RGB',(W,H),raw))
 p.stdout.close();p.wait();assert p.returncode==0,p.stderr.read().decode()
# Reuse the approved common body's visual timing from source 4 seconds onwards.
# Common tail begins at highlight t=4.3, so its body begins 5.7 seconds into tail.
body=OUT/'body-v2.mp4'
run(['-ss','5.7','-i',O/'staging/tail.mp4','-an','-frames:v','836','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-r','30','-g','30','-video_track_timescale','15360',body])
audio=OUT/'audio-v2.m4a'
af='[0:a]asplit=2[voice][body];[voice]atrim=start=0.2645:end=4.2645,asetpts=PTS-STARTPTS,apad,atrim=duration=4,adelay=500:all=1[hook];[body]atrim=start=4:end=31.8666667,asetpts=PTS-STARTPTS[main];[hook][main]concat=n=2:v=0:a=1[out]'
run(['-i',source,'-filter_complex',af,'-map','[out]','-c:a','aac','-b:a','128k',audio])
report=[]
for ident in IDS:
 col={'3897':'#167dc5','3885':'#c22e70'}.get(ident) or json.loads((O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
 treatments=preferred_treatment(col,patterns[ident]);thumbnail=Image.open(OUT/f'{ident}-check-0.jpg' if ident in GLOSSY else O/'frames'/f'{ident}.jpg').convert('RGB')
 intro=OUT/f'{ident}-intro-v2.mp4'
 enc=subprocess.Popen([F,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','540x960','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-g','30','-video_track_timescale','15360',str(intro)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
 for k in range(135):
  beat=motion.beat_at(k)
  im=thumbnail if beat is None else motion.overlay_line(frames[k-15],ident,treatments[beat],HOOK_TEXT[beat],(k-15)%40)
  if k in [0,14,15,19,24,54,55,64,94,95,104,134]:im.save(OUT/f'{ident}-v2-check-{k}.jpg',quality=95)
  enc.stdin.write(im.resize((W,H),Image.Resampling.LANCZOS).tobytes())
 enc.stdin.close();enc.wait();assert enc.returncode==0,enc.stderr.read().decode()
 listing=OUT/f'{ident}-concat-v2.txt';listing.write_text(f"file '{intro.name}'\nfile '{body.name}'\n")
 dest=OUT/f'{ident}-v2.mp4'
 run(['-f','concat','-safe','0','-i',listing,'-i',audio,'-map','0:v','-map','1:a','-c','copy','-movflags','+faststart','-t',str(971/30),dest])
 reader=imageio_ffmpeg.read_frames(str(dest),pix_fmt='rgb24');meta=next(reader);count=0;first=None;last_thumb=None;first_video=None
 for raw in reader:
  if count==0:first=raw
  if count==14:last_thumb=raw
  if count==15:first_video=raw
  count+=1
 assert count==971 and meta['size']==(540,960),(count,meta)
 assert first_video!=last_thumb
 report.append({'id':ident,'frames':count,'duration':meta['duration'],'fps':meta['fps'],'size':meta['size'],'artwork':'generated-glossy-review' if ident in GLOSSY else 'original-layout-motion-baseline'})
 print('verified-v2',ident,count,flush=True)
assert before=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
previous=OUT/'verification-v2.json'
if previous.exists():
 prior=json.loads(previous.read_text()).get('renders',[]);latest={e['id']:e for e in prior};latest.update({e['id']:e for e in report});report=[latest[k] for k in sorted(latest)]
(OUT/'verification-v2.json').write_text(json.dumps({'reviewOnly':True,'protectedVideosUnchanged':True,'thumbnailFrames':15,'thumbnailSeconds':.5,'hookFrames':120,'hookSeconds':4,'beatFrames':[40,40,40],'highlightSourceStarts':starts,'text':'one line per highlight; uniform zoom .55 to 1 over 9 frames','bodyStartsAt':4.5,'bodySourceStartsAt':4,'renders':report},ensure_ascii=False,indent=2))
