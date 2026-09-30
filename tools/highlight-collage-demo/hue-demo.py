# -*- coding: utf-8 -*-
from pathlib import Path
import colorsys,json
from PIL import Image,ImageDraw,ImageFont,ImageColor
import refine
from additions import echoes
ROOT=refine.O;D=ROOT/'hue-demo';D.mkdir(exist_ok=True)
font=ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',18)
sheet=Image.new('RGB',(1080,1450),'#f5f5f5');cards=[];report=[]
for i,angle in enumerate(range(0,360,60)):
 out=D/str(angle)
 for part in ['checks','plates','frames']:(out/part).mkdir(parents=True,exist_ok=True)
 refine.O=out
 meta=echoes(hueOverride=angle)
 im=Image.open(out/'plates/3907.jpg');im.save(D/f'hue-{angle}.jpg',quality=94)
 colors=[refine.PAINT_MAP[c] for c in ['#dbc340','#368bc0','#bc4d59']]
 hues=[colorsys.rgb_to_hsv(*(x/255 for x in ImageColor.getrgb(c)))[0]*360 for c in colors]
 report.append({'rotation':angle,'colors':colors,'hues':hues,'relativeOffsets':[(h-hues[0])%360 for h in hues]})
 x=i%3*360;y=i//3*725;sheet.paste(im.resize((360,640)),(x,y+85));draw=ImageDraw.Draw(sheet)
 title='参照色・0度' if angle==0 else f'色相を＋{angle}度'
 draw.text((x+12,y+10),title,font=font,fill='#111111')
 for j,c in enumerate(colors):draw.rectangle((x+12+j*110,y+42,x+112+j*110,y+69),fill=c)
 chips=''.join(f'<span style="background:{c}">{c}</span>' for c in colors)
 cards.append(f'<article><h2>{title}</h2><div class="chips">{chips}</div><img src="hue-{angle}.jpg?rev=2" alt="{title}の人物の同系色濃淡"></article>')
refine.O=ROOT
(D/'comparison.jpg').write_bytes(b'')
sheet.save(D/'comparison.jpg',quality=94)
(D/'relationships.json').write_text(json.dumps(report,indent=2))
for row in report:
 for a,b in zip(row['relativeOffsets'],report[0]['relativeOffsets']):assert abs((a-b+180)%360-180)<1
(D/'index.html').write_text('''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3907 色相の関係と濃淡加工</title><style>body{font-family:system-ui;margin:0;background:#f5f5f3;color:#171717}header{padding:24px}h1{font-size:25px}p{line-height:1.7;max-width:1000px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:0 24px 24px}article{background:white;padding:12px;border-radius:10px}h2{font-size:18px}.chips{display:flex;gap:5px;margin-bottom:10px}.chips span{flex:1;padding:10px 3px;text-align:center;color:white;font-size:12px;text-shadow:0 1px 3px black}img{width:100%;display:block}@media(max-width:650px){main{grid-template-columns:repeat(2,1fr);padding:10px;gap:8px}.chips span{font-size:9px}}</style><header><a href="../">← テンプレート一覧</a><h1>3907：3色の間隔を保ち、色相だけを回す</h1><p>左上は黄色・シアン青・ピンクの参照近似色。それ以外は3色すべてに同じ角度を加えています。背後3人の黒い陰影を取り除き、暗部は主色の明度55％、明部は白65％を混ぜた同系色へ写し、顔・服の濃淡を残しました。中央人物は白黒です。Hookを外して加工と色を比較しています。</p><p>保持するもの：HSV色相差、各色の彩度・明度、人物の配置。保持しないもの：人が感じる明るさやコントラストの完全な一致。色付き人物の重なりは通常の前後合成です。</p></header><main>'''+''.join(cards)+'</main></html>')
print('Six hue variants; pairwise hue offsets verified within 1 degree of 8-bit rounding.')
