# Audio assets

Source: `C:\Projects\video_gen_full` asset box (`bgmusic/` = tempo-numbered tracks, `sfx/`).
To swap a sound, overwrite the slot file — no code changes needed (slots are loaded by name).

## BGM slots (`bgm/`)
| Slot | Source file | Why |
|---|---|---|
| teach.mp3 | bgmusic/120.mp3 | calm, low tempo for the teach phase |
| battle.mp3 | bgmusic/170.mp3 | upbeat battle tempo |
| victory.mp3 | bgmusic/145.mp3 | mid-tempo victory/debrief |

## SFX slots (`sfx/`)
| Slot | Source file | Used when |
|---|---|---|
| hit.mp3 | 和太鼓でドドン.mp3 | damage lands |
| miss.mp3 | 小鼓（こつづみ）.mp3 | weak/no damage |
| fanfare.mp3 | ラッパのファンファーレ.mp3 | item unlock toast |
| unlock.mp3 | 鈴を鳴らす.mp3 | surprise treasure drop |
| click.mp3 | 決定ボタンを押す3.mp3 | UI buttons |
| ding.mp3 | ピアノの単音.mp3 | tutor praise moment |
