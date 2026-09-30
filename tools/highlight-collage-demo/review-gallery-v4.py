"""Build typography and fixed-asset review galleries; no approved output writes."""
from pathlib import Path
import json,html,os
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'docs/highlight-collage-demo'
PROTO=BASE/'glossy-lab/prototype';TYPE=PROTO/'typography-v4';FIXED=BASE/'glossy-lab/fixed-assets-v1'
ids=sorted(e['id'] for e in json.loads((BASE/'manifest.json').read_text())['renders'])
css='''body{font:16px/1.7 system-ui;background:#f4f1ec;color:#25222a;margin:24px}main{max-width:1200px;margin:auto}article{background:white;padding:20px;margin:24px 0;border-radius:12px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}img,video{width:100%;max-height:520px;object-fit:contain}figure{margin:0}a{color:#305db0}figcaption{padding:6px}nav{display:flex;flex-wrap:wrap;gap:12px}@media(max-width:650px){.grid{grid-template-columns:repeat(2,1fr)}body{margin:12px}}'''
def picture(path,label,base):
 src=html.escape(os.path.relpath(path,base))
 return f'<figure><a href="{src}"><img loading="lazy" src="{src}" alt="{html.escape(label)}"></a><figcaption>{html.escape(label)}</figcaption></figure>'
def page(title,body):return '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+title+'</title><style>'+css+'</style><main><h1>'+title+'</h1>'+body+'</main></html>'

body='<p>全35案をM PLUS Rounded 1c ExtraBoldへ統一。文字の横伸ばしをせず、元の位置と回転を保って幅に合わせています。録画内の文字は元のままです。</p><p><a href="../index-v4.html">動画レビュー</a> · <a href="../../fixed-assets-v1/">背景・星の追加</a></p><nav>'+''.join(f'<a href="#t{i}">{i}</a>' for i in ids)+'</nav>'
for i in ids:
 old=BASE/'plates'/f'{i}.jpg'
 if i in ['3870','3879','3885','3889','3897','3908']:old=BASE/'glossy-lab/vivid-gallery'/i/'art.jpg'
 if i=='3900':old=BASE/'glossy-lab/whole-gloss/3900-vivid-composite-art.jpg'
 body+=f'<article id="t{i}"><h2>{i}</h2><div class="grid">'
 for path,label in [(old,'変更前'),(TYPE/f'{i}-art.jpg','丸ゴシック版'),(TYPE/f'{i}-thumbnail.jpg','First Frame')]:body+=picture(path,label,TYPE)
 body+=f'<figure><video controls preload="none" poster="{i}-thumbnail.jpg" src="../{i}-v4.mp4"></video><figcaption>v4動画</figcaption></figure></div></article>'
(TYPE/'index.html').write_text(page('全35案：丸ゴシックの比較',body))
for n in range(5):
 sheet=Image.new('RGB',(1512,414),'#ddd');draw=ImageDraw.Draw(sheet)
 for j,i in enumerate(ids[n*7:n*7+7]):
  im=Image.open(TYPE/f'{i}-art.jpg');im.thumbnail((216,384));sheet.paste(im,(j*216,30));draw.text((j*216+8,8),i,fill='black')
 sheet.save(TYPE/f'review-{n+1}.jpg',quality=93)
body='<p>3872は中央が透明な丸い星。3887は生成背景から3つの色面を取り出し、元の座標へ配置しました。写真の切り取りと位置、丸ゴシック版の文字座標・回転は変更していません。</p><p><a href="../prototype/index-v4.html">全35案のv4動画</a> · <a href="../prototype/typography-v4/">書体比較</a></p>'
for i in ['3872','3887']:
 body+=f'<article><h2>{i}</h2><div class="grid">'
 asset=FIXED/i/('generated-outline-star.png' if i=='3872' else 'background-aligned.png')
 for path,label in [(FIXED/i/'rounded-control.jpg','丸ゴシック版の元構図'),(asset,'生成素材／配置を合わせた背景'),(FIXED/i/'art.jpg','合成後'),(FIXED/i/'thumbnail.jpg','First Frame')]:body+=picture(path,label,FIXED)
 body+=f'</div><p><a href="../prototype/{i}-v4.mp4">最終動画を再生</a> · <a href="{i}/prompt.txt">生成プロンプト</a> · <a href="{i}/metadata.json">サイズ・アンカー・前後関係・検証結果</a></p></article>'
body+='<h2>参照画像の修正</h2><p>3895の顔追従線と3903の人物アルファ由来の色面を除去。写真前後のレイヤー分離は次の素材化で扱います。</p><div class="grid">'
for i in ['3895','3903']:
 body+=picture(BASE/'glossy-lab/vivid-gallery'/i/'layout-reference.png',i+'：旧参照',FIXED)
 body+=picture(FIXED/'reference-repair'/i/'layout-reference.png',i+'：修正参照',FIXED)
body+='</div>'
(FIXED/'index.html').write_text(page('固定配置のGlossy素材：追加2案',body))

rows=json.loads((TYPE/'typography.json').read_text());checks=[]
for e in rows:
 if e['id']=='3900':continue
 old=json.loads((BASE/'checks'/f"{e['id']}-layout.json").read_text())
 assert len(e['slots'])==len(old['slots'])
 keys=['sourceFrame','sourceCrop','destination','rotation','clip']
 assert all(all(a.get(k)==b.get(k) for k in keys) for a,b in zip(old['slots'],e['slots'])),e['id']
 checks.append({'id':e['id'],'photoGeometryUnchanged':True})
report={'font':'M PLUS Rounded 1c ExtraBold','templates':35,'photoGeometry':checks,
 '3900':'accepted vivid layout retained; differs from historical checks/3900-layout.json',
 'coverage':['collage headings','small annotations','dates','3902 photo glyph mask','First Frame Hook','First Frame labels','Hook header and beat counter','body time and highlight numbers'],
 'recordedText':'unchanged; part of source footage','materialGlyphFill':False,'videoTiming':'0.5s thumbnail + 3 × 40 frames Hook + body at 4.5s',
 'newGlossyCandidates':['3872','3887'],'fixedReferenceContamination':['3895','3903'],
 'remaining':['Other asset candidates remain at their prior state.','Other interleaved foreground/background assets still need template-specific separation.','Existing seven generated backgrounds retain previously reported geometry limitations.','No production or approved-video replacement.']}
(TYPE/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('Typography gallery: 35 templates; fixed assets: 2; photo geometry: 34 unchanged + accepted 3900')
