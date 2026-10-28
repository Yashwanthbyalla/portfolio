import { Component, HostListener, inject, signal } from '@angular/core';
import { NAV_ITEMS } from '../../data/portfolio.data';
import { PHASE_META, ThemeService } from '../../services/theme.service';
import { AmbientAudioService } from '../../services/ambient-audio.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent {
  readonly themeService = inject(ThemeService);
  readonly audio = inject(AmbientAudioService);
  get phaseMeta() { return PHASE_META[this.themeService.phase()]; }
  openHub(): void { this.themeService.openHub(); }
  readonly navItems = NAV_ITEMS;
  isScrolled = signal(false);
  isMobileOpen = signal(false);
  activeSection = signal('home');
  scrollProgress = signal(0);

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled.set(window.scrollY > 50);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.scrollProgress.set(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);
    this.updateActiveSection();
  }

  toggleMobile(): void {
    this.isMobileOpen.update((v) => !v);
  }

  closeMobile(): void {
    this.isMobileOpen.set(false);
  }

  private updateActiveSection(): void {
    const sections = this.navItems.map((item) => item.href.replace('#', ''));
    for (const id of [...sections].reverse()) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 150) {
          this.activeSection.set(id);
          return;
        }
      }
    }
    this.activeSection.set('home');
  }
}
