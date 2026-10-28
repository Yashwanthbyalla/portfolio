import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { ThemeService } from '../../services/theme.service';

interface Chapter {
  id: string;
  depth: string;
  label: string;
  icon: string;
}

/**
 * Journey HUD — fixed depth gauge + chapter tracker for the underground story.
 * Desktop: vertical rail (left). Mobile: slim bottom progress + chapter label.
 */
@Component({
  selector: 'app-journey-hud',
  standalone: true,
  template: `
    <!-- Desktop rail -->
    <aside class="hud-rail" aria-label="Journey progress">
      <p class="hud-depth"><span>{{ depth() }}</span>m</p>
      <div class="hud-track">
        <div class="hud-fill" [style.height.%]="percent()"></div>
        @for (c of chapters(); track c.id) {
          <a class="hud-dot" [class.on]="active() === c.id" [href]="'#' + c.id"
             [attr.aria-label]="c.label" [title]="c.label">
            <span class="hud-dot-icon">{{ c.icon }}</span>
            <span class="hud-dot-label">{{ c.depth }} · {{ c.label }}</span>
          </a>
        }
      </div>
      <p class="hud-chapter">{{ activeChapter().icon }} {{ activeChapter().label }}</p>
    </aside>

    <!-- Mobile bar -->
    <div class="hud-mobile" aria-hidden="true">
      <span>{{ activeChapter().icon }} {{ activeChapter().label }}</span>
      <span class="hud-mobile-depth">{{ depth() }}m</span>
      <div class="hud-mobile-track"><div class="hud-mobile-fill" [style.width.%]="percent()"></div></div>
    </div>
  `,
  styles: `
    .hud-rail {
      position: fixed; left: 18px; top: 50%; transform: translateY(-50%);
      z-index: 40; display: none; flex-direction: column; align-items: center; gap: 12px;
      padding: 16px 10px; border-radius: 20px;
      background: rgba(10,11,20,0.55); border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    }
    @media (min-width: 1440px) { .hud-rail { display: flex; } }
    .hud-depth { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #a5b4fc; text-align: center; line-height: 1.2; }
    .hud-depth span { display: block; font-size: 17px; font-weight: 700; color: #fff; }
    .hud-track { position: relative; width: 2px; height: 220px; background: rgba(255,255,255,0.12); border-radius: 2px; }
    .hud-fill {
      position: absolute; top: 0; left: 0; width: 100%; border-radius: 2px;
      background: linear-gradient(to bottom, #6366f1, #22d3ee, #fbbf24);
      box-shadow: 0 0 8px rgba(99,102,241,0.7); transition: height 0.15s linear;
    }
    .hud-dot {
      position: absolute; left: 50%; transform: translate(-50%, -50%);
      width: 26px; height: 26px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: #13142a; border: 1px solid rgba(255,255,255,0.18);
      font-size: 11px; text-decoration: none; transition: all 0.3s ease;
    }
    .hud-dot:nth-of-type(1) { top: 0%; } .hud-dot:nth-of-type(2) { top: 20%; }
    .hud-dot:nth-of-type(3) { top: 40%; } .hud-dot:nth-of-type(4) { top: 60%; }
    .hud-dot:nth-of-type(5) { top: 80%; } .hud-dot:nth-of-type(6) { top: 100%; }
    .hud-dot:hover { border-color: rgba(129,140,248,0.7); transform: translate(-50%,-50%) scale(1.18); }
    .hud-dot.on {
      background: rgba(99,102,241,0.35); border-color: #818cf8;
      box-shadow: 0 0 14px rgba(99,102,241,0.75); transform: translate(-50%,-50%) scale(1.22);
    }
    .hud-dot-label {
      position: absolute; left: 34px; top: 50%; transform: translateY(-50%) translateX(-4px);
      white-space: nowrap; font-size: 11px; font-weight: 600; color: #e0e7ff;
      background: rgba(10,11,20,0.88); border: 1px solid rgba(255,255,255,0.1);
      padding: 4px 9px; border-radius: 8px; opacity: 0; pointer-events: none; transition: all 0.25s ease;
    }
    .hud-dot:hover .hud-dot-label { opacity: 1; transform: translateY(-50%) translateX(0); }
    .hud-chapter { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #c7d2fe; text-align: center; max-width: 74px; line-height: 1.5; }

    .hud-mobile {
      position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 40;
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px 13px; border-radius: 14px; font-size: 11px; font-weight: 600; color: #e0e7ff;
      background: rgba(10,11,20,0.72); border: 1px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    }
    @media (min-width: 1440px) { .hud-mobile { display: none; } }
    @media (max-width: 639.98px) {
      .hud-mobile { left: 8px; right: 8px; bottom: 8px; font-size: 10px; padding: 8px 11px 12px; border-radius: 12px; }
    }
    .hud-mobile-depth { margin-left: auto; font-family: 'JetBrains Mono', monospace; color: #a5b4fc; }
    .hud-mobile-track { position: absolute; left: 14px; right: 14px; bottom: 6px; height: 3px; border-radius: 3px; background: rgba(255,255,255,0.12); overflow: hidden; }
    .hud-mobile-fill { height: 100%; background: linear-gradient(90deg, #6366f1, #22d3ee, #fbbf24); transition: width 0.15s linear; }
  `,
})
export class JourneyHudComponent {
  private readonly themeService = inject(ThemeService);

