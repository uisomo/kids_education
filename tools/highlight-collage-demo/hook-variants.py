# -*- coding: utf-8 -*-
"""Static alternatives only; preserve the accepted video/default Hook treatment."""
from pathlib import Path
import json,html,sys
MIXED="--mixed" in sys.argv
READABLE="--readable" in sys.argv
from PIL import Image,ImageColor,ImageDraw,ImageFont
from opening import compose
O=Path(__file__).resolve().parents[2]/'docs/highlight-collage-demo'
D=O/('hook-readable' if READABLE else 'hook-mixed' if MIXED else 'hook-variants');D.mkdir(exist_ok=True)
labels=['現在の案','白を25％混ぜる','白を50％混ぜる','白文字＋主色の縁','主色＋黒い重なり','主色＋白い重なり']
details=['主色の文字・黒縁・主色の影','淡い主色・黒縁・淡い主色の影','さらに淡い主色・黒縁・淡い主色の影','白文字・主色の縁・黒い影','主色の文字・黒縁・黒い影','主色の文字・白縁・白い影']
patterns=[(0,1,2),(0,3,0),(3,0,3),(4,0,5),(1,3,4),(5,4,3)]
if MIXED:
 labels=['上から淡く','中央だけ白文字','中央だけ主色','黒から白の重なり','淡色・白・黒い影','白い影・黒い影・白文字']
 details=[f'上：{a+1} ／ 中：{b+1} ／ 下：{c+1}（元の6案の番号）' for a,b,c in patterns]
if READABLE:
 from itertools import permutations
 patterns=list(permutations(range(3)))
 names=['普通','黒','淡色']
 labels=['・'.join(names[j] for j in row) for row in patterns]
 details=['上から '+ ' → '.join(names[j] for j in row) for row in patterns]
ids=['3908'  ,'3879','3885','3905'];groups=[]
for ident in ids:
 base=Image.open(O/'plates'/f'{ident}.jpg');frame=Image.open(O/'frames'/f'{ident}.jpg').crop((546,875,699,1147))
 color=json.loads((O/'checks'/f'{ident}-layout.json').read_text())['hookColors'][0]
 rgb=ImageColor.getrgb(color)
 def milk(amount):return tuple(round(c*(1-amount)+255*amount) for c in rgb)
 styles=[{}, {'fill':milk(.25)}, {'fill':milk(.5)}, {'fill':'#ffffff','outline':color,'shadow':'#171717'}, {'shadow':'#171717'}, {'outline':'#ffffff','shadow':'#ffffff'}]
 if READABLE:styles=[{}, {'fill':'#171717','outline':'#ffffff','shadow':'#171717'}, {'fill':milk(.4),'outline':'#171717'}]
 if MIXED or READABLE:styles=[[styles[j] for j in row] for row in patterns]
 cards=[];sheet=Image.new('RGB',(1080,1380),'#f5f5f5');font=ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',19)
 for i,style in enumerate(styles):
  im=compose(base,frame,0,ident,[color],style);filename=f'{ident}-{i}.jpg';im.save(D/filename,quality=94)
  x=(i%3)*360;y=(i//3)*690
  sheet.paste(im.resize((360,640)),(x,y+50));ImageDraw.Draw(sheet).text((x+12,y+13),f'{i+1}. {labels[i]}',font=font,fill='#171717')
  cards.append(f'<article><h2>{i+1}. {labels[i]}</h2><p>{details[i]}</p><a href="{filename}"><img src="{filename}" alt="{html.escape(labels[i])}" /></a></article>')
 sheet.save(D/f'{ident}-comparison.jpg',quality=94)
 groups.append(f'<section data-id="{ident}"'+('' if ident=='3908' else ' hidden')+'>'+''.join(cards)+'</section>')
page=('''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hookの単色・白・重なり比較</title><style>
body{margin:0;background:#f6f6f4;color:#171717;font-family:system-ui,sans-serif}header{padding:24px 30px}h1{font-size:25px;margin:8px 0}p{line-height:1.6}select,a{font-size:16px}select{padding:10px}section{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:0 24px 30px}section[hidden]{display:none}article{background:white;padding:12px;border:1px solid #ddd;border-radius:10px}h2{font-size:18px;margin:0}article p{font-size:13px;color:#555;margin:6px 0}img{width:100%;display:block}a{color:#333}@media(min-width:1400px){section{grid-template-columns:repeat(6,minmax(0,1fr))}}@media(max-width:700px){section{grid-template-columns:repeat(2,minmax(0,1fr));padding:0 10px;gap:8px}h2{font-size:14px}}
</style><header><a href="../">← テンプレート一覧</a><h1>主色はひとつ。白の量と、重なりを比較。</h1><p>同じ写真・配色・文字位置で6案。3行の色は統一しています。現在の動画は変更せず、静止画で比較します。</p><label>背景 <select id="background"><option value="3908">3908 · 円と人物</option><option value="3879">3879 · 複数の色面</option><option value="3885">3885 · 白黒</option><option value="3905">3905 · 暗い背景</option></select></label></header>'''+''.join(groups)+'''<script>document.querySelector('#background').addEventListener('change',e=>{document.querySelectorAll('section').forEach(s=>s.hidden=s.dataset.id!==e.target.value)})</script></html>''')
if READABLE:
 page=page.replace('Hookの単色・白・重なり比較','Hookの普通・黒・淡色比較').replace('主色はひとつ。白の量と、重なりを比較。','普通・黒・淡色。3行の並びを比較。').replace('3行の色は統一しています。','普通と淡色は黒縁、黒文字は白縁＋黒い影。淡色は主色に白を40％混ぜています。').replace('← テンプレート一覧</a>','← テンプレート一覧</a>　<a href="../hook-mixed/">前のミックス比較</a>')
elif MIXED:
 page=page.replace('Hookの単色・白・重なり比較','Hookの3行ミックス比較').replace('主色はひとつ。白の量と、重なりを比較。','主色はひとつ。3行のパターンを組み合わせる。').replace('3行の色は統一しています。','元の6案を行別に組み合わせています。有彩色の色相は同じです。').replace('← テンプレート一覧</a>','← テンプレート一覧</a>　<a href="../hook-variants/">元の6案</a>')
else:
 page=page.replace('← テンプレート一覧</a>','← テンプレート一覧</a>　<a href="../hook-mixed/">3行ミックス比較 →</a>')
page=page.replace('← テンプレート一覧</a>','← テンプレート一覧</a>　<a href="../hook-readable/">普通・黒・淡色の比較</a>') if not READABLE else page
(D/'index.html').write_text(page)
print('24 previews generated:',D.name)
