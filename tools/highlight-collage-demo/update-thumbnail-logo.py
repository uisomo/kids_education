"""Brand all review First Frames; preserve title treatment, body, and audio."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,subprocess,shutil,hashlib
import imageio_ffmpeg
from PIL import Image,ImageDraw
from thumbnail_brand import branded_thumbnail,LOGO
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'docs/highlight-collage-demo'
OUT=BASE/'glossy-lab/prototype';WORK=OUT/'logo-v4';WORK.mkdir(exist_ok=True)
IDS=sorted(e['id'] for e in json.loads((BASE/'manifest.json').read_text())['renders'])
F=imageio_ffmpeg.get_ffmpeg_exe()
protected=[BASE/'videos'/f'{i}.mp4' for i in IDS]+[OUT/'body-v4.mp4',OUT/'audio-v3.m4a']
hashes=lambda:{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}
before=hashes()
def run(args):
 p=subprocess.run([F,'-v','error','-y',*map(str,args)],capture_output=True,text=True)
 if p.returncode:raise RuntimeError(p.stderr)
 return p.stdout
for ident in IDS:
 thumb=OUT/'typography-v4'/f'{ident}-thumbnail.jpg';backup=WORK/f'{ident}-before.jpg'
 if not backup.exists():shutil.copy2(thumb,backup)
 im=branded_thumbnail(Image.open(backup));im.save(thumb,quality=96)
 im.resize((540,960),Image.Resampling.LANCZOS).save(WORK/f'{ident}.png')
 for k in [0,14]:im.save(OUT/f'{ident}-v4-check-{k}.jpg',quality=95)
 if ident in ['3872','3887']:im.save(BASE/'glossy-lab/fixed-assets-v1'/ident/'thumbnail.jpg',quality=96)
for n in range(5):
 sheet=Image.new('RGB',(1512,414),'#ddd');d=ImageDraw.Draw(sheet)
 for j,i in enumerate(IDS[n*7:n*7+7]):
  im=Image.open(OUT/'typography-v4'/f'{i}-thumbnail.jpg');im.thumbnail((216,384));sheet.paste(im,(j*216,30));d.text((j*216+8,8),i,fill='black')
 sheet.save(WORK/f'review-{n+1}.jpg',quality=93)
def one(ident):
 intro=WORK/f'{ident}-intro.mp4'
 # The heading-updated intro is the immutable input to this thumbnail revision.
 source=OUT/'title-v4'/f'{ident}-intro.mp4'
 run(['-i',source,'-loop','1','-framerate','30','-i',WORK/f'{ident}.png','-filter_complex',"[0:v][1:v]overlay=0:0:enable='between(n,0,14)'[v]",'-map','[v]','-an','-frames:v','135','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r','30','-g','30','-video_track_timescale','15360',intro])
 listing=WORK/f'{ident}-concat.txt';listing.write_text(f"file '{intro.name}'\nfile '../body-v4.mp4'\n")
 candidate=WORK/f'{ident}-candidate.mp4'
 run(['-f','concat','-safe','0','-i',listing,'-i',OUT/'audio-v3.m4a','-map','0:v','-map','1:a','-c','copy','-movflags','+faststart','-t',str(971/30),candidate])
 progress=run(['-i',candidate,'-map','0:v:0','-map','0:a:0','-f','null','-','-progress','pipe:1'])
 frames=[int(s.split('=')[1]) for s in progress.splitlines() if s.startswith('frame=')];assert frames[-1]==971
 candidate.replace(OUT/f'{ident}-v4.mp4')
 print('logo verified',ident,flush=True)
 return {'id':ident,'frames':971,'audioVideoDecode':True}
with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(one,IDS))
assert before==hashes()
report={'logo':str(LOGO.relative_to(ROOT)),'source':'karate-trainer/public/images/decor-banner.png','bounds720':[462,12,702,103],'frames':[0,14],'seconds':0.5,'protectedFilesUnchanged':True,'renders':results}
(WORK/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
p=OUT/'verification-v4.json';d=json.loads(p.read_text());d['thumbnailLogo']={k:v for k,v in report.items() if k!='renders'};p.write_text(json.dumps(d,ensure_ascii=False,indent=2))
