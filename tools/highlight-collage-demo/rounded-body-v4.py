"""Replace only the review body's added footer with rounded typography."""
from pathlib import Path
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'docs/highlight-collage-demo/glossy-lab/prototype'
FONT=Path(__file__).parent/'fonts/MPLUSRounded1c-ExtraBold.ttf'
font=lambda size:ImageFont.truetype(str(FONT),size)
F=imageio_ffmpeg.get_ffmpeg_exe()
reader=imageio_ffmpeg.read_frames(str(OUT/'body-v3.mp4'),pix_fmt='rgb24')
meta=next(reader);assert meta['size']==(540,960)
enc=subprocess.Popen([F,'-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','540x960','-r','30','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-g','30','-video_track_timescale','15360',str(OUT/'body-v4.mp4')],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
count=0
for k,raw in enumerate(reader):
    im=Image.frombytes('RGB',(540,960),raw);draw=ImageDraw.Draw(im)
    draw.rectangle((0,878,539,959),fill='#14151a')
    pos=4+k/30
    draw.text((20,884),f'本編   {int(pos):02d}秒 / 32秒',font=font(20),fill='white')
    draw.line((20,930,520,930),fill='#555966',width=6)
    for j,(a,b) in enumerate([(8,11),(12,15),(22,26)]):
        x=20+500*a/(956/30);end=20+500*b/(956/30)
        draw.line((x,930,end,930),fill='#d6ab59',width=8)
        draw.text((x,908),str(j+1),font=font(14),fill='#ffda85')
    x=20+500*pos/(956/30);draw.ellipse((x-5,924,x+5,936),fill='white')
    if k in (0,400,835):im.save(OUT/f'body-v4-check-{k}.jpg',quality=95)
    enc.stdin.write(im.tobytes());count+=1
enc.stdin.close();enc.wait();assert enc.returncode==0,enc.stderr.read().decode()
assert count==836,count
print('Rounded footer: 836 frames; source image area retained before encoding')
