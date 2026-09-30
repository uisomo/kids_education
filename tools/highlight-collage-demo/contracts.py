# -*- coding: utf-8 -*-
"""Export review contracts, not a claim that native decorative rendering is complete."""
from pathlib import Path
import json
O=Path(__file__).resolve().parents[2]/'docs/highlight-collage-demo'
NOTES={
'3870':'ピンク／紫の紙、方眼、5人の白縁切り抜き、写真と文字の重なり。PinterestのUIは含めない。',
'3871':'小さな半顔・頭・手・上半身を離して配置。回転後の領域も非重複。全身素材の不足には正式キャラ。切断面は直線、輪郭は人物マスク。',
'3872':'赤と黄。白黒網点とカラーを混ぜ、ハートを使わず丸い写真を隙間が少なくなるように重ねる。',
'3873':'巨大な顔、細かな文字紙面、白黒の刷り重ね、縦横の擦れ。新聞の実際の文章は流用しない。',
'3877':'5人物が必要。後景文字→後景の2人→黄色文字→前景人物→緑文字→最前景人物。白い人物縁、緑黄の図形。',
'3878':'黒に統一した写真背景、主役の顔アップ、眼の帯、中央左下は引いた写真。灰色紙、粒子グラデーションの仕切り、90度文字。',
'3879':'退色した青黄。丸／柔らかなカーブ、青い人物縁、テープ、黄色縁の青い文字。顔を含む切り抜き。',
'3880':'大きな人物の背後に一部隠れる文字。縦文字・回転文字、細かな新聞風文字面、赤い矩形とグランジ。',
'3881':'大きな人物、背後の黒い矩形と紙片、橙青の色調・前景の透過レイヤー、身体を覆う色加工した正式キャラ。',
'3882':'大きな頭部、円、細い方眼、橙と暗色のチェッカー、下部の密な形。ビル群を白黒の正式キャラと切り抜きへ置換。',
'3883':'中央の巨大な顔と鮮やかな赤。上下に暖色の写真タイルを密集させる。',
'3884':'白い余白を大きく残し、水色の巨大なセリフ文字と白黒人物・写真を中央に積む。',
'3885':'目の縦長断片、半顔、口元。白い太い区切り。実在する極細長書体を使用し、文字は引き延ばさない。',
'3886':'黄色地、赤い巨大な文字、白黒の網点人物。文字と切り抜きの前後関係を維持。',
'3887':'赤い色面、白い隙間、顔アップ、左半顔、下側の手と上半身。太い文字が矩形をまたぐ。',
'3888':'大きな頭部と輪郭に沿う文字、白黒と青、頭上・胸の手描き線。横顔は本素材になく正面の代替で検討中。',
'3889':'非重複の中央長方形と周囲6枠。人物は基本枠内、頭／指定した腕だけ人物アルファで越境。文字は人物の後ろ。',
'3890':'紙色、中央人物、地図のような細線、新聞紙片、赤い記号。余白を残す。',
'3891':'新聞風背景へ顔の断片を重ねる。眼・口・半顔・髪の異なる帯、傾き、白黒とカラー。',
'3892':'人物全体のシルエットを外周マスクとし、その内部を異なる写真のタイルで埋める。元の顔の一部をランドマークに合わせて残し、不均等・斜めの区切り、半面色替えとグラデーションを併用。',
'3893':'主役の顔を保つ映画風分割ポートレート。周囲の別の切り抜きと青／金の小さな写真片。',
'3894':'外形は一人の人物。主役の顔を保ち、白い不規則な仕切りを通す。一部だけ別写真に差し替える。',
'3895':'必ず3×3全体で一枚。破れ紙／青い縦帯と反復文字／橙の楕円／波型書体／手描き顔／丸文字表紙／斜め白面／青緑の反復／紙文字を各セルで使い分ける。',
'3896':'白黒の写真を島状に置き、黄色の細身の巨大文字を背後に重ねる。一部は左右反転可。',
'3897':'必ず2×3全体で一枚。6つの頭部へ異なる手書き文字の密度・角度・大きさを重ねる。',
'3898':'背景を除いた人物のアップ。同一人物の額を基準に頭頂を切り分け、白い空隙を挟む。',
'3899':'右上と左下のアクセント面。眼・半顔・口・顔アップと正式キャラを中央へ塔状に重ねる。',
'3900':'目を中心にした顔の大きな断片。手書きテキストが主役。目ランドマークの周囲へ線・星・書き込み。青／赤／紙色。',
'3901':'全写真を同じ暖色へ濃淡を変えて加工。背景の大きな網点顔、前景人物の静的色面、目に半透明の星。元配色の橙も変更可能。',
}
NOTES.update({
'3902':'同じ人物写真が中央の境界をまたぎ、左は漢字の字形内、右は半顔として連続する。',
'3903':'3列×5段の15面で1枚。頭部切り抜き、色面、刷り重ね、縞、星を各マスで変える。録画に横顔がないためデモは正面素材。',
'3904':'上部の余白、奥から手前に大きくなる群像、前景右寄りの一人だけを着色。素材は各枠で異なる時刻。',
'3905':'大きな頭部の前後に円、極細の線、輪郭、細かな日本語注記を重ねる。',
'3907':'三つの色付き全身ポーズの前に白黒の主役。マスクなしでは録画の人物切り抜き、マスクありの場合だけ正式キャラを使用。素材にない足先は補わず写っている範囲を使う。',
'3908':'大きな円を背後に、白黒の全身と柔らかい接地影。マスクなしは録画人物、マスクありだけ正式キャラ。下部の小さな数字は録画日付。',
})
m=json.loads((O/'manifest.json').read_text());m['hook']='一番の技、どれですか？ 教えてください';m['hookProvenance']='explicit user-provided Hook text; not automatic speech transcription';m['opening']={'previewCount':1,'previewOrientation':'portrait','previewStart':0,'durations':[3,3,4],'hookEndForReview':4,'voiceStart':0,'textPresentation':'one centered line at a time','font':'M PLUS Rounded 1c ExtraBold','colors':'selected collage palette','expandFromCurrentPosition':True,'bodyStartForReview':10,'bodySourceStartForReview':4,'leadingSilenceTrim':0.2645};(O/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2))
contracts=[];rows=[]
for e in sorted(m['renders'],key=lambda x:x['id']):
 ident=e['id'];layout=json.loads((O/'checks'/f'{ident}-layout.json').read_text())
 slots=[]
 for j,s in enumerate(layout['slots']):
  slot={k:v for k,v in s.items() if k not in {'sourceFrame','sourceTimeApprox','sourceCrop','landmarksInCanvas'}}
  slot['id']=f'photo-{j+1}';slot['candidateRule']='distinct frame with required anatomical region';slot['demoSource']={k:s[k] for k in ['sourceFrame','sourceCrop'] if k in s};slots.append(slot)
 contracts.append({'id':ident,'reference':e['reference'],'observations':NOTES[ident],'canvas':[720,1280],'slots':slots,'typography':layout['typography'],'palette':layout['palette'],'textPolicy':layout['textPolicy'],'characters':layout['characters'],'panels':9 if ident=='3895' else 6 if ident=='3897' else None,'defaultCutout':True,'colorRolesEditable':True,'renderingStatus':'review contract; decorative primitives not yet fully ported to native renderer','iphonePipeline':['privacy-resolved pixels','candidate-only Vision landmarks and person mask','cached Core Image texture','Core Graphics/Core Text ordered layers','single video composition with one live preview'],'layoutAudit':f'checks/{ident}-layout.json'})
 rows.append(f"| {ident} | {NOTES[ident]} | {len(slots)} |")
