import { Component } from '@angular/core';
import { NavbarComponent } from './components/navbar/navbar.component';
import { HeroComponent } from './components/hero/hero.component';
import { AboutComponent } from './components/about/about.component';
import { ExperienceComponent } from './components/experience/experience.component';
import { SkillsComponent } from './components/skills/skills.component';
import { ProjectsComponent } from './components/projects/projects.component';
import { ContactComponent } from './components/contact/contact.component';
import { FooterComponent } from './components/footer/footer.component';
import { JourneyCanvasComponent } from './components/journey/journey-canvas.component';
import { JourneyHudComponent } from './components/journey/journey-hud.component';
import { ThemeService } from './services/theme.service';
import { inject } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    NavbarComponent,
    HeroComponent,
    AboutComponent,
    ExperienceComponent,
    SkillsComponent,
    ProjectsComponent,
    ContactComponent,
    FooterComponent,
    JourneyCanvasComponent,
    JourneyHudComponent,
  ],
  template: `
    <app-journey-canvas />
    <div class="ambient-bg" aria-hidden="true">
      <div class="ambient-blob ambient-blob-1"></div>
      <div class="ambient-blob ambient-blob-2"></div>
      <div class="ambient-blob ambient-blob-3"></div>
      <div class="ambient-grid"></div>
    </div>
    <app-navbar />
    <app-journey-hud />
    <main class="journey-main">
      <app-hero />

      <div class="chapter-gate" aria-hidden="true">
        <span class="gate-line"></span>
        <span class="gate-label">{{ themeService.theme() === 'ocean' ? '🪸 Diving · 300m — entering the Coral Reef' : '⛏ Descending · 300m — entering the Scanner Core' }}</span>
        <span class="gate-chevrons"><i></i><i></i><i></i></span>
      </div>
      <app-about />

      <div class="chapter-gate" aria-hidden="true">
        <span class="gate-line"></span>
        <span class="gate-label">{{ themeService.theme() === 'ocean' ? '🌿 Diving · 600m — entering the Kelp Forest' : '🕰️ Descending · 600m — entering the Timeline Cavern' }}</span>
        <span class="gate-chevrons"><i></i><i></i><i></i></span>
      </div>
      <app-experience />

      <div class="chapter-gate" aria-hidden="true">
        <span class="gate-line"></span>
        <span class="gate-label">{{ themeService.theme() === 'ocean' ? '🪼 Diving · 900m — entering the Deep Sea' : '💎 Descending · 900m — entering the Crystal Cave' }}</span>
        <span class="gate-chevrons"><i></i><i></i><i></i></span>
      </div>
      <app-skills />

      <div class="chapter-gate" aria-hidden="true">
        <span class="gate-line"></span>
        <span class="gate-label">{{ themeService.theme() === 'ocean' ? '🐋 Diving · 1200m — entering the Abyss' : '🏺 Descending · 1200m — entering the Artifact Vault' }}</span>
        <span class="gate-chevrons"><i></i><i></i><i></i></span>
      </div>
      <app-projects />

      <div class="chapter-gate gate-exit" aria-hidden="true">
        <span class="gate-line"></span>
        <span class="gate-label">{{ themeService.theme() === 'ocean' ? '☀️ 1500m — the Sunlight Exit · back to the surface' : '🚪 1500m — the Exit Portal · return to the surface' }}</span>
        <span class="gate-chevrons gate-up"><i></i><i></i><i></i></span>
      </div>
      <app-contact />
    </main>
    <app-footer />
  `,
  styles: `
    :host { display: block; }
    .journey-main { position: relative; z-index: 1; }
    .chapter-gate {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 34px 16px 6px;
      text-align: center;
    }
    .gate-line {
      width: min(420px, 70vw); height: 1px;
      background: linear-gradient(90deg, transparent, rgba(129,140,248,0.65), rgba(34,211,238,0.65), transparent);
    }
    .gate-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #a5b4fc;
      text-shadow: 0 2px 14px rgba(0,0,0,0.9);
    }
    .gate-exit .gate-label { color: #fcd34d; }
    .gate-chevrons { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .gate-chevrons i {
      width: 9px; height: 9px; display: block;
      border-right: 2px solid rgba(129,140,248,0.8); border-bottom: 2px solid rgba(129,140,248,0.8);
      transform: rotate(45deg);
      animation: gateChevron 1.8s ease-in-out infinite;
    }
    .gate-chevrons i:nth-child(2) { animation-delay: 0.18s; }
    .gate-chevrons i:nth-child(3) { animation-delay: 0.36s; }
    .gate-up i { transform: rotate(225deg); border-color: rgba(252,211,77,0.85); }
    @keyframes gateChevron {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 1; }
    }
  `,
})
export class AppComponent {
  readonly themeService = inject(ThemeService);
}
