"""Update the v4 Hook heading; retain the common body and audio streams."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import importlib.util,json,subprocess,shutil,hashlib
import imageio_ffmpeg
from PIL import Image

ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'docs/highlight-collage-demo'
OUT=BASE/'glossy-lab/prototype';ASSETS=OUT/'title-v4';ASSETS.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('motion',Path(__file__).with_name('glossy-hook-motion-v4.py'))
motion=importlib.util.module_from_spec(spec);spec.loader.exec_module(motion)
F=imageio_ffmpeg.get_ffmpeg_exe()
ids=sorted(e['id'] for e in json.loads((BASE/'manifest.json').read_text())['renders'])
protected=[BASE/'videos'/f'{i}.mp4' for i in ids]+[OUT/'body-v4.mp4',OUT/'audio-v3.m4a']
before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
for ident in ids:
 color={'3897':'#167dc5','3885':'#c22e70'}.get(ident) or json.loads((BASE/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
 for beat in range(3):motion.header_overlay(color,beat).resize((540,93),Image.Resampling.LANCZOS).save(ASSETS/f'{ident}-{beat}.png')

def run(args):
 p=subprocess.run([F,'-v','error','-y',*map(str,args)],capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr)
 return p.stdout

def one(ident):
 old=ASSETS/f'{ident}-before.mp4'
 if not old.exists():shutil.copy2(OUT/f'{ident}-intro-v4.mp4',old)
 intro=ASSETS/f'{ident}-intro.mp4'
 args=['-i',old]
 for beat in range(3):args+=['-loop','1','-framerate','30','-i',ASSETS/f'{ident}-{beat}.png']
 filters="[0:v][1:v]overlay=0:0:enable='between(n,15,54)'[a];[a][2:v]overlay=0:0:enable='between(n,55,94)'[b];[b][3:v]overlay=0:0:enable='between(n,95,134)'[v]"
 run(args+['-filter_complex',filters,'-map','[v]','-an','-frames:v','135','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r','30','-g','30','-video_track_timescale','15360',intro])
 listing=ASSETS/f'{ident}-concat.txt';listing.write_text(f"file '{intro.name}'\nfile '../body-v4.mp4'\n")
 candidate=ASSETS/f'{ident}-candidate.mp4'
 run(['-f','concat','-safe','0','-i',listing,'-i',OUT/'audio-v3.m4a','-map','0:v','-map','1:a','-c','copy','-movflags','+faststart','-t',str(971/30),candidate])
 progress=run(['-i',candidate,'-map','0:v:0','-map','0:a:0','-f','null','-','-progress','pipe:1'])
 frames=[int(s.split('=')[1]) for s in progress.splitlines() if s.startswith('frame=')]
 assert frames[-1]==971,(ident,frames)
 candidate.replace(OUT/f'{ident}-v4.mp4')
 # Keep the renderer's inspectable Hook snapshots consistent with the new heading.
 color={'3897':'#167dc5','3885':'#c22e70'}.get(ident) or json.loads((BASE/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
 for k in [15,19,24,54,55,64,94,95,104,134]:
  path=OUT/f'{ident}-v4-check-{k}.jpg';im=Image.open(path).convert('RGBA')
  im.alpha_composite(motion.header_overlay(color,(k-15)//40));im.convert('RGB').save(path,quality=95)
 print('title verified',ident,flush=True)
 return {'id':ident,'frames':971,'audioVideoDecode':True}

with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(one,ids))
assert before=={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
report={'title':'今日のハイライト','font':'M PLUS Rounded 1c ExtraBold (same as Hook)','sizeBefore':36,'sizeAfter':52,'outlinePixels':3,'shadowOffset':[3,4],'decorations':'two reused generated hollow stars','titleCenter':[330,63],'headerBounds':[0,0,720,124],'unchanged':['thumbnail design','central Hook','timing','common body file','audio master','approved videos'],'renders':results}
(ASSETS/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
v=json.loads((OUT/'verification-v4.json').read_text());v['highlightHeading']=report.copy();v['highlightHeading'].pop('renders');(OUT/'verification-v4.json').write_text(json.dumps(v,ensure_ascii=False,indent=2))
