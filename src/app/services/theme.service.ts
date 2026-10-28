import { Injectable, signal } from '@angular/core';

export type AppTheme = 'underground' | 'ocean' | 'forest';

const STORAGE_KEY = 'portfolio-theme';

/** Global theme state: 'underground' (original) or 'ocean'. Persisted + mirrored to <html data-theme>. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<AppTheme>('underground');

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'ocean' || saved === 'underground' || saved === 'forest') this.theme.set(saved);
      document.documentElement.dataset['theme'] = this.theme();
    }
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
