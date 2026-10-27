import { Component, inject, signal } from '@angular/core';
import { SKILLS } from '../../data/portfolio.data';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-skills',
  standalone: true,
  imports: [ScrollRevealDirective],
  templateUrl: './skills.component.html',
  styleUrl: './skills.component.scss',
})
export class SkillsComponent {
  readonly themeService = inject(ThemeService);
  readonly skills = SKILLS;
  animated = signal(false);

  onReveal(): void {
    if (!this.animated()) {
      this.animated.set(true);
    }
  }
}
