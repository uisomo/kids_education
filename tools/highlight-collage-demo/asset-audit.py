"""Read-only audit of existing artwork; writes only the independent audit folder."""
from pathlib import Path
import ast
import hashlib
import html
import json
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/highlight-collage-demo'
OUT = BASE / 'glossy-lab/asset-audit-20260930'
OUT.mkdir(exist_ok=True)

# Decisions made after inspecting original plates, saved references, and renderers.
DECISIONS = '''3870|再利用候補|more.pastel|縦帯・斜め方眼紙と前景の星。5人の重なりを維持。帯境界のずれは再検証。
3871|生成不要|more.scatter|13写真と6キャラの小さな切り抜き、広い余白。新しい枠を足さない。
3872|個別素材|more.dense_rounds|固定した4つの星だけを候補にする。円と楕円は写真マスクであり、Glossy円へ置換しない。
3873|組合せ|more.grunge|背面の白黒紙片は背景候補。写真の後に描く擦れは別レイヤー。微細文字は生成しない。
3877|個別素材|more.botanical|円(53,589,252,788)と細帯(371,112,385,545)。5人物と文字の交互の重なりを保持。
3878|背景全体|refine.editorial|黒い8写真窓・灰色地・仕切り。窓の比率と文字・細線を保持。仕切りの粒子を反射に誤変換しない。
3879|再利用候補|refine.scrapbook|3つの曲面と斜めテープは背面、4星は前景。写真に合わせて背景のずれを直す。
3880|個別素材|refine.stripe|赤い2矩形と紙片のみ。文字は人物アルファで隠す既存処理を保持。
3881|組合せ|refine.layers|背面の5矩形と前景の透過帯2本を分離。人物内部の2色加工とキャラは生成素材に含めない。
3882|組合せ|refine.geometry|固定色面・方眼は背面、チェッカーは頭部の後／キャラの前後で分割。円形写真窓は写真マスク。
3883|生成不要|more.mosaic|17写真の密集が主役。既存の地と写真背景を保持し、タイルに厚い枠を足さない。
3884|生成不要|more.jazz|白い余白・5写真・巨大文字。独立したGlossy対象図形がない。
3885|再利用候補|refine.manifesto|7つの顔断片と白い区切り。生成角丸と元の直線写真端の整合は未合格。文字と写真は動かさない。
3886|生成不要|more.pop|単色地・巨大文字・6切り抜き。今回は単色地を保ち、対象図形を新設しない。
3887|背景全体|refine.swiss|固定色面3つと写真窓3つ。白い隙間と矩形をまたぐ文字を保持。
3888|対象外|more.contour|master人物アルファ内に別写真と文字を配置する。
3889|再利用候補|refine.cards|7カード。頭部と指定した腕だけ越境、文字は人物の背後。生成枠端と人物の切断面を要精査。
3890|個別素材|more.map_page|斜線紙片と既存紙面だけ。印の細線・日付・文字は独立。新しい印の地を増設しない。
3891|生成不要|more.fragments|新聞風文字と12顔断片が主役。文字を抜くと単色地なので今回は追加生成しない。
3892|対象外|more.portrait_mosaic|主役人物の外周アルファ内を不均等写真タイルで埋める。
3893|対象外|more.cinema|主役人物のアルファ内に映画風写真分割を配置する。
3894|対象外|refine.silhouette|主役人物のアルファと白い不規則仕切りの内部に別写真を配置する。
3895|組合せ|refine.nine|3×3全体で1枚。セル4の前景円、セル7の斜め紙、セル9の文字下紙を分離。中央セルの顔追従線は生成禁止。
3896|生成不要|more.islands|13写真の島と背後の巨大文字、余白。枠や装飾を追加しない。
3897|再利用候補|more.six|2×3全体で1枚、青の単色濃淡候補。顔追従文字は独立。生成の角丸と写真端・白い区切りを要精査。
3898|対象外|more.split|額ランドマークを基準とする同一人物の分割で、固定背景素材ではない。
3899|背景全体|more.tower|右上(346,0,659,653)と左下(54,650,348,1279)の色面。中央の7写真と2キャラの塔を保持。
3900|再利用候補|glossy-demo.friendly_sketch|了承済みvivid方向見本が基準。古いplatesの3帯構図とは写真座標が違うので、旧layout.jsonを新候補の座標契約にしない。
3901|個別素材|refine.warm|固定星2つ(546,362,r76)/(192,1058,r80)のみ。最初の星は目追従なので背景に焼かない。写真の暖色濃淡と星の透過を保持。
3902|対象外|additions.type_portrait|漢字字形と右半顔に同じ写真が連続するマスク構図。
3903|組合せ|additions.head_grid|3×5全体で1枚。固定帯・星・弧をセル別に扱う。顔アルファ色面は素材から除外。セル5の斜め帯とセル3の星は写真の前。
3904|生成不要|additions.crowd|17人物の群像と上部余白。新しいGlossy面を足さない。
3905|個別素材|additions.diagram|背面5円のみ。前景の細円・線・三角形と日本語注記を鮮明な既存レイヤーとして維持。
3907|生成不要|additions.echoes|色付きの形は人物そのもの。色面加工と人物アルファを維持しGlossy化しない。
3908|再利用候補|additions.circle_portrait|円(77,87,644,668)のみ。生成円の位置ずれを確認。人物・足元相当の切断位置・接地影は保持。'''

