import { Component, HostListener, inject } from '@angular/core';
import { PHASE_META, THEME_META, ThemeService, type AppTheme } from '../../services/theme.service';
import { AmbientAudioService } from '../../services/ambient-audio.service';

/** World-map picker: choose a world, preview its chapters, sound + sky state. */
@Component({
  selector: 'app-theme-hub',
  standalone: true,
  template: `
    @if (themeService.hubOpen()) {
      <div class="hub-backdrop" (click)="close()">
        <section class="hub-panel" role="dialog" aria-modal="true" aria-label="Choose your world"
                 (click)="$event.stopPropagation()">
          <header class="hub-head">
            <div>
              <p class="hub-eyebrow">🗺️ World Map</p>
              <h2>Choose your world</h2>
              <p class="hub-sub">Every world retells the same journey — new land, new inhabitants, new sounds.
                It is currently <strong>{{ phaseMeta.icon }} {{ phaseMeta.label }}</strong> where you are, and every world knows it.</p>
            </div>
            <button type="button" class="hub-close" (click)="close()" aria-label="Close world map">✕</button>
          </header>

          <div class="hub-grid">
            @for (w of worlds; track w.id) {
              <article class="world-card world-{{ w.id }}" [class.current]="themeService.theme() === w.id">
                <div class="world-banner"><span class="world-icon">{{ w.meta.icon }}</span></div>
                <h3>{{ w.meta.label }} @if (themeService.theme() === w.id) { <span class="here">● You are here</span> }</h3>
                <p class="world-tag">{{ w.meta.tagline }}</p>
                <ol class="world-chapters">
                  @for (c of w.meta.chapters; track c) { <li>{{ c }}</li> }
                </ol>
                <button type="button" class="btn world-enter" [disabled]="themeService.theme() === w.id"
                        (click)="enter(w.id)">
                  {{ themeService.theme() === w.id ? 'Exploring now…' : 'Enter the ' + w.meta.label + ' →' }}
                </button>
              </article>
            }
          </div>

          <footer class="hub-foot">
            <button type="button" class="hub-sound" (click)="audio.toggle()" [attr.aria-pressed]="audio.enabled()">
              {{ audio.enabled() ? '🔊 Ambient sound: On' : '🔇 Ambient sound: Off' }}
              <small>{{ audio.enabled() ? 'Tap to mute' : soundHint }}</small>
            </button>
            <p class="hub-phase">{{ phaseMeta.icon }} Auto day/night is on — lighting, fog, critters and sound follow your local time ({{ phaseMeta.label }} now).</p>
          </footer>
        </section>
      </div>
    }
  `,
  styles: `
    :host { display: contents; }
    .hub-backdrop {
      position: fixed; inset: 0; z-index: 90; display: flex; align-items: flex-start; justify-content: center;
      /* Sit clearly below the fixed navbar (~72px) — never clipped at the top */
      padding: 88px 18px 20px; background: rgba(2,4,10,0.72); backdrop-filter: blur(10px);
      animation: hubFade 0.25s ease; overflow-y: auto;
    }
    @media (max-width: 640px) { .hub-backdrop { padding: 78px 10px 14px; } }
    .hub-panel {
      width: min(980px, 100%); max-height: calc(100dvh - 112px); overflow: auto; border-radius: 24px; padding: 26px;
      scrollbar-width: thin;
      background: linear-gradient(160deg, rgba(18,20,38,0.97), rgba(6,8,16,0.97));
      border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 30px 80px rgba(0,0,0,0.6);
      animation: hubRise 0.3s cubic-bezier(.2,.9,.3,1.2);
    }
    .hub-head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .hub-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #a5b4fc; margin: 0 0 6px; }
    .hub-head h2 { margin: 0; font-size: clamp(24px, 4vw, 34px); color: #fff; }
    .hub-sub { color: #aab; max-width: 620px; line-height: 1.6; margin: 8px 0 0; font-size: 14px; }
    .hub-close { width: 38px; height: 38px; flex: none; border-radius: 50%; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); color: #fff; cursor: pointer; }
    .hub-close:hover { background: rgba(255,255,255,0.14); transform: rotate(90deg); }
    .hub-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
    @media (min-width: 760px) { .hub-grid { grid-template-columns: repeat(3, 1fr); } }
    .world-card { border-radius: 18px; padding: 18px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 10px; transition: transform .25s ease, border-color .25s ease; }
    .world-card:hover { transform: translateY(-4px); }
    .world-card.current { border-color: rgba(255,255,255,0.45); box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 14px 34px rgba(0,0,0,0.4); }
    .world-banner { height: 86px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    .world-underground .world-banner { background: radial-gradient(circle at 50% 120%, #f59e0b55, transparent 65%), linear-gradient(160deg,#1e1b4b,#090914); }
    .world-ocean .world-banner { background: radial-gradient(circle at 50% -20%, #7dd3fc66, transparent 60%), linear-gradient(160deg,#075985,#02182b); }
    .world-forest .world-banner { background: radial-gradient(circle at 50% -20%, #fde68a55, transparent 55%), linear-gradient(160deg,#166534,#04170b); }
    .world-icon { font-size: 42px; animation: hubBob 3s ease-in-out infinite; }
    .world-card h3 { margin: 0; color: #fff; font-size: 19px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .here { font-size: 11px; color: #86efac; letter-spacing: .04em; }
    .world-tag { color: #aab; font-size: 13px; line-height: 1.55; margin: 0; }
    .world-chapters { margin: 0; padding-left: 18px; color: #cbd5e1; font-size: 12.5px; line-height: 1.9; flex: 1; }
    .world-enter { justify-content: center; width: 100%; }
    .world-underground .world-enter { background: linear-gradient(90deg,#4f46e5,#7c3aed); color: #fff; }
    .world-ocean .world-enter { background: linear-gradient(90deg,#0369a1,#0891b2); color: #fff; }
    .world-forest .world-enter { background: linear-gradient(90deg,#15803d,#65a30d); color: #fff; }
    .world-enter:disabled { opacity: .55; cursor: default; }
    .hub-foot { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.09); }
    .hub-sound { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.05); color: #fff; font-weight: 700; cursor: pointer; }
    .hub-sound small { font-weight: 500; color: #9aa; }
    .hub-phase { color: #9aa; font-size: 12.5px; max-width: 480px; margin: 0; line-height: 1.6; }
    @keyframes hubFade { from { opacity: 0; } }
    @keyframes hubRise { from { opacity: 0; transform: translateY(16px) scale(.98); } }
    @keyframes hubBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
  `,
})
export class ThemeHubComponent {
  readonly themeService = inject(ThemeService);
  readonly audio = inject(AmbientAudioService);
  readonly worlds: { id: AppTheme; meta: (typeof THEME_META)[AppTheme] }[] = (
    Object.keys(THEME_META) as AppTheme[]
  ).map((id) => ({ id, meta: THEME_META[id] }));

  get phaseMeta() { return PHASE_META[this.themeService.phase()]; }
  get soundHint(): string {
    return { underground: 'Ambient music with soft echoing cave drips', ocean: 'Ambient music with gentle waves, whale & dolphin', forest: this.themeService.isNight() ? 'Ambient music with crickets & a distant owl' : 'Ambient music with gentle birdsong' }[this.themeService.theme()];
  }

  show(): void { this.themeService.openHub(); }
  close(): void { this.themeService.closeHub(); }

  enter(theme: AppTheme): void {
    this.themeService.set(theme);
    this.close();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  @HostListener('window:keydown.escape')
  onEscape(): void { if (this.themeService.hubOpen()) this.close(); }
}
