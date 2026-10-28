import { Injectable, computed, signal } from '@angular/core';

export type AppTheme = 'underground' | 'ocean' | 'forest';
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

const STORAGE_KEY = 'portfolio-theme';

export const THEME_META: Record<AppTheme, { icon: string; label: string; tagline: string; chapters: string[]; accent: string }> = {
  underground: {
    icon: '🌌', label: 'Mine', tagline: 'Descend 1,500m through the underground journey',
    chapters: ['The Surface', 'Scanner Core', 'Timeline Cavern', 'Crystal Cave', 'Artifact Vault', 'Exit Portal'], accent: '#818cf8',
  },
  ocean: {
    icon: '🌊', label: 'Ocean', tagline: 'Dive from sunlit surface to the glowing abyss',
    chapters: ['The Surface', 'Coral Reef', 'Kelp Forest', 'Deep Sea', 'The Abyss', 'Sunlight Exit'], accent: '#22d3ee',
  },
  forest: {
    icon: '🌲', label: 'Forest', tagline: 'Trek wild territories — the animals are watching you',
    chapters: ['Canopy Gate', 'Meadow Clearing', 'Elephant Grove', 'Predator Territory', 'Nocturnal Ruins', 'Sunrise Clearing'], accent: '#4ade80',
  },
};

export function phaseForHour(hour: number): DayPhase {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export const PHASE_META: Record<DayPhase, { icon: string; label: string }> = {
  dawn: { icon: '🌅', label: 'Dawn' },
  day: { icon: '☀️', label: 'Day' },
  dusk: { icon: '🌇', label: 'Dusk' },
  night: { icon: '🌙', label: 'Night' },
};

/** Global theme + auto day/night phase. Persisted + mirrored to <html data-theme data-dayphase>. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>('underground');
  /** World-map hub visibility — shared so any component can open it. */
  readonly hubOpen = signal(false);
  readonly phase = signal<DayPhase>(phaseForHour(new Date().getHours()));
  readonly isNight = computed(() => this.phase() === 'night');
  readonly meta = computed(() => THEME_META[this.theme()]);
  private phaseTimer?: ReturnType<typeof setInterval>;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'ocean' || saved === 'underground' || saved === 'forest') this.theme.set(saved);
      this.applyPhase();
      document.documentElement.dataset['theme'] = this.theme();
      // Re-evaluate the sky every minute so the world drifts with real time.
      this.phaseTimer = setInterval(() => this.applyPhase(), 60_000);
    }
  }

  private applyPhase(): void {
    const p = phaseForHour(new Date().getHours());
    if (p !== this.phase()) this.phase.set(p);
    document.documentElement.dataset['dayphase'] = p;
  }

  /** For testing / previewing a phase without waiting for the clock. */
  setPhase(p: DayPhase): void {
    this.phase.set(p);
    if (typeof document !== 'undefined') document.documentElement.dataset['dayphase'] = p;
  }

  openHub(): void {
    this.hubOpen.set(true);
    if (typeof document !== 'undefined') document.body.style.overflow = 'hidden';
  }

  closeHub(): void {
    this.hubOpen.set(false);
    if (typeof document !== 'undefined') document.body.style.overflow = '';
  }

  toggle(): void {
    const order: AppTheme[] = ['underground', 'ocean', 'forest'];
    const next = order[(order.indexOf(this.theme()) + 1) % order.length];
    this.set(next);
  }

  set(theme: AppTheme): void {
    this.theme.set(theme);
    if (typeof window !== 'undefined') {
      document.documentElement.dataset['theme'] = theme;
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  }
}