ISSUES = [
    {'id':'seed-3895','severity':'生成前修正','templates':['3895'], 'finding':'保存済みlayout-reference.png中央セルに目・口の描き込みが残る。現在のprepareには上書き消去があるが、保存画像には反映されていない。', 'action':'中央セルを含む参照を作り直し、顔追従線は独立レイヤーにする。'},
    {'id':'seed-3903','severity':'生成前修正','templates':['3903'], 'finding':'保存済み参照に人物アルファ由来の頭部・帯の形が残る。seedでもsubjectMaskを用いた色面処理が動く。', 'action':'固定図形のみ抽出し、顔色面を生成参照から除外する。'},
    {'id':'layer-order','severity':'生成前修正','templates':['3873','3881','3882','3895','3903'], 'finding':'写真前後に分かれた装飾がある。背景一枚＋全人物の方式では元の遮蔽を保証できない。', 'action':'元の描画順に背景／中景／前景を分離する。'},
    {'id':'tone-3901','severity':'生成前修正','templates':['3901'], 'finding':'vivid-gallery.photoはmono=False,tint=None,wash=0を一律指定する。3901の写真別の暖色濃淡が保持されない。最初の星は目ランドマーク追従。', 'action':'3901は専用の合成経路で濃淡を保持し、固定星2個だけを対象とする。'},
    {'id':'geometry-existing','severity':'要精査','templates':['3870','3879','3885','3889','3897','3900','3908'], 'finding':'既存生成背景の角丸・縁・影に参照との差がある。比較シートで差を確認したが境界の最大誤差は未計測。', 'action':'元写真や文字を動かさず、個別素材化または再生成で合わせる。'},
    {'id':'reference-3900','severity':'基準注意','templates':['3900'], 'finding':'旧plates/3900.jpgとchecks/3900-layout.jsonは古い3帯構図。了承済みvivid見本はfriendly_sketchによる別の写真窓。', 'action':'3900はwhole-glossの参照とfriendly_sketchを座標基準にする。'},
    {'id':'excluded-seed','severity':'使用禁止','templates':['3902'], 'finding':'対象外3902の保存済み参照には漢字が残る。対象外の抽出画像を一括生成に投入しない。', 'action':'6案の対象外を生成対象リストから除外する。'},
]

source_cache = {}
def source_info(ref):
    module, name = ref.split('.')
    path = ROOT/'tools/highlight-collage-demo'/f'{module}.py'
    if module not in source_cache:
        text = path.read_text()
        source_cache[module] = (text, ast.parse(text))
    text, tree = source_cache[module]
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    return {'path':str(path.relative_to(ROOT)), 'function':name, 'line':node.lineno,
            'endLine':node.end_lineno, 'source':ast.get_source_segment(text,node)}

rows=[]
for line in DECISIONS.splitlines():
    ident, method, renderer, reason = line.split('|',3)
    layout_path=BASE/'checks'/f'{ident}-layout.json'
    layout=json.loads(layout_path.read_text())
    row={'id':ident,'method':method,'reason':reason,'visualReview':'構図と保存済み参照を一覧で確認。微細境界の最終合格ではない。',
         'renderer':source_info(renderer),'layoutSHA256':hashlib.sha256(layout_path.read_bytes()).hexdigest(),
         'canvas':layout['canvas'],'slots':[{k:v for k,v in s.items() if k!='landmarksInCanvas'} for s in layout['slots']],
         'typography':layout['typography'],'characters':layout.get('characters',[]),
         'issues':[i['id'] for i in ISSUES if ident in i['templates']]}
    rows.append(row)
counts=dict(Counter(r['method'] for r in rows))
report={'date':'2026-09-30','scope':'生成前の分類・既存素材・v3動画の検証。新規アセット生成なし。',
        'counts':counts,'issues':ISSUES,'templates':rows,
        'limits':['全35動画は映像と音声を全デコード。境界の目視は3889/3908のみ。音声の聴感評価は未実施。',
                  '写真境界・アルファ・文字位置の生成前後の画素一致は未検証。',
                  '人物／文字混入チェックは目視とコード読解。OCRや自動セグメンテーションでの全画素証明ではない。']}