(O/'design-contracts.json').write_text(json.dumps({'version':6,'templates':contracts,'opening':m['opening'],'nativeIntegrationComplete':False},ensure_ascii=False,indent=2))
(O/'TEMPLATES.md').write_text('# 35参照・35テンプレートの観察点\n\n元画像の人物・文章は使用せず、録画内の写真と確認できる内容で置き換える。数だけでなく、枠・部位・前後関係・余白・質感・文字方向を比較する。全案で色相差・明暗を保ちランダム配色。以下の色名は参照画像の役割の説明であり、出力色の固定指定ではない。装飾英字は漢字主体の日本語へ、数字は録画日付へ置換。\n\n| 参照 | 特に合わせる構成 | デモの写真枠数 |\n|---|---|---:|\n'+'\n'.join(rows)+'\n\n3877は5人物、3895は9マス、3897は6マス。3898の2断片は同一人物の一枚から切り出す。3894は差し替え枠に加えて主役19番の人物マスクを使う。3871の全身などには正式キャラクターを別レイヤーで使用。\n\n各枠の座標・クロップ・書体・回転はchecks内のlayout.jsonに記録。design-contracts.jsonはレビュー契約であり、全35案をそのまま描画するネイティブ実装ではない。短い録画には横顔・足先までの全身がなく、素材差と切り抜き境界の課題は残る。\n')
print('exported',len(contracts),'contracts')
