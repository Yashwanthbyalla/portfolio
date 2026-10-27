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
  private readonly swimmers: ((t: number) => void)[] = [];
  private lastTheme = '';

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

    // Lights
    this.scene.add(new THREE.AmbientLight(0x8899ff, 0.55));
    const sun = new THREE.DirectionalLight(0xa5b4fc, 1.1);
    sun.position.set(6, 20, 8);
    this.scene.add(sun);
    this.headlamp = new THREE.PointLight(0x818cf8, 60, 46, 1.6);
    this.camera.add(this.headlamp);

    this.undergroundWorld = new THREE.Group();
    this.oceanWorld = new THREE.Group();
    this.scene.add(this.undergroundWorld, this.oceanWorld);

    this.buildSurface();
    this.buildShaft();
    this.buildScannerCore(-38);
    this.buildTimelineCavern(-68);
    this.buildCrystalCave(-98);
    this.buildArtifactVault(-128);
    this.buildExitPortal(-158);
    this.buildParticles(reduced);
    this.buildOcean();
    this.applyViewLayout();

    this.onScroll();
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });

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
      this.surfacePortal.position.set(px, py, -15);
      this.surfaceRing.position.set(px, py, -15);
      this.surfacePortal.scale.setScalar(ps);
      this.surfaceRing.scale.setScalar(ps);
    }
  }

  // ── Chapters ───────────────────────────────────────────────────────────
  /** Chapter 0 — the Surface: portal gate + floating shards above ground. */
  private buildSurface(): void {
    const g = new THREE.Group();
    const portal = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.1, 16, 90), this.mat(0x6366f1, 0x6366f1, 1.1));
    portal.position.set(6.5, 4.2, -15);
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
    // Ground disc the hero stands on
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(16, 48),
      new THREE.MeshStandardMaterial({ color: 0x0d0e22, roughness: 0.9, metalness: 0.2, transparent: true, opacity: 0.85 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.4;
    g.add(ground);
    const grid = new THREE.PolarGridHelper(16, 12, 6, 48, 0x6366f1, 0x1e1b4b);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.32;
    grid.position.y = -1.35;
    g.add(grid);
    this.addZone(g, 0, 0.12);
  }

  /** The Descent Shaft: strata walls + guidance rings the camera falls past. */
  private buildShaft(): void {
    const g = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(10.5, 0.055, 8, 64);
    const strataColors = [0x6366f1, 0x0ea5e9, 0x8b5cf6, 0x334155, 0x4f46e5, 0x155e75];
    for (let i = 0; i < 30; i++) {
      const y = -6 - i * 5.6;
      const ring = new THREE.Mesh(ringGeo, this.mat(strataColors[i % strataColors.length], strataColors[i % strataColors.length], 0.55));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
      // rock strata slabs jutting from the walls
      for (let j = 0; j < 3; j++) {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(3.4 + ((i + j) % 3), 0.9, 2.1),
          this.mat(0x171833, strataColors[(i + j) % strataColors.length], 0.18),
        );
        const side = (i + j) % 2 === 0 ? -1 : 1;
        slab.position.set(side * (14 + ((i * j) % 3)), y - 2.2, -10 + ((i * 2 + j * 3) % 7));
        slab.rotation.y = side * 0.35;
        g.add(slab);
      }
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
    this.addZone(g, y, 0.06);
  }

  /** Chapter 4 — Crystal Cave (Skills): emissive crystal cluster. */
  private buildCrystalCave(y: number): void {
    const g = new THREE.Group();
    const colors = [0x22d3ee, 0x818cf8, 0xa78bfa, 0x67e8f9];
    const geo = new THREE.ConeGeometry(0.6, 3.1, 6);
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Mesh(geo, this.mat(colors[i % colors.length], colors[i % colors.length], 0.85 + (i % 3) * 0.25));
      const a = (i / 26) * Math.PI * 2;
      const r = 3.6 + (i % 5) * 1.25;
      c.position.set(Math.cos(a) * r, -4.2 + (i % 4) * 0.4, Math.sin(a) * r - 2);
      c.rotation.set(((i % 5) - 2) * 0.1, i, ((i % 3) - 1) * 0.14);
      c.scale.setScalar(0.65 + ((i * 7) % 10) / 9);
      g.add(c);
    }
    g.add(new THREE.PointLight(0x22d3ee, 95, 46, 1.6));
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

  /** A stylised fish: body + wagging tail, as one group. */
  private makeFish(color: number, size = 1): THREE.Group {
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), this.omat(color, color, 0.5));
    body.scale.set(1.9, 0.85, 0.55);
    fish.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 4), this.omat(color, color, 0.6));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.78;
    tail.name = 'tail';
    fish.add(tail);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 4), this.omat(color, color, 0.5));
    fin.position.set(0, 0.3, 0);
    fish.add(fin);
    fish.scale.setScalar(size);
    return fish;
  }

  /** Register a circular swimmer (fish/shark/dolphin share this motion). */
  private swimCircle(obj: THREE.Object3D, cx: number, cy: number, cz: number, r: number, speed: number, phase: number, wobble = 0.5): void {
    this.swimmers.push((t) => {
      const a = t * speed + phase;
      obj.position.set(cx + Math.cos(a) * r, cy + Math.sin(t * 1.7 + phase) * wobble, cz + Math.sin(a) * r);
      obj.rotation.y = -a - Math.PI / 2 + (speed < 0 ? Math.PI : 0);
      obj.rotation.z = Math.sin(t * 6 + phase) * 0.08;
      const tail = obj.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 10 + phase) * 0.55;
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
      const f = this.makeFish(colors[i % colors.length], 0.9 + (i % 3) * 0.25);
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
    // Crab scuttling sideways
    const crab = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), this.omat(0xef4444, 0xb91c1c, 0.5));
    shell.scale.set(1.3, 0.55, 1);
    crab.add(shell);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), this.omat(0xf87171, 0xef4444, 0.5));
      claw.position.set(s * 0.85, 0.05, 0.4);
      crab.add(claw);
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
      const f = this.makeFish(colors[i % colors.length], 0.75 + (i % 3) * 0.2);
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
    // Turtle paddling through
    const turtle = new THREE.Group();
    const shellT = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), this.omat(0x65a30d, 0x3f6212, 0.45));
    shellT.scale.set(1.25, 0.55, 1.05);
    turtle.add(shellT);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), this.omat(0x84cc16, 0x4d7c0f, 0.4));
    head.position.set(1.25, 0.05, 0);
    turtle.add(head);
    const flippers: THREE.Mesh[] = [];
    for (const [fx, fz] of [[0.7, 0.85], [0.7, -0.85], [-0.7, 0.8], [-0.7, -0.8]] as const) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), this.omat(0x84cc16, 0x4d7c0f, 0.4));
      fl.scale.set(1.3, 0.25, 0.7);
      fl.position.set(fx, -0.1, fz);
      turtle.add(fl);
      flippers.push(fl);
    }
    g.add(turtle);
    this.swimCircle(turtle, 0, 1.2, -4, 6.2, 0.11, 0, 0.7);
    this.swimmers.push((t) => flippers.forEach((fl, i) => { fl.rotation.x = Math.sin(t * 2.4 + i * 1.6) * 0.55; }));
    // Seahorses bobbing by the kelp
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Group();
      const bodyS = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), this.omat(0xfbbf24, 0xd97706, 0.55));
      bodyS.scale.set(0.8, 1.35, 0.8);
      sh.add(bodyS);
      const snout = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 6), this.omat(0xf59e0b, 0xd97706, 0.5));
      snout.rotation.z = -Math.PI / 2;
      snout.position.set(0.36, 0.34, 0);
      sh.add(snout);
      const tailS = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 14), this.omat(0xf59e0b, 0xd97706, 0.5));
      tailS.position.set(-0.12, -0.48, 0);
      sh.add(tailS);
      sh.position.set(-4 + i * 3.6, -1.2 + i * 0.5, -3);
      g.add(sh);
      this.swimmers.push((t) => { sh.position.y = -1.2 + i * 0.5 + Math.sin(t * 1.3 + i * 2) * 0.45; sh.rotation.y = Math.sin(t * 0.6 + i) * 0.5; });
    }
    // Dolphins arcing overhead
    for (let i = 0; i < 2; i++) {
      const d = this.makeFish(0x7dd3fc, 2.5);
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
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.8),
        this.omat(i % 2 ? 0xf0abfc : 0x67e8f9, i % 2 ? 0xd946ef : 0x06b6d4, 0.95, 0.62));
      jelly.add(dome);
      for (let j = 0; j < 5; j++) {
        const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.015, 1.9, 5),
          this.omat(0xf0abfc, 0xd946ef, 0.7, 0.65));
        const a = (j / 5) * Math.PI * 2;
        tent.position.set(Math.cos(a) * 0.42, -1.05, Math.sin(a) * 0.42);
        tent.name = `tent${j}`;
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
    const shark = new THREE.Group();
    const sbody = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.omat(0x94a3b8, 0x475569, 0.35));
    sbody.scale.set(3.1, 0.95, 0.85);
    shark.add(sbody);
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 4), this.omat(0x64748b, 0x475569, 0.35));
    dorsal.position.set(-0.2, 0.95, 0);
    shark.add(dorsal);
    const stail = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.15, 4), this.omat(0x64748b, 0x475569, 0.35));
    stail.rotation.z = Math.PI / 2;
    stail.position.x = -3.3;
    stail.name = 'tail';
    shark.add(stail);
    g.add(shark);
    this.swimCircle(shark, 0, 2.6, -5, 8.6, -0.14, 0, 0.4);
    // Glowing deep fish
    for (let i = 0; i < 8; i++) {
      const f = this.makeFish(i % 2 ? 0x22d3ee : 0xa78bfa, 0.8);
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
    const whale = new THREE.Group();
    const wbody = new THREE.Mesh(new THREE.SphereGeometry(1.6, 18, 14), this.omat(0x60a5fa, 0x1d4ed8, 0.35));
    wbody.scale.set(2.9, 1.05, 1);
    whale.add(wbody);
    const wtail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.7, 4), this.omat(0x3b82f6, 0x1d4ed8, 0.35));
    wtail.rotation.z = Math.PI / 2;
    wtail.position.x = -5.1;
    wtail.name = 'tail';
    whale.add(wtail);
    whale.position.y = 3.6;
    g.add(whale);
    this.swimmers.push((t) => {
      whale.position.x = Math.sin(t * 0.09) * 9;
      whale.position.y = 3.6 + Math.sin(t * 0.5) * 0.5;
      whale.rotation.y = Math.cos(t * 0.09) > 0 ? 0 : Math.PI;
      const tail = whale.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 1.6) * 0.4;
    });
    // Manta ray gliding in circles
    const manta = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.OctahedronGeometry(1.8), this.omat(0x818cf8, 0x4f46e5, 0.5));
    wing.scale.set(1.9, 0.16, 1.05);
    manta.add(wing);
    const mtail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 2.6, 5), this.omat(0x6366f1, 0x4338ca, 0.5));
    mtail.rotation.z = Math.PI / 2;
    mtail.position.x = -2.9;
    manta.add(mtail);
    g.add(manta);
    this.swimCircle(manta, 0, 0.4, -4, 6.6, 0.18, 2, 0.8);
    this.swimmers.push((t) => { wing.scale.y = 0.16 + Math.abs(Math.sin(t * 2.2)) * 0.13; manta.rotation.z = Math.sin(t * 2.2) * 0.16; });
    // Octopus on the vault floor
    const octo = new THREE.Group();
    const ohead = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 12), this.omat(0xc084fc, 0x7e22ce, 0.55));
    ohead.scale.set(1, 1.15, 1);
    octo.add(ohead);
    const tents: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.7, 6), this.omat(0xa855f7, 0x7e22ce, 0.5));
      tent.position.set(Math.cos(a) * 0.85, -0.95, Math.sin(a) * 0.85);
      tent.rotation.set(Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7 + Math.PI);
      octo.add(tent);
      tents.push(tent);
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
      const f = this.makeFish(i % 2 ? 0x38bdf8 : 0xfbbf24, 1);
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

  private onMouseMove = (e: MouseEvent): void => {
    this.targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
    this.targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
  };

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
    if (this.headlamp) this.headlamp.intensity = 55 + Math.sin(t * 2.1) * 7;

    // Zones: idle spin + brighten/scale up as the camera approaches
    for (const z of this.zones) {
      z.group.rotation.y += z.spin * 0.005;
      const dist = Math.abs(z.y - camY);
      const near = Math.max(0, 1 - dist / 30);
      const layout = (z.group.userData['layoutScale'] as number | undefined) ?? 1;
      const s = layout * (1 + near * 0.07 + Math.sin(t * 1.4 + z.y) * 0.006);
      z.group.scale.setScalar(s);
    }

    // Theme worlds: show one, animate its inhabitants
    const theme = this.themeService.theme();
    if (theme !== this.lastTheme) {
      this.lastTheme = theme;
      const ocean = theme === 'ocean';
      if (this.undergroundWorld) this.undergroundWorld.visible = !ocean;
      if (this.oceanWorld) this.oceanWorld.visible = ocean;
      if (this.scene?.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.set(ocean ? 0x03263d : 0x05050d);
        this.scene.fog.density = ocean ? 0.011 : 0.0145;
      }
      if (this.headlamp) this.headlamp.color.set(ocean ? 0x7dd3fc : 0x818cf8);
    }
    if (theme === 'ocean') {
      for (const swim of this.swimmers) swim(t);
    }

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