(OUT/'classification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))

def relative(path):
    import os
    return os.path.relpath(path,OUT)
def picture(path,label):
    if not path.exists():return '<figure><figcaption>'+html.escape(label+'：未作成')+'</figcaption></figure>'
    return '<figure><a href="'+relative(path)+'"><img loading="lazy" src="'+relative(path)+'"></a><figcaption>'+html.escape(label)+'</figcaption></figure>'
parts=['<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>固定配置Glossy 検証</title><style>body{font:16px system-ui;background:#f3f1ec;color:#202329;margin:32px}main{max-width:1300px;margin:auto}a{color:#2459a8}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}figure{margin:0}img{width:100%;max-height:440px;object-fit:contain;background:#ddd}article{background:white;padding:20px;margin:24px 0;border-radius:12px}figcaption{padding:8px}li{margin:12px 0}summary{cursor:pointer}@media(max-width:700px){.grid{grid-template-columns:repeat(2,1fr)}body{margin:12px}}</style><main><h1>固定配置Glossy：生成前の検証</h1><p>2026-09-30。全35案を分類。新規生成・採用判定は未実施。</p><p>'+html.escape(str(counts))+'</p><p><a href="../prototype/">現行v3</a> · <a href="classification.json">案別座標・描画ソース・分類JSON</a> · <a href="video-decode.json">全35本の再デコード結果</a> · <a href="REPORT.md">検証報告</a></p><h2>生成前に解決する点</h2><ul>']
for issue in ISSUES:parts.append('<li><b>'+html.escape('/'.join(issue['templates'])+'：'+issue['severity'])+'</b> '+html.escape(issue['finding']+' '+issue['action'])+'</li>')
parts.append('</ul><h2>動画の境界（実MP4から抽出）</h2>')
for ident in ['3889','3908']:parts.append(picture(OUT/f'{ident}-video-boundaries.jpg',ident+'：0/14/15/24/54/55/64/94/95/104/134/135フレーム'))
for row in rows:
    i=row['id'];v=BASE/'glossy-lab/vivid-gallery'/i
    bg=v/'generated-background.png';art=v/'art.jpg'
    if i=='3900':bg=BASE/'glossy-lab/whole-gloss/3900-vivid-generated-background.png';art=BASE/'glossy-lab/whole-gloss/3900-vivid-composite-art.jpg'
    parts.append('<article id="t'+i+'"><h2>'+i+' · '+row['method']+'</h2><p>'+html.escape(row['reason'])+'</p><div class="grid">')
    for path,label in [(BASE/'plates'/f'{i}.jpg','元構図（3900は旧版）'),(bg,'生成背景のみ'),(art,'既存候補の合成後'),(BASE/'glossy-lab/prototype'/f'{i}-v3-check-0.jpg','v3 First Frame')]:parts.append(picture(path,label))
    parts.append('</div><p><a href="../prototype/'+i+'-v3.mp4">v3動画</a></p><details><summary>生成参照（途中成果・採用不可のものを含む）</summary>')
    ref=v/'layout-reference.png' if i!='3900' else BASE/'glossy-lab/whole-gloss/3900-vivid-layout-reference.png'
    parts.append(picture(ref,'保存済みの参照'));parts.append('</details></article>')
parts.append('</main></html>');(OUT/'index.html').write_text(''.join(parts))
md=['# 固定配置Glossy：生成前検証（2026-09-30）','',report['scope'],'',
    '全35案の元構図・保存済み参照を目視し、各layout.jsonと実レンダラーを照合。分類は '+str(counts)+'。',
    '生成対象21案（既存7候補を含む）、生成不要8案、対象外6案。生成不要は今回のアセット追加を行わない判断。','',
    '## 主な検出事項','']
for issue in ISSUES:md.append('- **'+issue['id']+'**：'+issue['finding']+' '+issue['action'])
md+=['','## 案別判断','','| ID | 方式 | 理由・保持する構造 |','|---|---|---|']
for row in rows:md.append('| '+row['id']+' | '+row['method']+' | '+row['reason']+' |')
md+=['','## 動画・限界','']+['- '+x for x in report['limits']]
decode_path=OUT/'video-decode.json'
if decode_path.exists():
    results=json.loads(decode_path.read_text());ok=sum(r['decodeOK'] and r['frames']==971 and tuple(r['metadata']['size'])==(540,960) and r['metadata']['fps']==30 for r in results)
    md.append(f'- 今回の再検証：{ok}/{len(results)}本が映像・音声デコード成功、971フレーム、540×960、30fps。')
md+=['- 実MP4の3889/3908で0.5秒、1.833秒、3.167秒、4.5秒の切替を目視。中央1行・黒い2行目でも主色の枠・本編への切替を確認。',
      '- 元の3900は旧3帯構図。了承済みvivid候補との変更を今回の不具合として差し戻さない。','',
      '## 次の作業','',
      'まず3872（個別星）、3887（固定色面の背景）、3882（前後別の組合せ）の少数で参照・座標・レイヤーを確定する。3895/3903の参照混入と3901の濃淡保持を修正してから対象案へ進む。生成はimage_genで行い、写真・文字を原位置へ合成後、First Frameと最終動画を確認する。',
      'この検証ではv4・本番・承認済み動画・既存候補を上書きしていない。新規候補の生成／動画化／全案の最終目視は未実施。','']
(OUT/'REPORT.md').write_text('\n'.join(md))
print(json.dumps({'count':len(rows),'methods':counts,'output':str(OUT)},ensure_ascii=False))
