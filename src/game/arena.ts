import * as THREE from "three";
import type { EnemyAction } from "../shared/types/turn";

const ACTION_FILES: Record<EnemyAction, string> = {
  idle: "01_surf", angry: "02_angry", cry: "03_cry", laugh: "04_laugh",
  shock: "05_shock", excitement: "06_excitement", dancing: "07_dancing",
  fighting: "08_fighting", flying: "09_flying", sleep: "10_sleep",
};

function emojiSprite(emoji: string, size = 256): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.font = `${size * 0.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
  return new THREE.Sprite(mat);
}

export class Arena {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private video: HTMLVideoElement;
  private enemy: THREE.Sprite | null = null;
  private hero: THREE.Sprite | null = null;
  private color = "yellow";
  private raf = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(0, 1.4, 5);
    this.scene.background = new THREE.Color("#3a2f6b");

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshBasicMaterial({ color: "#5a4a8a" }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const tutor = emojiSprite("🦉");
    tutor.position.set(-2.6, 1.2, 1.5);
    tutor.scale.set(1.1, 1.1, 1);
    this.scene.add(tutor);

    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    resize();

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.enemy) (this.enemy.material.map as THREE.VideoTexture | null)?.update?.();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  async loadEnemy(color: string): Promise<void> {
    this.color = color;
    const tex = new THREE.VideoTexture(this.video);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    this.enemy = new THREE.Sprite(mat);
    this.enemy.position.set(0.6, 1.5, 0);
    this.enemy.scale.set(3, 3, 1);
    this.scene.add(this.enemy);
    this.setEnemyAction("idle");
  }

  setEnemyAction(a: EnemyAction): void {
    this.video.src = `/avatars/enemies/bull_${ACTION_FILES[a]}_transparent_${this.color}.webm`;
    void this.video.play().catch(() => { /* autoplay needs user gesture; battle starts with one */ });
  }

  setHero(emoji: string, _name: string): void {
    if (this.hero) this.scene.remove(this.hero);
    this.hero = emojiSprite(emoji);
    this.hero.position.set(-0.9, 0.9, 3.2); // foreground, back-to-camera framing
    this.hero.scale.set(1.6, 1.6, 1);
    this.scene.add(this.hero);
  }

  heroAttack(): void {
    if (!this.hero) return;
    const start = this.hero.position.clone();
    const t0 = performance.now();
    const anim = (t: number) => {
      const k = Math.min(1, (t - t0) / 300);
      const lunge = Math.sin(k * Math.PI) * 0.8;
      this.hero!.position.set(start.x + lunge * 0.6, start.y, start.z - lunge);
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  enemyDefeat(): void {
    this.setEnemyAction("cry");
    if (!this.enemy) return;
    const t0 = performance.now();
    const anim = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200);
      this.enemy!.position.x = 0.6 + k * 8; // runs away
      if (k < 1) requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
