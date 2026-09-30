// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {renderDoneScreen} from '../../karate-trainer/src/ui/done-screen';

it('drill jumps follow the new movie clock after the opening is inserted', async()=>{
 const root=document.createElement('div');
 let complete!: (result:{playbackUrl:string;fileUri:string;sourceTimeOffset:number;openingStatus:string})=>void;
 const done=new Promise<{playbackUrl:string;fileUri:string;sourceTimeOffset:number;openingStatus:string}>(resolve=>complete=resolve);
 renderDoneScreen(root,{videoUrl:'blob:raw',ext:'mp4',stats:{time:'1:00',drills:3,cues:0},onShare:vi.fn(),onAgain:vi.fn(),
  kufuDrills:[{name:'演奏',at:10}],finishing:{done,onProgress:vi.fn()}});
 const video=root.querySelector('video')!;video.play=vi.fn().mockResolvedValue(undefined);
 const jump=root.querySelector<HTMLButtonElement>('[data-kufu-jump]')!;
 jump.click();expect(video.currentTime).toBe(10);
 complete({playbackUrl:'blob:finished',fileUri:'file:///finished.mp4',sourceTimeOffset:2.5,openingStatus:'ready-template-3889'});
 await done;await Promise.resolve();
 jump.click();expect(video.currentTime).toBe(12.5);expect(jump.textContent).toContain('0:12');
});

it('insufficient highlights keep the existing movie clock',async()=>{
 const root=document.createElement('div');
 const done=Promise.resolve({playbackUrl:'blob:body',fileUri:'file:///body.mp4',openingStatus:'needs-highlights-1'});
 renderDoneScreen(root,{videoUrl:'blob:raw',ext:'mp4',stats:{time:'0:30',drills:1,cues:0},onShare:vi.fn(),onAgain:vi.fn(),
  kufuDrills:[{name:'技',at:5}],finishing:{done,onProgress:vi.fn()}});
 const video=root.querySelector('video')!;video.play=vi.fn().mockResolvedValue(undefined);
 await done;await Promise.resolve();
 root.querySelector<HTMLButtonElement>('[data-kufu-jump]')!.click();expect(video.currentTime).toBe(5);
 expect(video.src).toContain('blob:body');
});
