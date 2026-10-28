import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  inject,
  viewChild,
} from '@angular/core';
import * as THREE from 'three';
import { ThemeService } from '../../services/theme.service';

/**
 * The Underground Journey — a fixed full-screen Three.js scene behind the page.
 *
 * Story: Surface (Hero) → Descent Shaft → Scanner Core (About) → Timeline
 * Cavern (Experience) → Crystal Cave (Skills) → Artifact Vault (Projects)
 * → Exit Portal (Contact). Scrolling drives the camera down the shaft;
 * each profile section lives in its own chamber.
 */
@Component({
  selector: 'app-journey-canvas',
  standalone: true,
  template: `<canvas #gl class="journey-gl" aria-hidden="true"></canvas>`,
  styles: `
    .journey-gl {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }
  `,
})
export class JourneyCanvasComponent implements AfterViewInit, OnDestroy {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('gl');
  private readonly zone = inject(NgZone);
  private readonly themeService = inject(ThemeService);

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private raf = 0;
  private disposed = false;

  private targetProgress = 0;
  private progress = 0;
  private mouseX = 0;
  private mouseY = 0;
  private targetMouseX = 0;
  private targetMouseY = 0;

  private readonly zones: { group: THREE.Group; y: number; spin: number; baseX: number; baseZ: number }[] = [];
  private dust?: THREE.Points;
  private embers?: THREE.Points;
  private headlamp?: THREE.PointLight;
  private exitGlow?: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private surfacePortal?: THREE.Mesh;
  private surfaceRing?: THREE.Mesh;
  private clock = new THREE.Clock();

  /** Responsive framing (desktop values are untouched). */
  private camZ = 14.5;
  private xFactor = 1;

  /** Theme worlds: only one is visible at a time. */
  private undergroundWorld?: THREE.Group;
  private oceanWorld?: THREE.Group;
  private forestWorld?: THREE.Group;
  private readonly swimmers: ((t: number) => void)[] = [];
  private readonly wildlife: ((t: number) => void)[] = [];
  private lastTheme = '';
  private lastPhase = '';
  private ambientLight?: THREE.AmbientLight;
  private sunLight?: THREE.DirectionalLight;
  private lampMul = 1;
  /** User-interaction state for forest wildlife. */
  private pulseT = -10;
  private camYCurrent = 10;

  /** Total vertical travel of the camera through the shaft. */
  private static readonly TRAVEL = 168;
  private static readonly SURFACE_Y = 10;