  readonly chapters = computed<Chapter[]>(() =>
    this.themeService.theme() === 'forest'
      ? [
          { id: 'home', depth: '0m', label: 'Canopy Gate', icon: '🌲' },
          { id: 'about', depth: '300m', label: 'Meadow Clearing', icon: '🦌' },
          { id: 'experience', depth: '600m', label: 'Elephant Grove', icon: '🐘' },
          { id: 'skills', depth: '900m', label: 'Predator Territory', icon: '🐅' },
          { id: 'projects', depth: '1200m', label: 'Nocturnal Ruins', icon: '🦉' },
          { id: 'contact', depth: '1500m', label: 'Sunrise Clearing', icon: '🌅' },
        ]
      : this.themeService.theme() === 'ocean'
      ? [
          { id: 'home', depth: '0m', label: 'The Surface', icon: '🌊' },
          { id: 'about', depth: '300m', label: 'Coral Reef', icon: '🪸' },
          { id: 'experience', depth: '600m', label: 'Kelp Forest', icon: '🌿' },
          { id: 'skills', depth: '900m', label: 'Deep Sea', icon: '🪼' },
          { id: 'projects', depth: '1200m', label: 'The Abyss', icon: '🐋' },
          { id: 'contact', depth: '1500m', label: 'Sunlight Exit', icon: '☀️' },
        ]
      : [
          { id: 'home', depth: '0m', label: 'The Surface', icon: '🌅' },
          { id: 'about', depth: '300m', label: 'Scanner Core', icon: '🛰️' },
          { id: 'experience', depth: '600m', label: 'Timeline Cavern', icon: '🕰️' },
          { id: 'skills', depth: '900m', label: 'Crystal Cave', icon: '💎' },
          { id: 'projects', depth: '1200m', label: 'Artifact Vault', icon: '🏺' },
          { id: 'contact', depth: '1500m', label: 'Exit Portal', icon: '🚪' },
        ],
  );

  active = signal('home');
  percent = signal(0);
  depth = signal(0);

  activeChapter(): Chapter {
    return this.chapters().find((c) => c.id === this.active()) ?? this.chapters()[0];
  }

  @HostListener('window:scroll')
  onScroll(): void {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    this.percent.set(Math.round(p * 100));
    this.depth.set(Math.round(p * 1500));
    for (const c of [...this.chapters()].reverse()) {
      const el = document.getElementById(c.id);
      if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.45) {
        this.active.set(c.id);
        return;
      }
    }
    this.active.set('home');
  }
}