  ngAfterViewInit(): void {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => this.init());
  }

  ngOnDestroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer?.dispose();
    this.scene?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  // ── Setup ──────────────────────────────────────────────────────────────
  private init(): void {
    const canvas = this.canvasRef().nativeElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x05050d, 0.0145);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(0, JourneyCanvasComponent.SURFACE_Y, 15);
    this.scene.add(this.camera);

    // Lights (re-tuned per theme × day-phase in applyEnvironment)
    this.ambientLight = new THREE.AmbientLight(0x8899ff, 0.55);
    this.scene.add(this.ambientLight);
    this.sunLight = new THREE.DirectionalLight(0xa5b4fc, 1.1);
    this.sunLight.position.set(6, 20, 8);
    this.scene.add(this.sunLight);
    this.headlamp = new THREE.PointLight(0x818cf8, 60, 46, 1.6);
    this.camera.add(this.headlamp);

    this.undergroundWorld = new THREE.Group();
    this.oceanWorld = new THREE.Group();
    this.forestWorld = new THREE.Group();
    this.scene.add(this.undergroundWorld, this.oceanWorld, this.forestWorld);

    this.buildSurface();
    this.buildShaft();
    this.buildScannerCore(-38);
    this.buildTimelineCavern(-68);
    this.buildCrystalCave(-98);
    this.buildArtifactVault(-128);
    this.buildExitPortal(-158);
    this.buildParticles(reduced);
    this.buildOcean();
    this.buildForest();
    this.applyViewLayout();

    this.onScroll();
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });

    this.clock.start();
    this.animate();
  }

  private mat(color: number, emissive: number, intensity = 0.7, wireframe = false): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: intensity, wireframe,
      roughness: 0.35, metalness: 0.55, transparent: true, opacity: wireframe ? 0.75 : 0.96,
    });
  }

  private addZone(group: THREE.Group, y: number, spin = 0.25, world?: THREE.Group): void {
    group.position.y = y;
    // Chambers live deep in the background, off to alternating sides
    // so the 3D story frames the content instead of covering it.
    let baseX = 0;
    let baseZ = 0;
    if (y <= -38) {
      baseZ = -13;
      baseX = y === -68 || y === -128 ? 11 : y === -158 ? 0 : -11;
    }
    group.position.x = baseX;
    group.position.z = baseZ;
    (world ?? this.undergroundWorld ?? this.scene)?.add(group);
    this.zones.push({ group, y, spin, baseX, baseZ });
  }

  /**
   * Responsive framing: desktop (>=1100px wide) keeps the original staging.
   * Tablet pulls the camera back and tucks chambers toward the edges;
   * mobile goes further — wider FOV, farther camera, chambers mostly
   * peeking in from the sides so text stays clear.
   */
  private applyViewLayout(): void {
    if (!this.camera) return;
    const w = window.innerWidth;
    const aspect = w / window.innerHeight;
    const mode = w >= 1100 ? 'desktop' : w >= 640 ? 'tablet' : 'mobile';
    this.xFactor = mode === 'desktop' ? 1 : mode === 'tablet' ? 0.55 : 0.36;
    const zPull = mode === 'desktop' ? 0 : mode === 'tablet' ? -2.5 : -4.5;
    this.camZ = mode === 'desktop' ? 14.5 : aspect < 1 ? 14.5 + (1 - aspect) * 11 : 17;
    this.camera.fov = mode === 'desktop' ? 58 : aspect < 1 ? 70 : 64;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    for (const z of this.zones) {
      z.group.position.x = z.baseX * this.xFactor;
      if (z.baseZ !== 0) z.group.position.z = z.baseZ + zPull;
      const s = mode === 'desktop' || z.y === 0 ? 1 : mode === 'tablet' ? 0.85 : 0.7;
      z.group.userData['layoutScale'] = s;
    }
    if (this.surfacePortal && this.surfaceRing) {
      const px = mode === 'desktop' ? 6.5 : mode === 'tablet' ? 8.5 : 5.5;
      const py = mode === 'desktop' ? 4.2 : 8.4;
      const ps = mode === 'desktop' ? 1 : 0.62;
      this.surfacePortal.position.set(px, py, -9);
      this.surfaceRing.position.set(px, py, -9);
      this.surfacePortal.scale.setScalar(ps);
      this.surfaceRing.scale.setScalar(ps);
    }
  }

  // ── Underground realism helpers ───────────────────────────────────────
  private rockTexture(): THREE.CanvasTexture {
    const tex = this.skinTexture((ctx, w, h) => {
      const bands = ['#6f5b45', '#7d6750', '#5d4c3a', '#86755e', '#66543f', '#75614c'];
      let y = 0;
      let bi = 0;
      while (y < h) {
        const bh = 18 + ((bi * 37) % 30);
        ctx.fillStyle = bands[bi % bands.length];
        ctx.fillRect(0, y, w, bh);
        y += bh; bi++;
      }
      for (let i = 0; i < 5200; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,240,214,0.10)';
        ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
      }
      ctx.strokeStyle = 'rgba(20,14,8,0.35)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        let x = Math.random() * w, yy = Math.random() * h;
        ctx.moveTo(x, yy);
        for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 46; yy += Math.random() * 26; ctx.lineTo(x, yy); }
        ctx.stroke();
      }
    });
    tex.repeat.set(6, 22);
    return tex;
  }

  private rockMat(color = 0x77644e): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0.02, flatShading: true });
  }

  /** Cave dressing for a chamber: rock floor, boulders, hanging stalactites. */
  private addCavern(g: THREE.Group, seed = 1): void {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(13, 36), this.rockMat(0x4a3d2f));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -6.4, -4);
    g.add(floor);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 9; i++) {
      const rock = new THREE.Mesh(rockGeo, this.rockMat(i % 2 ? 0x5d4c3a : 0x6d5942));
      const a = ((i + seed) / 9) * Math.PI * 2;
      rock.position.set(Math.cos(a) * (6.5 + (i % 3) * 1.8), -6 + (i % 2) * 0.3, -4 + Math.sin(a) * 5);
      rock.scale.set(0.7 + (i % 4) * 0.45, 0.55 + (i % 3) * 0.3, 0.7 + ((i + 2) % 4) * 0.4);
      rock.rotation.set(i * 1.3, i * 2.1, seed);
      g.add(rock);
    }
    const spikeGeo = new THREE.ConeGeometry(0.42, 2.6, 6);
    for (let i = 0; i < 8; i++) {
      const spike = new THREE.Mesh(spikeGeo, this.rockMat(0x63523d));
      const a = ((i * 1.7 + seed) % 8) / 8 * Math.PI * 2;
      spike.position.set(Math.cos(a) * (4 + (i % 4) * 1.6), 6.8 - (i % 3) * 0.5, -4 + Math.sin(a) * 4.5);
      spike.rotation.x = Math.PI; // point down
      spike.scale.setScalar(0.7 + (i % 3) * 0.45);
      g.add(spike);
    }
  }

  // ── Chapters ───────────────────────────────────────────────────────────
  /** Chapter 0 — the Surface: portal gate + floating shards above ground. */
  private buildSurface(): void {
    const g = new THREE.Group();
    const portal = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.1, 16, 90), this.mat(0x6366f1, 0x6366f1, 1.1));
    portal.position.set(6.5, 4.2, -9);
    g.add(portal);
    this.surfacePortal = portal;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(3.8, 0.045, 12, 80), this.mat(0x22d3ee, 0x22d3ee, 1.2));
    inner.position.copy(portal.position);
    g.add(inner);
    this.surfaceRing = inner;

    const shardGeo = new THREE.OctahedronGeometry(0.38);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(shardGeo, this.mat(i % 2 ? 0x22d3ee : 0x818cf8, i % 2 ? 0x0e7490 : 0x4f46e5, 0.65, i % 3 === 0));
      const a = (i / 12) * Math.PI * 2;
      s.position.set(4 + Math.cos(a) * (3.5 + (i % 3)), 1 + (i % 4) * 1.1, -9 + Math.sin(a) * 3);
      s.rotation.set(i, i * 1.3, 0);
      g.add(s);
    }
    // Earth the hero stands on: soil disc + dark shaft mouth
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(17, 48),
      new THREE.MeshStandardMaterial({ map: this.rockTexture(), color: 0x8a6f52, roughness: 1, transparent: true, opacity: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.4;
    g.add(ground);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(7.2, 40),
      new THREE.MeshBasicMaterial({ color: 0x070503, transparent: true, opacity: 0.88 }));
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.set(0, -1.34, -3);
    g.add(mouth);
    // Rock rim around the entrance
    const rimGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 14; i++) {
      const rock = new THREE.Mesh(rimGeo, this.rockMat(i % 2 ? 0x77644e : 0x5f5040));
      const a = (i / 14) * Math.PI * 2;
      rock.position.set(Math.cos(a) * 8.6, -1.1 + (i % 2) * 0.2, -3 + Math.sin(a) * 7.6);
      rock.scale.set(0.9 + (i % 4) * 0.4, 0.6 + (i % 3) * 0.3, 0.9 + ((i + 1) % 3) * 0.35);
      rock.rotation.set(i * 0.8, i * 1.9, i * 0.4);
      g.add(rock);
    }
    // Roots dangling into the shaft mouth
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x4f3a22, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const sx = Math.cos(a) * 6.8, sz = -3 + Math.sin(a) * 6;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, -1.2, sz),
        new THREE.Vector3(sx * 0.92, -2.8 - (i % 3), sz * 0.92),
        new THREE.Vector3(sx * 0.8 + (i % 2 ? 0.5 : -0.5), -4.6 - (i % 4), sz * 0.8),
      ]);
      const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.075 - (i % 3) * 0.016, 5), rootMat);
      g.add(root);
    }
    this.addZone(g, 0, 0.12);
  }

  /** The Descent Shaft: a real rock tunnel you fall through. */
  private buildShaft(): void {
    const g = new THREE.Group();

    // Rock tunnel wall (inside-out cylinder) with vertex-displaced rock
    const wallGeo = new THREE.CylinderGeometry(13, 13, 182, 56, 72, true);
    const wpos = wallGeo.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < wpos.count; i++) {
      const x = wpos.getX(i), y = wpos.getY(i), z = wpos.getZ(i);
      const ang = Math.atan2(z, x);
      const bump = Math.sin(ang * 7 + y * 0.32) * 0.55 + Math.sin(ang * 13 - y * 0.75) * 0.38 + Math.sin(ang * 29 + y * 1.6) * 0.22;
      const r = 13 + bump;
      wpos.setXYZ(i, Math.cos(ang) * r, y, Math.sin(ang) * r);
    }
    wallGeo.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
      map: this.rockTexture(), color: 0xa89880, roughness: 1, metalness: 0, side: THREE.BackSide,
    }));
    wall.position.y = -90; // rim sits just below ground level (top edge ≈ y +1)
    g.add(wall);

    // Sediment strata rings hugging the wall
    const strata = [0x8a6f4d, 0x5f7a72, 0x7a5a68, 0x96835f, 0x64707c, 0x87714f];
    for (let i = 0; i < 16; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(12.55, 0.22 + (i % 3) * 0.1, 7, 56),
        this.rockMat(strata[i % strata.length]));
      band.rotation.x = Math.PI / 2;
      band.position.y = -8 - i * 10.5;
      g.add(band);
    }

    // Rock spikes jutting inward from the walls
    const spikeGeo = new THREE.ConeGeometry(0.5, 2.4, 6);
    const spikeMat = this.rockMat(0x6b5942);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 64; i++) {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      const a = (i * 2.399) % (Math.PI * 2); // golden-angle spread
      const y = -6 - ((i * 37) % 158);
      spike.position.set(Math.cos(a) * 11.9, y, Math.sin(a) * 11.9);
      const dir = new THREE.Vector3(-Math.cos(a), -0.25, -Math.sin(a)).normalize();
      spike.quaternion.setFromUnitVectors(up, dir);
      spike.scale.setScalar(0.7 + ((i * 7) % 10) / 8);
      g.add(spike);
    }

    // Wooden mine-timber frames + hanging lanterns
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, roughness: 0.95, metalness: 0 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x54391f, roughness: 1, metalness: 0 });
    const lanternGlass = new THREE.MeshBasicMaterial({ color: 0xffc266 });
    for (let k = 0; k < 10; k++) {
      const y = -12 - k * 16.5;
      const frame = new THREE.Group();
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.62, 8.6, 0.62), woodMat);
        post.position.set(s * 7.1, 0, 0);
        post.rotation.z = s * -0.05;
        frame.add(post);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.6, 0.34), woodDark);
        brace.position.set(s * 5.6, 2.6, 0);
        brace.rotation.z = s * 0.8;
        frame.add(brace);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.68, 0.68), woodMat);
      beam.position.y = 4.1;
      frame.add(beam);
      // Hanging lantern (lit every frame, light every 3rd)
      const lx = k % 2 === 0 ? -4.6 : 4.6;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), woodDark);
      chain.position.set(lx, 3.55, 0);
      frame.add(chain);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lanternGlass);
      lamp.position.set(lx, 2.95, 0);
      frame.add(lamp);
      const cage = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 14), woodDark);
      cage.position.copy(lamp.position);
      frame.add(cage);
      if (k % 3 === 0) {
        const light = new THREE.PointLight(0xffa640, 42, 27, 1.7);
        light.position.copy(lamp.position);
        frame.add(light);
      }
      frame.position.set(0, y, -6.5);
      g.add(frame);
    }

    // Rubble boulders scattered deeper down
    const rubbleGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 22; i++) {
      const rock = new THREE.Mesh(rubbleGeo, this.rockMat(i % 2 ? 0x5d4c3a : 0x6d5942));
      const a = (i * 2.7) % (Math.PI * 2);
      rock.position.set(Math.cos(a) * (8.5 + (i % 4)), -14 - ((i * 53) % 148), Math.sin(a) * 8.5 - 3);
      rock.scale.setScalar(0.6 + ((i * 11) % 10) / 7);
      rock.rotation.set(i, i * 1.7, i * 0.6);
      g.add(rock);
    }
    this.addZone(g, 0, 0);
  }

  /** Chapter 2 — Scanner Core (About): rotating wireframe core + orbit rings. */
  private buildScannerCore(y: number): void {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), this.mat(0x818cf8, 0x4f46e5, 0.85, true));
    g.add(core);
    const inner = new THREE.Mesh(new THREE.OctahedronGeometry(1.7), this.mat(0x22d3ee, 0x22d3ee, 1.3));
    g.add(inner);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6 + i * 0.75, 0.05, 8, 72), this.mat(0x22d3ee, 0x0e7490, 0.9));
      ring.rotation.set(Math.PI / 3 + i * 0.5, i * 0.7, 0);
      g.add(ring);
    }
    const light = new THREE.PointLight(0x6366f1, 90, 42, 1.7);
    g.add(light);
    this.addCavern(g, 1);
    this.addZone(g, y, 0.35);
  }

  /** Chapter 3 — Timeline Cavern (Experience): a chain of glowing memory nodes. */
  private buildTimelineCavern(y: number): void {
    const g = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      const x = Math.sin(i * 1.25) * 6.5;
      const yy = 9 - i * 3.1;
      const zz = -3 + Math.cos(i * 1.1) * 2.5;
      pts.push(new THREE.Vector3(x, yy, zz));
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(i === 0 ? 0.85 : 0.55, 20, 20),
        this.mat(0xfbbf24, 0xd97706, 1.15),
      );
      node.position.set(x, yy, zz);
      g.add(node);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.035, 8, 40), this.mat(0xf59e0b, 0xf59e0b, 0.8));
      halo.position.copy(node.position);
      halo.rotation.x = Math.PI / 2.4;
      g.add(halo);
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 }),
    );
    g.add(line);
    g.add(new THREE.PointLight(0xf59e0b, 70, 40, 1.7));
    this.addCavern(g, 3);
    this.addZone(g, y, 0.06);
  }

  /** Chapter 4 — Crystal Cave (Skills): faceted crystals growing from rock. */
  private buildCrystalCave(y: number): void {
    const g = new THREE.Group();
    const colors = [0x22d3ee, 0x818cf8, 0xa78bfa, 0x67e8f9];
    // Elongated octahedron = natural crystal point with pyramidal tip
    const geo = new THREE.OctahedronGeometry(0.62, 0);
    geo.scale(1, 2.6, 1);
    const baseGeo = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 26; i++) {
      const col = colors[i % colors.length];
      const c = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: col, emissive: col, emissiveIntensity: 0.5,
        roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12,
        transparent: true, opacity: 0.88, flatShading: true,
      }));
      const a = (i / 26) * Math.PI * 2;
      const r = 3.6 + (i % 5) * 1.25;
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r - 2;
      c.position.set(cx, -4.4 + (i % 4) * 0.35, cz);
      c.rotation.set(((i % 5) - 2) * 0.16, i, ((i % 3) - 1) * 0.2);
      c.scale.setScalar(0.6 + ((i * 7) % 10) / 9);
      g.add(c);
      if (i % 2 === 0) {
        const base = new THREE.Mesh(baseGeo, this.rockMat(0x55452f));
        base.position.set(cx, -5.6, cz);
        base.scale.set(1.1, 0.6, 1.1);
        base.rotation.y = i;
        g.add(base);
      }
    }
    g.add(new THREE.PointLight(0x22d3ee, 95, 46, 1.6));
    this.addCavern(g, 5);
    this.addZone(g, y, 0.05);
  }

  /** Chapter 5 — Artifact Vault (Projects): floating relics in a vault ring. */
  private buildArtifactVault(y: number): void {
    const g = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.TetrahedronGeometry(1.25),
      new THREE.OctahedronGeometry(1.15),
      new THREE.TorusKnotGeometry(0.75, 0.26, 72, 10),
    ];
    for (let i = 0; i < 12; i++) {
      const artifact = new THREE.Mesh(
        geos[i % geos.length],
        this.mat(i % 2 ? 0xc084fc : 0xfbbf24, i % 2 ? 0x7e22ce : 0xb45309, 0.85, i % 3 === 0),
      );
      const a = (i / 12) * Math.PI * 2;
      artifact.position.set(Math.cos(a) * 6.8, Math.sin(i * 2.1) * 2.6, Math.sin(a) * 6.8 - 2);
      artifact.rotation.set(i * 0.6, i * 0.9, 0);
      g.add(artifact);
    }
    const vaultRing = new THREE.Mesh(new THREE.TorusGeometry(9.4, 0.09, 10, 90), this.mat(0xa855f7, 0xa855f7, 1.0));
    vaultRing.rotation.x = Math.PI / 2;
    g.add(vaultRing);
    g.add(new THREE.PointLight(0xa855f7, 90, 46, 1.6));
    this.addCavern(g, 7);
    // Stone pillars holding the vault up
    const pillarMat = this.rockMat(0x6a5942);
    for (const px of [-8.5, 8.5]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 13, 8), pillarMat);
      pillar.position.set(px, 0, -5);
      g.add(pillar);
      const capital = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.4), pillarMat);
      capital.position.set(px, 6.4, -5);
      g.add(capital);
    }
    this.addZone(g, y, 0.14);
  }

  /** Final Chapter — Exit Portal (Contact): golden gate + beam back to surface. */
  private buildExitPortal(y: number): void {
    const g = new THREE.Group();
    const gate = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.22, 16, 90), this.mat(0xfbbf24, 0xf59e0b, 1.7));
    gate.position.z = -6;
    g.add(gate);
    this.exitGlow = new THREE.Mesh(
      new THREE.CircleGeometry(6.1, 48),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    this.exitGlow.position.z = -6;
    g.add(this.exitGlow);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 3.4, 26, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(0, 12, -6);
    g.add(beam);
    g.add(new THREE.PointLight(0xfbbf24, 110, 50, 1.5));
    this.addZone(g, y, 0);
  }

  private buildParticles(reduced: boolean): void {
    const make = (count: number, color: number, size: number, spreadY: [number, number]): THREE.Points => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 30;
        pos[i * 3 + 1] = spreadY[0] + Math.random() * (spreadY[1] - spreadY[0]);
        pos[i * 3 + 2] = (Math.random() - 0.5) * 26 - 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(geo, new THREE.PointsMaterial({
        color, size, transparent: true, opacity: 0.75, sizeAttenuation: true, depthWrite: false,
      }));
    };
    this.dust = make(reduced ? 250 : 850, 0x93c5fd, 0.13, [14, -168]);
    this.undergroundWorld?.add(this.dust);
    this.embers = make(reduced ? 80 : 260, 0xfbbf24, 0.17, [-168, -138]);
    this.undergroundWorld?.add(this.embers);
  }

  // ══ FOREST THEME ══════════════════════════════════════════════════════
  private buildForest(): void {
    if (!this.forestWorld) return;
    this.buildForestEnvironment();
    this.buildCanopyGate(0);
    this.buildMeadow(-38);
    this.buildElephantGrove(-68);
    this.buildPredatorTerritory(-98);
    this.buildNocturnalRuins(-128);
    this.buildSunriseClearing(-158);
  }

  private furMat(top: string, belly: string, pattern: 'stripes' | 'spots' | 'bands' | 'plain', accent = '#1c1917'): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      map: this.fishTexture(top, belly, pattern, accent),
      roughness: 0.92, metalness: 0,
    });
  }

  /** A leg on a hip pivot so it can swing while walking. */
  private leg(parent: THREE.Group, x: number, y: number, z: number, len: number, r: number, mat: THREE.Material): THREE.Group {
    const hip = new THREE.Group();
    hip.position.set(x, y, z);
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, len, 7), mat);
    limb.position.y = -len / 2;
    hip.add(limb);
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, 0.09, r * 2), new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 1 }));
    hoof.position.y = -len;
    hip.add(hoof);
    parent.add(hip);
    return hip;
  }

  private makeDeer(stag: boolean, seed = 0): THREE.Group {
    const deer = new THREE.Group();
    const fur = this.furMat('#96683f', '#e3cda8', 'spots', 'rgba(255,250,235,0.85)');
    const body = new THREE.Mesh(this.fishBodyGeo(1.8, 0.78, 0.52), fur);
    body.position.y = 1.05;
    deer.add(body);
    const neck = new THREE.Group();
    neck.position.set(0.85, 1.28, 0);
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.85, 8), fur);
    neckMesh.position.y = 0.36;
    neckMesh.rotation.z = -0.5;
    neck.add(neckMesh);
    const head = new THREE.Group();
    head.position.set(0.38, 0.78, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), fur);
    skull.scale.set(1.25, 0.95, 0.8);
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 8), fur);
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(0.3, -0.04, 0);
    head.add(snout);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.4 }));
    nose.position.set(0.46, -0.04, 0);
    head.add(nose);
    this.eyePair(head, 0.16, 0.06, 0.15, 0.032);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), fur);
      ear.position.set(-0.08, 0.2, s * 0.16);
      ear.rotation.set(s * 0.7, 0, 0.3);
      head.add(ear);
    }
    if (stag) {
      const antlerMat = new THREE.MeshStandardMaterial({ color: 0xd6c7a8, roughness: 0.85 });
      for (const s of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.85, 6), antlerMat);
        beam.position.set(-0.12, 0.5, s * 0.12);
        beam.rotation.set(s * 0.35, 0, 0.42);
        head.add(beam);
        for (let ti = 0; ti < 3; ti++) {
          const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.34, 5), antlerMat);
          tine.position.set(-0.2 - ti * 0.05, 0.55 + ti * 0.12, s * (0.22 + ti * 0.07));
          tine.rotation.set(s * 0.5, 0, 0.9 - ti * 0.25);
          head.add(tine);
        }
      }
    }
    neck.add(head);
    deer.add(neck);
    const legs: THREE.Group[] = [
      this.leg(deer, 0.62, 1, 0.2, 0.98, 0.06, fur), this.leg(deer, 0.62, 1, -0.2, 0.98, 0.06, fur),
      this.leg(deer, -0.62, 1, 0.2, 0.98, 0.06, fur), this.leg(deer, -0.62, 1, -0.2, 0.98, 0.06, fur),
    ];
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), fur);
    tail.position.set(-0.95, 1.22, 0);
    tail.rotation.z = 0.7;
    deer.add(tail);
    deer.userData['neck'] = neck;
    deer.userData['head'] = head;
    deer.userData['legs'] = legs;
    deer.userData['seed'] = seed;
    return deer;
  }

  private graze(animal: THREE.Group, zoneY: number): void {
    const neck = animal.userData['neck'] as THREE.Group;
    const head = animal.userData['head'] as THREE.Group;
    const seed = animal.userData['seed'] as number;
    this.wildlife.push((t) => {
      const near = this.nearFactor(zoneY);
      const boost = this.pulseBoost(t);
      // Graze cycle: head down eating, periodically lifts — snaps up when you approach or click
      const cycle = Math.sin(t * 0.45 + seed * 2.4);
      const alert = Math.max(near * 0.9, boost);
      const grazeAmt = THREE.MathUtils.clamp(cycle * 0.5 + 0.5 - alert * 1.4, 0, 1);
      neck.rotation.z = -grazeAmt * 0.95;
      head.rotation.z = grazeAmt * 0.55;
      // Eyes on you: head tracks the cursor when alert
      head.rotation.y = this.mouseX * 0.75 * alert;
      animal.position.y = boost * Math.abs(Math.sin(t * 9)) * 0.28; // startled hop on click
      animal.rotation.y = Math.sin(t * 0.22 + seed) * 0.35 + this.mouseX * 0.2 * alert;
    });
  }

  private makeRabbit(seed = 0): THREE.Group {
    const rabbit = new THREE.Group();
    const fur = this.furMat('#a8a29e', '#f5f5f4', 'plain');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), fur);
    body.scale.set(1.25, 0.95, 0.9);
    body.position.y = 0.3;
    rabbit.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), fur);
    head.position.set(0.34, 0.46, 0);
    rabbit.add(head);
    this.eyePair(rabbit, 0.42, 0.5, 0.12, 0.026);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.44, 6), fur);
      ear.position.set(0.28, 0.78, s * 0.08);
      ear.rotation.z = -0.15;
      ear.name = s < 0 ? 'earL' : 'earR';
      rabbit.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), this.furMat('#f5f5f4', '#ffffff', 'plain'));
    tail.position.set(-0.36, 0.36, 0);
    rabbit.add(tail);
    rabbit.userData['seed'] = seed;
    return rabbit;
  }

  private hopAbout(animal: THREE.Group, home: THREE.Vector3, zoneY: number): void {
    const seed = animal.userData['seed'] as number;
    this.wildlife.push((t) => {
      const boost = this.pulseBoost(t);
      const hopRate = 2.2 + boost * 5;
      const hop = Math.abs(Math.sin(t * hopRate + seed * 3));
      animal.position.set(
        home.x + Math.sin(t * 0.35 + seed * 2) * (1.2 + boost * 1.6),
        home.y + hop * (0.32 + boost * 0.3),
        home.z + Math.cos(t * 0.28 + seed) * 0.8,
      );
      animal.rotation.y = Math.cos(t * 0.35 + seed * 2) > 0 ? 0.5 : -2.6;
      animal.rotation.z = -hop * 0.18;
      const earL = animal.getObjectByName('earL');
      const earR = animal.getObjectByName('earR');
      if (earL) earL.rotation.x = Math.sin(t * 6 + seed) * 0.18;
      if (earR) earR.rotation.x = Math.cos(t * 6 + seed) * 0.18;
      void zoneY;
    });
  }

  private makeFox(): THREE.Group {
    const fox = new THREE.Group();
    const fur = this.furMat('#c2611d', '#f7e8d5', 'plain');
    const body = new THREE.Mesh(this.fishBodyGeo(1.35, 0.55, 0.4), fur);
    body.position.y = 0.62;
    fox.add(body);
    const head = new THREE.Group();
    head.position.set(0.72, 0.82, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), fur);
    skull.scale.set(1.15, 0.9, 0.85);
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.36, 8), this.furMat('#e8d9c3', '#f7e8d5', 'plain'));
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(0.3, -0.05, 0);
    head.add(snout);
    this.eyePair(head, 0.14, 0.05, 0.12, 0.028);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.26, 4), fur);
      ear.position.set(-0.06, 0.2, s * 0.11);
      head.add(ear);
    }
    fox.add(head);
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.68, 0.68, 0), new THREE.Vector3(-1.05, 0.82, 0.08),
      new THREE.Vector3(-1.32, 1.02, 0), new THREE.Vector3(-1.45, 1.28, -0.05),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 10, 0.13, 7), fur);
    fox.add(tail);
    const legs = [
      this.leg(fox, 0.45, 0.58, 0.14, 0.56, 0.045, fur), this.leg(fox, 0.45, 0.58, -0.14, 0.56, 0.045, fur),
      this.leg(fox, -0.45, 0.58, 0.14, 0.56, 0.045, fur), this.leg(fox, -0.45, 0.58, -0.14, 0.56, 0.045, fur),
    ];
    fox.userData['legs'] = legs;
    fox.userData['head'] = head;
    return fox;
  }

  private makeTiger(): THREE.Group {
    const tiger = new THREE.Group();
    const fur = this.furMat('#d97c22', '#f5e3c2', 'bands', 'rgba(20,12,4,0.9)');
    const body = new THREE.Mesh(this.fishBodyGeo(2.15, 0.85, 0.58), fur);
    body.position.y = 0.98;
    tiger.add(body);
    const head = new THREE.Group();
    head.position.set(1.12, 1.18, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), fur);
    skull.scale.set(1.05, 0.9, 0.95);
    head.add(skull);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), this.furMat('#f5e3c2', '#fff7e8', 'plain'));
    muzzle.scale.set(1.1, 0.75, 0.9);
    muzzle.position.set(0.24, -0.1, 0);
    head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: 0x7f1d3a, roughness: 0.35 }));
    nose.position.set(0.42, -0.04, 0);
    head.add(nose);
    // Glowing amber eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 8), eyeMat);
      eye.position.set(0.24, 0.08, s * 0.15);
      head.add(eye);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
      ear.scale.set(1, 1, 0.45);
      ear.position.set(-0.14, 0.24, s * 0.2);
      head.add(ear);
    }
    tiger.add(head);
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.1, 1.1, 0), new THREE.Vector3(-1.6, 0.9, 0.15),
      new THREE.Vector3(-1.95, 1.15, 0.05), new THREE.Vector3(-2.1, 1.5, -0.08),
    ]);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.05, 6), fur);
    tail.name = 'tail';
    tiger.add(tail);
    const legs = [
      this.leg(tiger, 0.72, 0.92, 0.24, 0.9, 0.075, fur), this.leg(tiger, 0.72, 0.92, -0.24, 0.9, 0.075, fur),
      this.leg(tiger, -0.72, 0.92, 0.24, 0.9, 0.075, fur), this.leg(tiger, -0.72, 0.92, -0.24, 0.9, 0.075, fur),
    ];
    tiger.userData['legs'] = legs;
    tiger.userData['head'] = head;
    return tiger;
  }

  /** Walk cycle + pacing for fox/tiger/wolf-style animals. */
  private pace(animal: THREE.Group, home: THREE.Vector3, range: number, speed: number, zoneY: number, predator = false): void {
    const legs = animal.userData['legs'] as THREE.Group[];
    const head = animal.userData['head'] as THREE.Group | undefined;
    this.wildlife.push((t) => {
      const boost = this.pulseBoost(t);
      const near = this.nearFactor(zoneY);
      const paceSpeed = speed * (1 + boost * 1.6 + near * 0.4);
      const phase = t * paceSpeed;
      animal.position.x = home.x + Math.sin(phase * 0.32) * range;
      animal.position.y = home.y + Math.abs(Math.sin(phase * 2.4)) * 0.05;
      animal.position.z = home.z + Math.cos(phase * 0.21) * range * 0.25;
      animal.rotation.y = Math.cos(phase * 0.32) > 0 ? 0 : Math.PI;
      legs.forEach((leg, i) => { leg.rotation.z = Math.sin(phase * 2.4 + (i % 2) * Math.PI + Math.floor(i / 2) * 0.4) * 0.5; });
      const tail = animal.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 2.2) * 0.3;
      if (head) {
        // Predators stare at you; prey glance around
        head.rotation.y = predator ? this.mouseX * 0.85 : Math.sin(t * 0.7) * 0.4 + this.mouseX * 0.3 * near;
        head.rotation.z = predator ? -0.06 - boost * 0.16 : 0; // crouch/lunge tell on click
        if (predator) animal.position.y += boost * 0.12 * Math.sin(Math.min(1, boost) * Math.PI);
      }
    });
  }

  private makeBear(): THREE.Group {
    const bear = new THREE.Group();
    const fur = this.furMat('#4a3524', '#5d4630', 'plain');
    const body = new THREE.Mesh(this.fishBodyGeo(2.3, 1.25, 0.95), fur);
    body.position.y = 1.25;
    bear.add(body);
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), fur);
    hump.position.set(0.55, 1.85, 0);
    bear.add(hump);
    const head = new THREE.Group();
    head.position.set(1.2, 1.45, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), fur);
    skull.scale.set(1.1, 0.95, 0.9);
    head.add(skull);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), this.furMat('#8a6f4d', '#a98f66', 'plain'));
    snout.scale.set(1.25, 0.8, 0.85);
    snout.position.set(0.32, -0.1, 0);
    head.add(snout);
    this.eyePair(head, 0.24, 0.1, 0.2, 0.04);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), fur);
      ear.scale.set(1, 1, 0.5);
      ear.position.set(-0.1, 0.3, s * 0.22);
      head.add(ear);
    }
    bear.add(head);
    const legs = [
      this.leg(bear, 0.78, 1.15, 0.34, 1.1, 0.13, fur), this.leg(bear, 0.78, 1.15, -0.34, 1.1, 0.13, fur),
      this.leg(bear, -0.78, 1.15, 0.34, 1.1, 0.13, fur), this.leg(bear, -0.78, 1.15, -0.34, 1.1, 0.13, fur),
    ];
    bear.userData['legs'] = legs;
    bear.userData['head'] = head;
    return bear;
  }

  private makeElephant(): THREE.Group {
    const el = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      map: this.skinTexture((ctx, w, h) => {
        ctx.fillStyle = '#8d8d94'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(60,60,66,0.35)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 160; i++) {
          ctx.beginPath();
          const x = Math.random() * w, yy = Math.random() * h;
          ctx.moveTo(x, yy); ctx.lineTo(x + (Math.random() - 0.5) * 34, yy + (Math.random() - 0.5) * 20); ctx.stroke();
        }
        for (let i = 0; i < 2400; i++) { ctx.fillStyle = 'rgba(40,40,46,0.12)'; ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6); }
      }),
      roughness: 0.94,
    });
    const body = new THREE.Mesh(this.fishBodyGeo(4.4, 2.5, 2), skin);
    body.position.y = 2.55;
    el.add(body);
    const head = new THREE.Group();
    head.position.set(2.25, 2.9, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 14), skin);
    skull.scale.set(0.95, 1.05, 0.9);
    head.add(skull);
    this.eyePair(head, 0.62, 0.18, 0.62, 0.055);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), skin);
      ear.scale.set(0.32, 1, 0.95);
      ear.position.set(-0.25, 0.05, s * 0.85);
      ear.name = s < 0 ? 'earL' : 'earR';
      head.add(ear);
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.05, 8), new THREE.MeshStandardMaterial({ color: 0xf5efe0, roughness: 0.35 }));
      tusk.position.set(0.62, -0.62, s * 0.34);
      tusk.rotation.z = 2.5;
      head.add(tusk);
    }
    // Trunk: segmented tube that sways + curls
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.72, -0.35, 0), new THREE.Vector3(0.98, -1.15, 0),
      new THREE.Vector3(0.9, -1.85, 0), new THREE.Vector3(0.62, -2.3, 0),
    ]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 14, 0.19, 8), skin);
    trunk.name = 'trunk';
    head.add(trunk);
    el.add(head);
    const legs: THREE.Group[] = [];
    for (const [lx, lz] of [[1.45, 0.62], [1.45, -0.62], [-1.45, 0.62], [-1.45, -0.62]] as const) {
      legs.push(this.leg(el, lx, 2.1, lz, 2.05, 0.21, skin));
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.025, 1.3, 6), skin);
    tail.position.set(-2.25, 2.5, 0);
    tail.rotation.z = 0.25;
    tail.name = 'tail';
    el.add(tail);
    el.userData['head'] = head;
    el.userData['legs'] = legs;
    return el;
  }

  private makeOwl(): THREE.Group {
    const owl = new THREE.Group();
    const fur = this.furMat('#6b5136', '#9a8264', 'spots', 'rgba(38,28,16,0.8)');
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), fur);
    body.scale.set(0.95, 1.25, 0.9);
    body.position.y = 0.42;
    owl.add(body);
    const head = new THREE.Group();
    head.position.y = 0.92;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), fur);
    skull.scale.set(1.15, 0.9, 0.95);
    head.add(skull);
    // Big forward eyes in a pale face disc
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), this.furMat('#e8dcc3', '#f2e9d4', 'plain'));
    face.scale.set(1.05, 0.85, 0.55);
    face.position.set(0.1, 0, 0);
    face.rotation.y = Math.PI / 2;
    head.add(face);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), eyeMat);
      eye.position.set(0.24, 0.04, s * 0.09);
      head.add(eye);
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 5), fur);
      tuft.position.set(-0.05, 0.22, s * 0.16);
      head.add(tuft);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 6), new THREE.MeshStandardMaterial({ color: 0x3f3226, roughness: 0.5 }));
    beak.rotation.x = Math.PI;
    beak.position.set(0.26, -0.06, 0);
    head.add(beak);
    owl.add(head);
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), fur);
      wing.scale.set(0.35, 1.05, 0.75);
      wing.position.set(-0.02, 0.42, s * 0.3);
      owl.add(wing);
    }
    owl.userData['head'] = head;
    return owl;
  }

  private makeBird(color: number, size = 1): THREE.Group {
    const bird = new THREE.Group();
    const mat = this.furMat('#' + new THREE.Color(color).getHexString(), '#ffffff', 'plain');
    const body = new THREE.Mesh(this.fishBodyGeo(0.72, 0.26, 0.2), mat);
    bird.add(body);
    const headB = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat);
    headB.position.set(0.4, 0.08, 0);
    bird.add(headB);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 }));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.58, 0.06, 0);
    bird.add(beak);
    this.eyePair(bird, 0.42, 0.12, 0.08, 0.02);
    const tailB = this.finMesh(color, 0.3, 0.16, 0.9);
    tailB.position.set(-0.42, 0.02, 0);
    bird.add(tailB);
    for (const s of [-1, 1]) {
      const wingPivot = new THREE.Group();
      wingPivot.position.set(0.05, 0.1, s * 0.08);
      const wing = this.finMesh(color, 0.55, 0.34, 0.85);
      wing.position.z = s * 0.3;
      wingPivot.add(wing);
      wingPivot.name = s < 0 ? 'wingL' : 'wingR';
      bird.add(wingPivot);
    }
    bird.scale.setScalar(size);
    return bird;
  }

  private flyCircle(bird: THREE.Group, cx: number, cy: number, cz: number, r: number, speed: number, phase: number): void {
    this.wildlife.push((t) => {
      const boost = this.pulseBoost(t);
      const sp = speed * (1 + boost * 2.2); // scatter burst when clicked
      const a = t * sp + phase + boost * 1.5;
      const rr = r + boost * 2.5;
      bird.position.set(cx + Math.cos(a) * rr, cy + Math.sin(t * 2.1 + phase) * 0.7 + boost * 1.2, cz + Math.sin(a) * rr);
      bird.rotation.y = -a - Math.PI / 2 + (speed < 0 ? Math.PI : 0);
      bird.rotation.z = -0.35;
      const flap = Math.sin(t * (11 + boost * 16) + phase) * (0.95 - boost * 0.3);
      const wl = bird.getObjectByName('wingL');
      const wr = bird.getObjectByName('wingR');
      if (wl) wl.rotation.x = flap;
      if (wr) wr.rotation.x = -flap;
    });
  }

  private forestFloor(g: THREE.Group, color = 0x1e3a1c): void {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 36),
      new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -5.9, -3);
    g.add(floor);
  }

  private tree(g: THREE.Group, x: number, z: number, h: number, canopyColor: number, yBase = -6): void {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4230, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, h, 8), trunkMat);
    trunk.position.set(x, yBase + h / 2, z);
    trunk.rotation.z = (x % 3) * 0.02;
    g.add(trunk);
    const leafMat = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 - i * 0.28, 1), leafMat);
      blob.position.set(x + (i - 1) * 0.8, yBase + h + 0.7 + i * 0.75, z + ((i * 7) % 3 - 1) * 0.6);
      blob.scale.y = 0.82;
      g.add(blob);
    }
  }

  private buildForestEnvironment(): void {
    if (!this.forestWorld) return;
    const greens = [0x2f6b2f, 0x3d7a35, 0x27632c, 0x4c8a3f];
    // Forest lining the whole descent path
    const env = new THREE.Group();
    for (let i = 0; i < 72; i++) {
      const a = (i * 2.4) % (Math.PI * 2);
      const depthY = -4 - ((i * 47) % 160);
      const r = 11.5 + (i % 5) * 1.4;
      this.tree(env, Math.cos(a) * r, Math.sin(a) * r - 4, 9 + (i % 5) * 2.4, greens[i % greens.length], depthY - 6);
    }
    this.forestWorld.add(env);
    // Fireflies everywhere
    const count = 380;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 28;
      pos[i * 3 + 1] = 12 - Math.random() * 178;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 24 - 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const flies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xd9f99d, size: 0.17, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.forestWorld.add(flies);
    this.wildlife.push((t) => {
      flies.rotation.y = t * 0.012;
      (flies.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 2.4) * 0.3 + this.pulseBoost(t) * 0.4;
      flies.position.y = Math.sin(t * 0.4) * 1.2;
    });
    // Sun shafts through the canopy (surface)
    for (let i = 0; i < 4; i++) {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 2.6, 24, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false }));
      ray.position.set(-5 + i * 3.6, 2, -9 - i);
      ray.rotation.z = 0.2;
      this.forestWorld.add(ray);
    }
  }

  private buildCanopyGate(y: number): void {
    const g = new THREE.Group();
    // Overhead canopy arch + hanging vines with a monkey
    for (const s of [-1, 1]) this.tree(g, s * 7.5, -6, 13, 0x2f6b2f, -6);
    const vineMat = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 1 });
    for (let i = 0; i < 5; i++) {
      const vx = -5 + i * 2.5;
      const vine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 4.5 + (i % 3), 5), vineMat);
      vine.position.set(vx, 4.6, -6);
      g.add(vine);
    }
    // Monkey swinging on the middle vine
    const monkey = new THREE.Group();
    const mfur = this.furMat('#7c5a36', '#c9a877', 'plain');
    const mbody = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mfur);
    mbody.scale.set(0.9, 1.1, 0.85);
    monkey.add(mbody);
    const mhead = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mfur);
    mhead.position.set(0, 0.42, 0);
    monkey.add(mhead);
    const mface = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.furMat('#e8d5b5', '#f5ead2', 'plain'));
    mface.position.set(0.1, 0.38, 0);
    monkey.add(mface);
    this.eyePair(monkey, 0.2, 0.48, 0.07, 0.024);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.85, 6), mfur);
      arm.position.set(0, 0.72, s * 0.2);
      arm.rotation.x = s * 0.5;
      monkey.add(arm);
      const legM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.6, 6), mfur);
      legM.position.set(-0.05, -0.42, s * 0.14);
      legM.rotation.z = 0.5;
      monkey.add(legM);
    }
    const mtailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, -0.3, 0), new THREE.Vector3(-0.5, -0.55, 0.1), new THREE.Vector3(-0.72, -0.2, 0),
    ]);
    monkey.add(new THREE.Mesh(new THREE.TubeGeometry(mtailCurve, 8, 0.035, 5), mfur));
    monkey.position.set(0, 2.1, -6);
    g.add(monkey);
    this.wildlife.push((t) => {
      const swing = Math.sin(t * 1.5) * (0.5 + this.pulseBoost(t) * 0.7);
      monkey.rotation.z = swing;
      monkey.rotation.y = this.mouseX * 0.5; // watches your cursor
      monkey.position.x = Math.sin(t * 1.5) * 1.1;
    });
    // Birds crossing the canopy
    for (let i = 0; i < 5; i++) {
      const b = this.makeBird([0x38bdf8, 0xfbbf24, 0xfb7185, 0x4ade80, 0xa78bfa][i], 1.1);
      g.add(b);
      this.flyCircle(b, 0, 5.5 + (i % 2), -5, 7 + (i % 3), 0.35 + i * 0.03, i * 1.3);
    }
    g.add(new THREE.PointLight(0xfde68a, 70, 44, 1.7));
    this.addZone(g, y, 0, this.forestWorld);
  }

  private buildMeadow(zoneY: number): void {
    const g = new THREE.Group();
    this.forestFloor(g, 0x2a4d24);
    // Grass tufts + wildflowers
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x4c8a3f, roughness: 1, flatShading: true });
    for (let i = 0; i < 40; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8 + (i % 3) * 0.25, 5), grassMat);
      tuft.position.set(((i * 37) % 17) - 8.5, -5.6, -7 + ((i * 23) % 11));
      g.add(tuft);
    }
    const petalColors = [0xfda4af, 0xfde68a, 0xffffff, 0xc4b5fd];
    for (let i = 0; i < 16; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: petalColors[i % petalColors.length] }));
      fl.position.set(((i * 29) % 15) - 7.5, -5.35, -6 + ((i * 17) % 9));
      g.add(fl);
    }
    // Deer herd: stag + does grazing (they watch you)
    const stag = this.makeDeer(true, 0);
    stag.position.set(-2.5, -5.9, -4);
    g.add(stag);
    this.graze(stag, zoneY);
    for (let i = 0; i < 2; i++) {
      const doe = this.makeDeer(false, i + 1);
      doe.scale.setScalar(0.88);
      doe.position.set(1.8 + i * 2.4, -5.9, -5.5 + i * 1.6);
      doe.rotation.y = -0.5 + i * 0.5;
      g.add(doe);
      this.graze(doe, zoneY);
    }
    // Rabbits hopping about
    for (let i = 0; i < 3; i++) {
      const rb = this.makeRabbit(i);
      g.add(rb);
      this.hopAbout(rb, new THREE.Vector3(-5 + i * 4.2, -5.75, -2.5 - i), zoneY);
    }
    // Butterflies
    for (let i = 0; i < 4; i++) {
      const bf = new THREE.Group();
      const wmat = new THREE.MeshBasicMaterial({ color: [0xfda4af, 0xfde68a, 0x93c5fd, 0xc4b5fd][i], side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      for (const s of [-1, 1]) {
        const wingB = new THREE.Mesh(new THREE.CircleGeometry(0.14, 8), wmat);
        wingB.position.x = s * 0.12;
        wingB.name = s < 0 ? 'wingL' : 'wingR';
        bf.add(wingB);
      }
      g.add(bf);
      this.wildlife.push((t) => {
        bf.position.set(Math.sin(t * 0.6 + i * 2) * 5, -3.6 + Math.sin(t * 2.4 + i) * 0.5 + this.pulseBoost(t) * 1.4, -3.5 + Math.cos(t * 0.45 + i) * 2.5);
        bf.rotation.y = t * 0.8 + i;
        const wl = bf.getObjectByName('wingL');
        const wr = bf.getObjectByName('wingR');
        const flap = Math.sin(t * 16 + i * 2) * 0.9;
        if (wl) wl.rotation.y = flap;
        if (wr) wr.rotation.y = -flap;
      });
    }
    g.add(new THREE.PointLight(0xa3e635, 65, 42, 1.6));
    this.addZone(g, zoneY, 0, this.forestWorld);
  }

  private buildElephantGrove(zoneY: number): void {
    const g = new THREE.Group();
    this.forestFloor(g, 0x24401f);
    // Waterhole
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28),
      new THREE.MeshPhysicalMaterial({ color: 0x2b6cb8, roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.85 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(3.8, -5.82, -4.5);
    g.add(pool);
    this.wildlife.push((t) => { pool.rotation.z = t * 0.03; });
    for (const s of [-1, 1]) this.tree(g, s * 8, -7.5, 11 + (s > 0 ? 2 : 0), 0x2f6b2f);
    // Elephant matriarch (slow walk, ear flaps, trunk sway)
    const elephant = this.makeElephant();
    elephant.scale.setScalar(0.92);
    g.add(elephant);
    const eHead = elephant.userData['head'] as THREE.Group;
    const eLegs = elephant.userData['legs'] as THREE.Group[];
    this.wildlife.push((t) => {
      const boost = this.pulseBoost(t);
      elephant.position.x = Math.sin(t * 0.07) * 3.4;
      elephant.position.y = -5.9 + Math.abs(Math.sin(t * 1.15)) * 0.06;
      elephant.position.z = -4.5;
      elephant.rotation.y = Math.cos(t * 0.07) > 0 ? 0 : Math.PI;
      eLegs.forEach((leg, i) => { leg.rotation.z = Math.sin(t * 1.15 + (i % 2) * Math.PI + Math.floor(i / 2) * 0.5) * 0.22; });
      const trunk = eHead.getObjectByName('trunk');
      if (trunk) { trunk.rotation.x = Math.sin(t * 0.8) * 0.16; trunk.rotation.z = Math.sin(t * 0.55) * 0.12 + boost * 0.35; } // trunk raises when you click
      const earL = eHead.getObjectByName('earL');
      const earR = eHead.getObjectByName('earR');
      const flapE = Math.sin(t * 1.4) * (0.14 + boost * 0.25);
      if (earL) earL.rotation.y = flapE;
      if (earR) earR.rotation.y = -flapE;
      eHead.rotation.y = this.mouseX * 0.22 * Math.max(this.nearFactor(zoneY), boost * 0.6);
    });
    // Fox trotting the grove edge
    const fox = this.makeFox();
    g.add(fox);
    this.pace(fox, new THREE.Vector3(0, -5.9, -1.5), 5.5, 0.85, zoneY);
    g.add(new THREE.PointLight(0x84cc16, 60, 42, 1.6));
    this.addZone(g, zoneY, 0, this.forestWorld);
  }

  private buildPredatorTerritory(zoneY: number): void {
    const g = new THREE.Group();
    this.forestFloor(g, 0x1c2f18);
    // Claw-marked boundary trees + bones: you're in their territory
    for (const s of [-1, 1]) {
      this.tree(g, s * 6.4, -6.5, 10.5, 0x27632c);
      const scratchMat = new THREE.MeshBasicMaterial({ color: 0xe7dcc8 });
      for (let k = 0; k < 3; k++) {
        const scratch = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.85, 0.012), scratchMat);
        scratch.position.set(s * 6.4 - s * 0.42, -2.6 + k * 0.12, -5.9);
        scratch.rotation.z = 0.28;
        g.add(scratch);
      }
    }
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.65, 6), boneMat);
      bone.rotation.set(Math.PI / 2.2, 0, i * 1.2);
      bone.position.set(-3.5 + i * 1.6, -5.7, -2.2 - (i % 2));
      g.add(bone);
    }
    // Tiger pacing its territory — it watches YOU
    const tiger = this.makeTiger();
    tiger.scale.setScalar(1.15);
    g.add(tiger);
    this.pace(tiger, new THREE.Vector3(0, -5.9, -4.2), 5.2, 0.55, zoneY, true);
    // Wolf pack on the rocks
    const wolfPositions: [number, number, number][] = [[-4.6, -4.6, -6.5], [-3.4, -4.2, -7.4], [4.8, -4.5, -6.8]];
    for (let wi = 0; wi < 3; wi++) {
      const wolf = new THREE.Group();
      const wfur = this.furMat('#6f6a63', '#a8a29e', 'plain');
      const wbody = new THREE.Mesh(this.fishBodyGeo(1.65, 0.68, 0.46), wfur);
      wbody.position.y = 0.85;
      wolf.add(wbody);
      const whead = new THREE.Group();
      whead.position.set(0.85, 1.08, 0);
      const wskull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), wfur);
      wskull.scale.set(1.2, 0.9, 0.85);
      whead.add(wskull);
      const wsnout = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 8), wfur);
      wsnout.rotation.z = -Math.PI / 2;
      wsnout.position.set(0.3, -0.06, 0);
      whead.add(wsnout);
      this.eyePair(whead, 0.15, 0.06, 0.13, 0.03);
      for (const s of [-1, 1]) {
        const wear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 4), wfur);
        wear.position.set(-0.08, 0.2, s * 0.12);
        whead.add(wear);
      }
      wolf.add(whead);
      const wtail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 6), wfur);
      wtail.position.set(-0.9, 0.95, 0);
      wtail.rotation.z = 0.9;
      wolf.add(wtail);
      for (const [lx, lz] of [[0.55, 0.18], [0.55, -0.18], [-0.55, 0.18], [-0.55, -0.18]] as const) {
        this.leg(wolf, lx, 0.82, lz, 0.8, 0.05, wfur);
      }
      wolf.position.set(...wolfPositions[wi]);
      wolf.rotation.y = 0.4 - wi * 0.35;
      g.add(wolf);
      this.wildlife.push((t) => {
        // Periodic howl: head tilts up together; heads track your cursor between howls
        const howl = Math.max(0, Math.sin(t * 0.24 + wi * 0.35));
        const howling = howl > 0.93 ? 1 : 0;
        whead.rotation.z = -howling * 0.65 + this.pulseBoost(t) * -0.3;
        whead.rotation.y = howling ? 0 : this.mouseX * 0.7;
        wolf.position.y = wolfPositions[wi][1] + this.pulseBoost(t) * Math.abs(Math.sin(t * 8 + wi)) * 0.15;
      });
    }
    g.add(new THREE.PointLight(0xd97706, 55, 42, 1.6));
    this.addZone(g, zoneY, 0, this.forestWorld);
  }

  private buildNocturnalRuins(zoneY: number): void {
    const g = new THREE.Group();
    this.forestFloor(g, 0x16240f);
    // Ancient stone ruins
    const stoneMat = this.rockMat(0x6b6257);
    for (let i = 0; i < 6; i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.4 + (i % 3) * 0.5, 0.8 + (i % 2) * 0.5, 1.1), stoneMat);
      block.position.set(-6 + i * 2.3, -5.5 + (i % 2) * 0.35, -7.5);
      block.rotation.y = i * 0.5;
      g.add(block);
    }
    for (const px of [-5.2, 5.2]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 6.4, 10), stoneMat);
      col.position.set(px, -2.7, -7.2);
      g.add(col);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.8, 1.2), stoneMat);
    lintel.position.set(0, 0.7, -7.2);
    lintel.rotation.z = 0.02;
    g.add(lintel);
    // Bear ambling by the ruins (rears up when you click)
    const bear = this.makeBear();
    g.add(bear);
    const bHead = bear.userData['head'] as THREE.Group;
    this.pace(bear, new THREE.Vector3(0, -5.9, -3.4), 4.2, 0.34, zoneY);
    this.wildlife.push((t) => {
      const boost = this.pulseBoost(t);
      bear.scale.y = 1 + boost * 0.14; // rears up
      bear.rotation.x = -boost * 0.1;
      bHead.rotation.y = this.mouseX * 0.45;
    });
    // Owls on the lintel — heads follow your cursor
    for (let i = 0; i < 2; i++) {
      const owl = this.makeOwl();
      owl.position.set(-2.6 + i * 4.6, 1.1, -7);
      owl.scale.setScalar(1.25);
      g.add(owl);
      const oHead = owl.userData['head'] as THREE.Group;
      this.wildlife.push((t) => {
        oHead.rotation.y = this.mouseX * 1.15; // owl head tracking
        oHead.rotation.x = this.mouseY * 0.3;
        if (this.pulseBoost(t) > 0.6 && i === 0) owl.position.y = 1.1 + (this.pulseBoost(t) - 0.6) * 2.2; // startles up
      });
    }
    // Snake slithering through the grass
    const snake = new THREE.Group();
    const snakeMat = this.furMat('#4d7c0f', '#365314', 'bands', 'rgba(220,252,180,0.5)');
    const segments: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.16 - i * 0.008, 10, 8), snakeMat);
      seg.scale.set(1.35, 0.62, 0.9);
      snake.add(seg);
      segments.push(seg);
    }
    const sHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), snakeMat);
    sHead.scale.set(1.4, 0.7, 0.95);
    snake.add(sHead);
    segments.push(sHead);
    g.add(snake);
    this.wildlife.push((t) => {
      for (let i = 0; i < segments.length; i++) {
        const tt = t * 1.6 - i * 0.42;
        segments[i].position.set(Math.sin(tt * 0.75) * 3.4 + Math.cos(tt * 0.22) * 1.4, -5.72, -2 + Math.sin(tt) * 0.55 - i * 0.05);
      }
      void zoneY;
    });
    g.add(new THREE.PointLight(0xa3e635, 50, 42, 1.7));
    this.addZone(g, zoneY, 0, this.forestWorld);
  }

  private buildSunriseClearing(zoneY: number): void {
    const g = new THREE.Group();
    this.forestFloor(g, 0x2f4d22);
    // Golden sunrise gate
    const gate = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.2, 16, 90),
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1.5, roughness: 0.4 }));
    gate.position.z = -7;
    g.add(gate);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(5.9, 48),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    glow.position.z = -7;
    g.add(glow);
    this.wildlife.push((t) => { glow.material.opacity = 0.24 + Math.sin(t * 2) * 0.06; });
    for (const s of [-1, 1]) this.tree(g, s * 8.4, -7, 12.5, 0x3d7a35);
    // Dawn chorus: birds everywhere + a deer family seeing you off
    for (let i = 0; i < 6; i++) {
      const b = this.makeBird([0xfbbf24, 0x38bdf8, 0xfb7185, 0x4ade80, 0xa78bfa, 0xf97316][i], 1.15);
      g.add(b);
      this.flyCircle(b, 0, 3.8 + (i % 3), -5, 6.4 + (i % 3), 0.4 + i * 0.025, i * 1.05);
    }
    const stag = this.makeDeer(true, 5);
    stag.position.set(-3.6, -5.9, -4.6);
    stag.rotation.y = 0.5;
    g.add(stag);
    this.graze(stag, zoneY);
    const fawn = this.makeDeer(false, 6);
    fawn.scale.setScalar(0.55);
    fawn.position.set(-2.2, -5.9, -3.6);
    g.add(fawn);
    this.graze(fawn, zoneY);
    g.add(new THREE.PointLight(0xfbbf24, 85, 48, 1.5));
    this.addZone(g, zoneY, 0, this.forestWorld);
  }

  // ══ OCEAN THEME ═══════════════════════════════════════════════════════
  /** The Ocean: same dive, living water — reef → kelp → deep sea → abyss → sunlight. */
  private buildOcean(): void {
    if (!this.oceanWorld || !this.scene) return;
    this.buildOceanSurface();
    this.buildReef(-38);
    this.buildKelpForest(-68);
    this.buildDeepSea(-98);
    this.buildAbyss(-128);
    this.buildSunlightExit(-158);
    this.buildBubbles();
  }

  private omat(color: number, emissive = color, intensity = 0.45, opacity = 0.96): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: intensity,
      roughness: 0.55, metalness: 0.1, transparent: true, opacity,
    });
  }

  // ── Realism toolkit: procedural skin textures + wet materials ────────
  private skinTexture(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    if (ctx) paint(ctx, 512, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  private wetMat(map: THREE.Texture | null, color = 0xffffff, opacity = 1): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      map: map ?? undefined, color, roughness: 0.38, metalness: 0.05,
      clearcoat: 0.9, clearcoatRoughness: 0.35,
      transparent: opacity < 1, opacity, side: THREE.DoubleSide,
    });
  }

  /** Paint a fish skin: countershaded gradient + pattern + faint scale arcs. */
  private fishTexture(top: string, belly: string, pattern: 'stripes' | 'spots' | 'bands' | 'plain', accent = '#ffffff'): THREE.CanvasTexture {
    return this.skinTexture((ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, top); grad.addColorStop(0.55, top); grad.addColorStop(1, belly);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.16; ctx.strokeStyle = '#ffffff';
      for (let y = 14; y < h; y += 16) for (let x = 0; x < w; x += 18) {
        ctx.beginPath(); ctx.arc(x + ((y / 16) % 2) * 9, y, 9, 0.15, Math.PI - 0.15); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (pattern === 'stripes') {
        ctx.fillStyle = accent;
        for (const [x, ww] of [[90, 42], [235, 34], [370, 26]] as const) {
          ctx.beginPath(); ctx.ellipse(x, h / 2, ww, h * 0.52, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        for (const x of [136, 274, 402]) ctx.fillRect(x, 8, 5, h - 16);
      } else if (pattern === 'bands') {
        ctx.fillStyle = accent; ctx.globalAlpha = 0.85;
        for (let x = 40; x < w; x += 74) ctx.fillRect(x, 0, 20, h);
        ctx.globalAlpha = 1;
      } else if (pattern === 'spots') {
        ctx.fillStyle = accent;
        for (let i = 0; i < 90; i++) {
          ctx.beginPath();
          ctx.arc(Math.random() * w, Math.random() * h * 0.8, 2.5 + Math.random() * 5, 0, Math.PI * 2); ctx.fill();
        }
      }
    });
  }

  /** Fusiform (real fish-shaped) body geometry: plump mid, tapered snout + tail peduncle. */
  private fishBodyGeo(len = 1.25, height = 0.42, width = 0.24): THREE.SphereGeometry {
    const geo = new THREE.SphereGeometry(0.5, 28, 20);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * 2; // -1..1 along body
      const profile = Math.pow(Math.max(0.12, 1 - Math.pow(Math.abs(x), 2.6) * 0.55), 0.7);
      const tailPinch = x < -0.55 ? 1 - (-x - 0.55) * 0.9 : 1;
      pos.setXYZ(i, x * len * 0.5, pos.getY(i) * height * profile, pos.getZ(i) * width * profile * tailPinch);
    }
    geo.computeVertexNormals();
    return geo;
  }

  private eyePair(parent: THREE.Group, x: number, y: number, z: number, r = 0.045): void {
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0f14, roughness: 0.12, clearcoat: 1 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), eyeMat);
      eye.position.set(x, y, s * z);
      parent.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
      glint.position.set(x + r * 0.45, y + r * 0.45, s * (z + r * 0.72));
      parent.add(glint);
    }
  }

  private finMesh(color: number, w: number, h: number, opacity = 0.85): THREE.Mesh {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8),
      this.wetMat(null, color, opacity));
    fin.scale.set(w, h, 0.035);
    return fin;
  }

  /**
   * A realistic fish: shaped body with painted species skin, glossy eyes,
   * forked tail, dorsal + pectoral + anal fins. Species cycle by index.
   */
  private makeFish(color: number, size = 1, species = 0): THREE.Group {
    const skins: [string, string, 'stripes' | 'spots' | 'bands' | 'plain', string][] = [
      ['#f97316', '#ffedd5', 'stripes', '#ffffff'],           // clownfish
      ['#2563eb', '#93c5fd', 'plain', '#ffffff'],             // blue tang body
      ['#eab308', '#fef9c3', 'bands', 'rgba(30,41,59,0.65)'],// yellow banded
      ['#0ea5e9', '#e0f2fe', 'spots', 'rgba(255,255,255,0.8)'],// spotted reef fish
      ['#f43f5e', '#ffe4e6', 'plain', '#ffffff'],             // anthias pink
      ['#10b981', '#d1fae5', 'bands', 'rgba(6,78,59,0.55)'],  // emerald wrasse
    ];
    const [top, belly, pattern, accent] = skins[Math.abs(species) % skins.length];
    const fish = new THREE.Group();
    const body = new THREE.Mesh(this.fishBodyGeo(1.3, 0.44, 0.25), this.wetMat(this.fishTexture(top, belly, pattern, accent)));
    body.name = 'body';
    fish.add(body);
    this.eyePair(fish, 0.44, 0.06, 0.115, 0.042);
    // Forked caudal tail
    const tail = new THREE.Group();
    tail.name = 'tail';
    const tailMat = this.wetMat(null, new THREE.Color(top).getHex(), 0.9);
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 6), tailMat);
      lobe.scale.set(1, 1, 0.28);
      lobe.position.set(-0.1, s * 0.13, 0);
      lobe.rotation.z = Math.PI / 2 + s * 0.5;
      tail.add(lobe);
    }
    tail.position.x = -0.66;
    fish.add(tail);
    // Dorsal + anal fins
    const dorsal = this.finMesh(new THREE.Color(top).getHex(), 0.55, 0.3);
    dorsal.position.set(-0.02, 0.26, 0);
    dorsal.rotation.z = -0.25;
    fish.add(dorsal);
    const anal = this.finMesh(new THREE.Color(top).getHex(), 0.34, 0.18);
    anal.position.set(-0.3, -0.22, 0);
    fish.add(anal);
    // Pectoral fins (flap while swimming)
    for (const s of [-1, 1]) {
      const pec = this.finMesh(new THREE.Color(accent.startsWith('#') ? accent : top).getHex(), 0.3, 0.2, 0.75);
      pec.name = s < 0 ? 'finL' : 'finR';
      pec.position.set(0.22, -0.06, s * 0.14);
      pec.rotation.y = s * 0.5;
      fish.add(pec);
    }
    fish.scale.setScalar(size * 1.45);
    // Keep the requested school colour as a subtle emissive identity
    body.material.emissive = new THREE.Color(color);
    body.material.emissiveIntensity = 0.06;
    return fish;
  }

  /** Realistic shark: countershaded skin, gill slits, swept pectorals, heterocercal tail. */
  private makeShark(): THREE.Group {
    const shark = new THREE.Group();
    const skin = this.wetMat(this.fishTexture('#5b6b7f', '#eef2f5', 'plain'));
    const body = new THREE.Mesh(this.fishBodyGeo(4.8, 1.02, 0.82), skin);
    body.name = 'body';
    shark.add(body);
    this.eyePair(shark, 1.78, 0.1, 0.36, 0.055);
    // Gill slits
    const gillMat = new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const gill = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.012), gillMat);
      gill.position.set(1.18 - i * 0.11, 0, s * 0.4);
      gill.rotation.y = s * 0.25;
      shark.add(gill);
    }
    // Mouth line
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.34), gillMat);
    mouth.position.set(2.08, -0.3, 0);
    shark.add(mouth);
    const finMat = this.wetMat(null, 0x5b6b7f, 0.95);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.05, 4), finMat);
    dorsal.scale.set(1.5, 1, 0.16);
    dorsal.position.set(-0.15, 0.78, 0);
    dorsal.rotation.z = -0.38;
    shark.add(dorsal);
    for (const s of [-1, 1]) {
      const pec = this.finMesh(0x5b6b7f, 1.15, 0.42, 0.95);
      pec.name = s < 0 ? 'finL' : 'finR';
      pec.position.set(0.85, -0.32, s * 0.48);
      pec.rotation.set(0.5, s * 0.65, s * -0.5);
      shark.add(pec);
    }
    const tail = new THREE.Group();
    tail.name = 'tail';
    const upper = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.25, 4), finMat);
    upper.scale.set(1, 1, 0.14);
    upper.position.set(-0.28, 0.34, 0);
    upper.rotation.z = Math.PI / 2 + 0.55;
    tail.add(upper);
    const lower = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 4), finMat);
    lower.scale.set(1, 1, 0.14);
    lower.position.set(-0.2, -0.24, 0);
    lower.rotation.z = Math.PI / 2 - 0.6;
    tail.add(lower);
    tail.position.x = -2.35;
    shark.add(tail);
    return shark;
  }

  /** Realistic dolphin: beak, melon head, curved dorsal, horizontal fluke. */
  private makeDolphin(): THREE.Group {
    const dolphin = new THREE.Group();
    const body = new THREE.Mesh(this.fishBodyGeo(2.7, 0.6, 0.42),
      this.wetMat(this.fishTexture('#6d9dc5', '#eef7fd', 'plain')));
    body.name = 'body';
    dolphin.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.62, 10), this.wetMat(null, 0x6d9dc5));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(1.55, -0.05, 0);
    dolphin.add(beak);
    this.eyePair(dolphin, 1.08, 0.05, 0.19, 0.035);
    const finMat = this.wetMat(null, 0x5b8ab5, 0.95);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 4), finMat);
    dorsal.scale.set(1.4, 1, 0.14);
    dorsal.position.set(-0.18, 0.4, 0);
    dorsal.rotation.z = -0.55;
    dolphin.add(dorsal);
    for (const s of [-1, 1]) {
      const pec = this.finMesh(0x5b8ab5, 0.55, 0.2, 0.95);
      pec.name = s < 0 ? 'finL' : 'finR';
      pec.position.set(0.55, -0.2, s * 0.24);
      pec.rotation.y = s * 0.6;
      dolphin.add(pec);
    }
    const fluke = new THREE.Group();
    fluke.name = 'fluke';
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.62, 6), finMat);
      lobe.scale.set(0.22, 1, 1);
      lobe.position.set(-0.08, 0, s * 0.3);
      lobe.rotation.x = s * (Math.PI / 2 - 0.35);
      fluke.add(lobe);
    }
    fluke.position.x = -1.4;
    dolphin.add(fluke);
    return dolphin;
  }

  /** Realistic whale: vast body, throat-pleat bands, long pectorals, horizontal fluke. */
  private makeWhale(): THREE.Group {
    const whale = new THREE.Group();
    const body = new THREE.Mesh(this.fishBodyGeo(7.6, 1.9, 1.65),
      this.wetMat(this.fishTexture('#4a6d96', '#cfdde9', 'bands', 'rgba(30,58,95,0.28)')));
    body.name = 'body';
    whale.add(body);
    this.eyePair(whale, 2.9, -0.15, 0.72, 0.07);
    const finMat = this.wetMat(null, 0x42658c, 0.96);
    for (const s of [-1, 1]) {
      const pec = this.finMesh(0x42658c, 1.7, 0.42, 0.96);
      pec.name = s < 0 ? 'finL' : 'finR';
      pec.position.set(1.7, -0.65, s * 0.85);
      pec.rotation.set(0.4, s * 0.55, s * -0.35);
      whale.add(pec);
    }
    const fluke = new THREE.Group();
    fluke.name = 'fluke';
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.6, 6), finMat);
      lobe.scale.set(0.18, 1, 1);
      lobe.position.set(-0.25, 0, s * 0.85);
      lobe.rotation.x = s * (Math.PI / 2 - 0.25);
      fluke.add(lobe);
    }
    fluke.position.x = -3.85;
    whale.add(fluke);
    return whale;
  }

  /** Realistic manta ray: spotted diamond wings, white underside, whip tail. */
  private makeManta(): THREE.Group {
    const manta = new THREE.Group();
    const wingGeo = new THREE.SphereGeometry(1, 24, 14);
    const wpos = wingGeo.attributes['position'] as THREE.BufferAttribute;
    for (let i = 0; i < wpos.count; i++) {
      const x = wpos.getX(i), z = wpos.getZ(i);
      wpos.setXYZ(i, x * (1 - Math.abs(z) * 0.35), wpos.getY(i), z);
    }
    wingGeo.computeVertexNormals();
    const wing = new THREE.Mesh(wingGeo, this.wetMat(this.fishTexture('#2b3446', '#2b3446', 'spots', 'rgba(255,255,255,0.75)')));
    wing.name = 'wing';
    wing.scale.set(2.1, 0.14, 3.1);
    manta.add(wing);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.92, 18, 10), this.wetMat(null, 0xe8eef4, 0.95));
    belly.scale.set(1.7, 0.1, 2.4);
    belly.position.y = -0.09;
    manta.add(belly);
    this.eyePair(manta, 1.65, 0.08, 0.42, 0.05);
    for (const s of [-1, 1]) {
      const ceph = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), this.wetMat(null, 0x2b3446));
      ceph.rotation.z = -Math.PI / 2.3;
      ceph.position.set(1.95, 0, s * 0.34);
      manta.add(ceph);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.006, 3.4, 5), this.wetMat(null, 0x2b3446));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -3.2;
    manta.add(tail);
    return manta;
  }

  /** Register a circular swimmer with spine undulation + fin flapping. */
  private swimCircle(obj: THREE.Object3D, cx: number, cy: number, cz: number, r: number, speed: number, phase: number, wobble = 0.5): void {
    this.swimmers.push((t) => {
      const a = t * speed + phase;
      obj.position.set(cx + Math.cos(a) * r, cy + Math.sin(t * 1.7 + phase) * wobble, cz + Math.sin(a) * r);
      obj.rotation.y = -a - Math.PI / 2 + (speed < 0 ? Math.PI : 0);
      // Spine undulation: whole-body S-curve roll/yaw oscillation
      obj.rotation.z = Math.sin(t * 7 + phase) * 0.07;
      obj.rotation.x = Math.sin(t * 5.2 + phase) * 0.045;
      const tail = obj.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 9 + phase) * 0.6;
      const fluke = obj.getObjectByName('fluke');
      if (fluke) fluke.rotation.x = Math.sin(t * 6.5 + phase) * 0.5; // dolphins/whales beat vertically
      const body = obj.getObjectByName('body');
      if (body) body.rotation.y = Math.sin(t * 9 + phase - 0.7) * 0.14;
      for (const name of ['finL', 'finR']) {
        const fin = obj.getObjectByName(name);
        if (fin) fin.rotation.x = Math.sin(t * 8 + phase) * 0.55;
      }
    });
  }

  private buildOceanSurface(): void {
    const g = new THREE.Group();
    // Sun disc shining through the water + god-ray cones
    const sun = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40),
      new THREE.MeshBasicMaterial({ color: 0xbaf3ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    sun.position.set(3, 7, -16);
    g.add(sun);
    for (let i = 0; i < 4; i++) {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 2.4, 22, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
      ray.position.set(-4 + i * 3.4, -2, -12 - i);
      ray.rotation.z = 0.22;
      g.add(ray);
    }
    // A welcoming school right at the surface
    const colors = [0xfbbf24, 0xfb7185, 0x34d399, 0x60a5fa, 0xf472b6];
    for (let i = 0; i < 10; i++) {
      const f = this.makeFish(colors[i % colors.length], 0.9 + (i % 3) * 0.25, i);
      g.add(f);
      this.swimCircle(f, 0, 1.5 - (i % 3), -6, 5.5 + (i % 4), 0.25 + (i % 3) * 0.06, i * 0.7);
    }
    this.addZone(g, 0, 0, this.oceanWorld);
  }

  /** Reef (About): corals, starfish, crab + a big fish school. */
  private buildReef(y: number): void {
    const g = new THREE.Group();
    const coralColors = [0xfb7185, 0xfbbf24, 0xa78bfa, 0x34d399, 0xf472b6];
    for (let i = 0; i < 14; i++) {
      const coral = new THREE.Mesh(new THREE.ConeGeometry(0.5 + (i % 3) * 0.2, 1.8 + (i % 4) * 0.7, 7),
        this.omat(coralColors[i % coralColors.length], coralColors[i % coralColors.length], 0.55));
      const a = (i / 14) * Math.PI * 2;
      coral.position.set(Math.cos(a) * (3 + (i % 4)), -4.6, Math.sin(a) * 3.4 - 2);
      coral.rotation.z = ((i % 3) - 1) * 0.16;
      g.add(coral);
    }
    // Starfish on the sand
    for (let i = 0; i < 4; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), this.omat(0xfb923c, 0xea580c, 0.6));
      star.scale.set(1, 0.25, 1);
      star.position.set(-5 + i * 3.4, -5.2, -1 - (i % 2) * 2);
      g.add(star);
    }
    // Crab scuttling sideways — stalked eyes, jointed legs, pincers
    const crab = new THREE.Group();
    const crabMat = this.wetMat(this.fishTexture('#b91c1c', '#ef4444', 'spots', 'rgba(255,200,180,0.5)'));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), crabMat);
    shell.scale.set(1.35, 0.55, 1.05);
    crab.add(shell);
    for (const s of [-1, 1]) {
      // Stalked eye
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), crabMat);
      stalk.position.set(0.32, 0.28, s * 0.2);
      crab.add(stalk);
      const eyeC = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.15, clearcoat: 1 }));
      eyeC.position.set(0.32, 0.42, s * 0.2);
      crab.add(eyeC);
      // Pincer claw (sphere + cone tip)
      const claw = new THREE.Group();
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), crabMat);
      palm.scale.set(1.25, 0.8, 0.7);
      claw.add(palm);
      const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 8), crabMat);
      pincer.rotation.z = -Math.PI / 2;
      pincer.position.x = 0.34;
      claw.add(pincer);
      claw.position.set(0.72, -0.02, s * 0.52);
      claw.rotation.y = s * -0.35;
      crab.add(claw);
      // Three walking legs per side
      for (let li = 0; li < 3; li++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.85, 5), crabMat);
        leg.position.set(-0.1 - li * 0.22, -0.28, s * 0.68);
        leg.rotation.set(s * 0.85, 0, 0.35 + li * 0.18);
        crab.add(leg);
      }
    }
    crab.position.set(0, -5, -3);
    g.add(crab);
    this.swimmers.push((t) => {
      crab.position.x = Math.sin(t * 0.35) * 5.5;
      crab.rotation.y = Math.cos(t * 0.35) > 0 ? 0.25 : -0.25 + Math.PI;
    });
    // The school
    const colors = [0xfbbf24, 0x38bdf8, 0xfb7185, 0x4ade80];
    for (let i = 0; i < 16; i++) {
      const f = this.makeFish(colors[i % colors.length], 0.75 + (i % 3) * 0.2, i + 1);
      g.add(f);
      this.swimCircle(f, 0, 0.5 + (i % 4) * 0.55, -4, 4.2 + (i % 5) * 0.8, 0.32 + (i % 3) * 0.05, i * 0.42, 0.35);
    }
    g.add(new THREE.PointLight(0x38bdf8, 80, 44, 1.6));
    this.addZone(g, y, 0, this.oceanWorld);
  }

  /** Kelp Forest (Experience): swaying kelp, turtle, seahorses, dolphins. */
  private buildKelpForest(y: number): void {
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const kelp = new THREE.Mesh(new THREE.ConeGeometry(0.34, 6.5 + (i % 4), 5), this.omat(0x22c55e, 0x15803d, 0.4));
      const a = (i / 12) * Math.PI * 2;
      kelp.position.set(Math.cos(a) * (3.5 + (i % 4)), -3.4, Math.sin(a) * 3.6 - 2);
      g.add(kelp);
      this.swimmers.push((t) => { kelp.rotation.z = Math.sin(t * 0.9 + i) * 0.13; kelp.rotation.x = Math.cos(t * 0.7 + i) * 0.08; });
    }
    // Turtle paddling through — scute-patterned shell, spotted skin
    const turtle = new THREE.Group();
    const shellTex = this.skinTexture((ctx, w, h) => {
      ctx.fillStyle = '#4d6428'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(24,36,10,0.85)'; ctx.lineWidth = 5;
      ctx.fillStyle = '#5f7a33';
      const cols = 5, rows = 3, cw = w / cols, ch = h / rows;
      for (let rI = 0; rI < rows; rI++) for (let cI = 0; cI < cols; cI++) {
        const x = cI * cw + 7, yy = rI * ch + 7;
        ctx.beginPath();
        ctx.moveTo(x + cw * 0.25, yy); ctx.lineTo(x + cw * 0.75, yy); ctx.lineTo(x + cw - 7, yy + ch * 0.5);
        ctx.lineTo(x + cw * 0.75, yy + ch - 14); ctx.lineTo(x + cw * 0.25, yy + ch - 14); ctx.lineTo(x, yy + ch * 0.5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    });
    const shellT = new THREE.Mesh(new THREE.SphereGeometry(0.95, 22, 16), this.wetMat(shellTex));
    shellT.scale.set(1.3, 0.58, 1.08);
    turtle.add(shellT);
    const plastron = new THREE.Mesh(new THREE.SphereGeometry(0.88, 18, 12), this.wetMat(null, 0xd9c98f));
    plastron.scale.set(1.22, 0.42, 1);
    plastron.position.y = -0.14;
    turtle.add(plastron);
    const skinMat = this.wetMat(this.fishTexture('#7d9b4e', '#a9bd7a', 'spots', 'rgba(52,74,26,0.7)'));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), skinMat);
    head.scale.set(1.25, 0.9, 0.9);
    head.position.set(1.32, 0.02, 0);
    turtle.add(head);
    this.eyePair(turtle, 1.52, 0.1, 0.17, 0.032);
    const flippers: THREE.Mesh[] = [];
    for (const [fx, fz] of [[0.72, 0.88], [0.72, -0.88], [-0.72, 0.8], [-0.72, -0.8]] as const) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 8), skinMat);
      fl.scale.set(1.55, 0.18, 0.75);
      fl.position.set(fx, -0.12, fz);
      fl.rotation.y = fz > 0 ? -0.35 : 0.35;
      turtle.add(fl);
      flippers.push(fl);
    }
    const tailT = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), skinMat);
    tailT.rotation.z = Math.PI / 2;
    tailT.position.set(-1.28, -0.08, 0);
    turtle.add(tailT);
    g.add(turtle);
    turtle.scale.setScalar(1.5);
    this.swimCircle(turtle, 0, 1.2, -4, 6.2, 0.11, 0, 0.7);
    this.swimmers.push((t) => flippers.forEach((fl, i) => { fl.rotation.x = Math.sin(t * 2.4 + i * 1.6) * 0.55; }));
    // Seahorses bobbing by the kelp
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Group();
      const shMat = this.wetMat(this.fishTexture('#d97706', '#fbbf24', 'bands', 'rgba(120,53,15,0.5)'));
      const bodyS = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12), shMat);
      bodyS.scale.set(0.82, 1.4, 0.82);
      sh.add(bodyS);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), shMat);
      belly.position.set(0.1, -0.12, 0);
      sh.add(belly);
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.44, 8), shMat);
      snout.rotation.z = Math.PI / 2;
      snout.position.set(0.38, 0.36, 0);
      sh.add(snout);
      const headS = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), shMat);
      headS.position.set(0.18, 0.38, 0);
      sh.add(headS);
      this.eyePair(sh, 0.26, 0.42, 0.11, 0.026);
      // Coronet (crown) + dorsal fin that flutters
      for (let ci = 0; ci < 4; ci++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 5), shMat);
        spike.position.set(0.05 + (ci % 2) * 0.09, 0.56, -0.05 + Math.floor(ci / 2) * 0.09);
        sh.add(spike);
      }
      const dorsalS = this.finMesh(0xf59e0b, 0.22, 0.3, 0.7);
      dorsalS.position.set(-0.24, 0.05, 0);
      sh.add(dorsalS);
      this.swimmers.push((t) => { dorsalS.rotation.y = Math.sin(t * 14 + i * 2) * 0.7; });
      const tailS = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), shMat);
      tailS.position.set(-0.12, -0.5, 0);
      sh.add(tailS);
      sh.position.set(-4 + i * 3.6, -1.2 + i * 0.5, -3);
      g.add(sh);
      this.swimmers.push((t) => { sh.position.y = -1.2 + i * 0.5 + Math.sin(t * 1.3 + i * 2) * 0.45; sh.rotation.y = Math.sin(t * 0.6 + i) * 0.5; });
    }
    // Dolphins arcing overhead
    for (let i = 0; i < 2; i++) {
      const d = this.makeDolphin();
      d.scale.setScalar(1.35);
      g.add(d);
      this.swimCircle(d, 0, 4.4, -5, 8, 0.42, i * Math.PI, 1.15);
    }
    g.add(new THREE.PointLight(0x4ade80, 75, 44, 1.6));
    this.addZone(g, y, 0, this.oceanWorld);
  }

  /** Deep Sea (Skills): jellyfish bloom, shark patrol, glowing fish. */
  private buildDeepSea(y: number): void {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const jelly = new THREE.Group();
      const jellyColor = i % 2 ? 0xf0abfc : 0x67e8f9;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 22, 16, 0, Math.PI * 2, 0, Math.PI / 1.75),
        new THREE.MeshPhysicalMaterial({
          color: jellyColor, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.55,
          emissive: jellyColor, emissiveIntensity: 0.55, side: THREE.DoubleSide,
        }));
      jelly.add(dome);
      // Glowing inner organs visible through the bell
      const organs = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xf472b6 : 0x22d3ee, transparent: true, opacity: 0.75 }));
      organs.position.y = 0.12;
      jelly.add(organs);
      // Frilly oral arms in the centre
      for (let j = 0; j < 4; j++) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.03, 1.5, 6),
          this.omat(0xfbcfe8, 0xec4899, 0.6, 0.6));
        const a = (j / 4) * Math.PI * 2;
        arm.position.set(Math.cos(a) * 0.16, -0.85, Math.sin(a) * 0.16);
        arm.name = `tent${j}`;
        jelly.add(arm);
      }
      // Long thin tentacles around the rim
      for (let j = 0; j < 9; j++) {
        const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.006, 2.4, 4),
          this.omat(jellyColor, jellyColor, 0.7, 0.55));
        const a = (j / 9) * Math.PI * 2;
        tent.position.set(Math.cos(a) * 0.62, -1.3, Math.sin(a) * 0.62);
        tent.name = `tent${j + 4}`;
        jelly.add(tent);
      }
      jelly.position.set(-6 + i * 2.4, (i % 3) * 1.4 - 1, -3 - (i % 2) * 2.5);
      g.add(jelly);
      this.swimmers.push((t) => {
        jelly.position.y = ((i % 3) * 1.4 - 1) + Math.sin(t * 0.75 + i * 1.3) * 0.9;
        dome.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.1);
        jelly.children.forEach((c) => { if (c.name.startsWith('tent')) c.rotation.x = Math.sin(t * 1.8 + i + c.position.x * 4) * 0.28; });
      });
    }
    // Shark on patrol
    const shark = this.makeShark();
    shark.scale.setScalar(1.15);
    g.add(shark);
    this.swimCircle(shark, 0, 2.6, -5, 8.6, -0.14, 0, 0.4);
    // Glowing deep fish
    for (let i = 0; i < 8; i++) {
      const f = this.makeFish(i % 2 ? 0x22d3ee : 0xa78bfa, 0.8, i + 2);
      g.add(f);
      this.swimCircle(f, 0, -2.5 + (i % 3), -4, 5 + (i % 4), 0.3, i * 0.8, 0.4);
    }
    g.add(new THREE.PointLight(0xd946ef, 85, 46, 1.6));
    this.addZone(g, y, 0, this.oceanWorld);
  }

  /** Abyss (Projects): whale, manta ray, octopus guarding treasure. */
  private buildAbyss(y: number): void {
    const g = new THREE.Group();
    // Whale crossing the vault
    const whale = this.makeWhale();
    whale.position.set(0, 3.6, -5);
    g.add(whale);
    this.swimmers.push((t) => {
      whale.position.x = Math.sin(t * 0.09) * 9;
      whale.position.y = 3.6 + Math.sin(t * 0.5) * 0.5;
      whale.rotation.y = Math.cos(t * 0.09) > 0 ? 0 : Math.PI;
    });
    this.swimmers.push((t) => {
      const fluke = whale.getObjectByName('fluke');
      if (fluke) fluke.rotation.x = Math.sin(t * 1.6) * 0.45;
      for (const n of ['finL', 'finR']) {
        const fin = whale.getObjectByName(n);
        if (fin) fin.rotation.x = Math.sin(t * 1.2) * 0.25;
      }
    });
    // Manta ray gliding in circles
    const manta = this.makeManta();
    g.add(manta);
    this.swimCircle(manta, 0, 0.4, -4, 6.6, 0.18, 2, 0.8);
    const wing = manta.getObjectByName('wing');
    this.swimmers.push((t) => { if (wing) wing.scale.y = 0.14 + Math.abs(Math.sin(t * 2.2)) * 0.1; manta.rotation.z = Math.sin(t * 2.2) * 0.14; });
    // Octopus on the vault floor — speckled skin, real eyes, curled sucker arms
    const octo = new THREE.Group();
    const octoTex = this.fishTexture('#8b5a8e', '#6d446f', 'spots', 'rgba(255,220,245,0.55)');
    const octoMat = this.wetMat(octoTex);
    const ohead = new THREE.Mesh(new THREE.SphereGeometry(0.95, 22, 16), octoMat);
    ohead.scale.set(1, 1.18, 1);
    ohead.position.y = 0.25;
    octo.add(ohead);
    // Eyes with horizontal pupils (signature octopus feature)
    for (const s of [-1, 1]) {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.wetMat(null, 0xf5e9d5));
      eyeW.position.set(0.55, 0.35, s * 0.72);
      octo.add(eyeW);
      const pupil = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.15), new THREE.MeshBasicMaterial({ color: 0x14060f }));
      pupil.position.set(0.64, 0.35, s * 0.78);
      octo.add(pupil);
    }
    const tents: THREE.Group[] = [];
    const suckerMat = this.wetMat(null, 0xfbcfe8, 0.9);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dirX = Math.cos(a), dirZ = Math.sin(a);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(dirX * 0.55, -0.55, dirZ * 0.55),
        new THREE.Vector3(dirX * 1.25, -1.05, dirZ * 1.25),
        new THREE.Vector3(dirX * 1.8, -1.02, dirZ * 1.8),
        new THREE.Vector3(dirX * 2.05, -0.78, dirZ * 2.05),
      ]);
      const armGroup = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.13, 7), octoMat);
      armGroup.add(arm);
      for (let k = 1; k <= 5; k++) {
        const p = curve.getPoint(k / 5.5);
        const sucker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), suckerMat);
        sucker.position.set(p.x, p.y - 0.1, p.z);
        armGroup.add(sucker);
      }
      octo.add(armGroup);
      tents.push(armGroup);
    }
    octo.position.set(3.4, -4.1, -3.5);
    g.add(octo);
    this.swimmers.push((t) => tents.forEach((tn, i) => { tn.rotation.x = Math.sin(t * 1.7 + i * 0.9) * 0.24; }));
    // Pearl shells (the treasures)
    for (let i = 0; i < 5; i++) {
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10),
        this.omat(0xfef3c7, 0xf59e0b, 0.9));
      pearl.position.set(-5.5 + i * 2.6, -4.9, -2.5 - (i % 2) * 1.6);
      g.add(pearl);
      this.swimmers.push((t) => { pearl.position.y = -4.9 + Math.sin(t * 1.4 + i * 1.7) * 0.16; });
    }
    g.add(new THREE.PointLight(0x60a5fa, 85, 46, 1.6));
    this.addZone(g, y, 0, this.oceanWorld);
  }

  /** Sunlight Exit (Contact): bright surface gate + rising light. */
  private buildSunlightExit(y: number): void {
    const g = new THREE.Group();
    const gate = new THREE.Mesh(new THREE.TorusGeometry(6, 0.2, 16, 90), this.omat(0x7dd3fc, 0x38bdf8, 1.4));
    gate.position.z = -6;
    g.add(gate);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(5.7, 48),
      new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.32, side: THREE.DoubleSide }));
    glow.position.z = -6;
    g.add(glow);
    this.swimmers.push((t) => { glow.material.opacity = 0.26 + Math.sin(t * 2) * 0.07; gate.rotation.z = t * 0.1; });
    for (let i = 0; i < 5; i++) {
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 24, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
      ray.position.set(-5 + i * 2.6, 9, -7);
      ray.rotation.z = 0.18;
      g.add(ray);
    }
    // A farewell school circling the gate
    for (let i = 0; i < 8; i++) {
      const f = this.makeFish(i % 2 ? 0x38bdf8 : 0xfbbf24, 1, i + 3);
      g.add(f);
      this.swimCircle(f, 0, 0, -5, 7.6, 0.3, i * 0.78, 0.5);
    }
    g.add(new THREE.PointLight(0x7dd3fc, 100, 50, 1.5));
    this.addZone(g, y, 0, this.oceanWorld);
  }

  private buildBubbles(): void {
    const count = 420;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = 14 - Math.random() * 182;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 24 - 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const bubbles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xbfefff, size: 0.16, transparent: true, opacity: 0.65, sizeAttenuation: true, depthWrite: false,
    }));
    this.oceanWorld?.add(bubbles);
    this.swimmers.push((t) => {
      bubbles.rotation.y = t * 0.01;
      bubbles.position.y = (t * 0.7) % 9;
    });
  }

  // ── Interaction / loop ─────────────────────────────────────────────────
  private onScroll = (): void => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.targetProgress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  };

  private onResize = (): void => {
    if (!this.renderer || !this.camera) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.applyViewLayout();
    this.onScroll();
  };

  private onPointerDown = (): void => {
    this.pulseT = this.clock.getElapsedTime();
  };

  /** 0..1 interaction burst right after the user clicks/taps. */
  private pulseBoost(t: number): number {
    const age = t - this.pulseT;
    return age >= 0 && age < 1.4 ? Math.sin((age / 1.4) * Math.PI) : 0;
  }

  /** How close the camera is to a depth (for animal alertness). */
  private nearFactor(y: number): number {
    return Math.max(0, 1 - Math.abs(y - this.camYCurrent) / 26);
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
  };

  /** Fog / sun / ambient / lamp tuned per world × time-of-day phase. */
  private applyEnvironment(theme: string, phase: string): void {
    const fogByTheme: Record<string, Record<string, number>> = {
      underground: { dawn: 0x140b06, day: 0x0b0705, dusk: 0x170906, night: 0x040202 },
      ocean: { dawn: 0x0a3a4a, day: 0x075a7d, dusk: 0x082f4e, night: 0x010a18 },
      forest: { dawn: 0x27390f, day: 0x173d20, dusk: 0x1d2b0d, night: 0x020805 },
    };
    const density: Record<string, number> = { underground: 0.0155, ocean: 0.011, forest: 0.0125 };
    const sunColor: Record<string, number> = { dawn: 0xffb37a, day: 0xfff2d4, dusk: 0xff8a5c, night: 0x7aa2ff };
    const sunI: Record<string, number> = { dawn: 0.95, day: 1.45, dusk: 0.8, night: 0.28 };
    const ambI: Record<string, number> = { dawn: 0.55, day: 0.78, dusk: 0.48, night: 0.3 };
    const ambColor: Record<string, number> = { dawn: 0xffd9b0, day: 0xffffff, dusk: 0xffc4a3, night: 0x5f7fd9 };
    // Underground is deep below the sky — phase only whispers down there.
    const phaseWeight = theme === 'underground' ? 0.35 : 1;

    if (this.scene?.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.set(fogByTheme[theme]?.[phase] ?? 0x0b0705);
      this.scene.fog.density = (density[theme] ?? 0.014) * (phase === 'night' ? 1.22 : phase === 'day' ? 0.88 : 1);
    }
    if (this.sunLight) {
      this.sunLight.color.set(theme === 'underground' && phase !== 'day' ? 0xa5b4fc : (sunColor[phase] ?? 0xffffff));
      this.sunLight.intensity = 1.1 + ((sunI[phase] ?? 1) - 1.1) * phaseWeight;
    }
    if (this.ambientLight) {
      this.ambientLight.color.set(ambColor[phase] ?? 0xffffff);
      this.ambientLight.intensity = 0.55 + ((ambI[phase] ?? 0.55) - 0.55) * phaseWeight;
    }
    // Your lamp matters most after dark.
    this.lampMul = phase === 'night' ? 1.35 : phase === 'day' ? 0.72 : 1;
    if (this.headlamp) {
      this.headlamp.color.set(theme === 'ocean' ? 0x7dd3fc : theme === 'forest' ? 0xffe9b8 : 0xffc98a);
    }
  }

  private animate = (): void => {
    if (this.disposed || !this.renderer || !this.scene || !this.camera) return;
    this.raf = requestAnimationFrame(this.animate);
    const t = this.clock.getElapsedTime();

    // Smooth-follow scroll + mouse
    this.progress += (this.targetProgress - this.progress) * 0.055;
    this.mouseX += (this.targetMouseX - this.mouseX) * 0.045;
    this.mouseY += (this.targetMouseY - this.mouseY) * 0.045;

    const camY = JourneyCanvasComponent.SURFACE_Y - this.progress * JourneyCanvasComponent.TRAVEL;
    const sway = Math.sin(this.progress * Math.PI * 3.2) * 3.4;
    this.camera.position.set(
      sway * (this.camZ / 14.5) + this.mouseX * 1.7,
      camY + Math.sin(t * 0.55) * 0.22,
      this.camZ - Math.sin(this.progress * Math.PI) * 2.4,
    );
    this.camera.lookAt(this.mouseX * 2.4, camY - 5.4 + this.mouseY * -0.7, -2);
    if (this.headlamp) {
      const base = (this.themeService.theme() === 'ocean' ? 55 : this.themeService.theme() === 'forest' ? 66 : 74) * this.lampMul;
      this.headlamp.intensity = base + Math.sin(t * 2.1) * 7; // lamp flicker
    }

    // Zones: idle spin + brighten/scale up as the camera approaches
    for (const z of this.zones) {
      z.group.rotation.y += z.spin * 0.005;
      const dist = Math.abs(z.y - camY);
      const near = Math.max(0, 1 - dist / 30);
      const layout = (z.group.userData['layoutScale'] as number | undefined) ?? 1;
      const s = layout * (1 + near * 0.07 + Math.sin(t * 1.4 + z.y) * 0.006);
      z.group.scale.setScalar(s);
    }

    // Theme worlds: show one, animate its inhabitants.
    // Lighting/fog re-tune whenever the world OR the real-world sky changes.
    const theme = this.themeService.theme();
    const phase = this.themeService.phase();
    if (theme !== this.lastTheme || phase !== this.lastPhase) {
      this.lastTheme = theme;
      this.lastPhase = phase;
      if (this.undergroundWorld) this.undergroundWorld.visible = theme === 'underground';
      if (this.oceanWorld) this.oceanWorld.visible = theme === 'ocean';
      if (this.forestWorld) this.forestWorld.visible = theme === 'forest';
      this.applyEnvironment(theme, phase);
    }
    if (theme === 'ocean') {
      for (const swim of this.swimmers) swim(t);
    }
    if (theme === 'forest') {
      for (const act of this.wildlife) act(t);
    }
    this.camYCurrent = camY;

    // Ambient particle drift
    if (this.dust) {
      this.dust.rotation.y = t * 0.014;
      this.dust.position.y = Math.sin(t * 0.24) * 0.8;
    }
    if (this.embers) {
      this.embers.rotation.y = -t * 0.03;
      this.embers.position.y = (t * 0.55) % 7;
    }
    if (this.surfacePortal) this.surfacePortal.rotation.z = t * 0.12;
    if (this.exitGlow) {
      this.exitGlow.material.opacity = 0.22 + Math.sin(t * 2.3) * 0.08;
      const s = 1 + Math.sin(t * 2.3) * 0.03;
      this.exitGlow.scale.setScalar(s);
    }

    // Expose journey state for HUD/CSS (depth gauge, gates)
    const root = document.documentElement;
    root.style.setProperty('--journey', this.progress.toFixed(4));
    root.style.setProperty('--depth-m', String(Math.round(this.progress * 1500)));

    this.renderer.render(this.scene, this.camera);
  };
}
