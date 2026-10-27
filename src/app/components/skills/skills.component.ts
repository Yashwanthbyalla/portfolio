import { Component, signal } from '@angular/core';
import { SKILLS } from '../../data/portfolio.data';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-skills',
  standalone: true,
  imports: [ScrollRevealDirective],
  templateUrl: './skills.component.html',
  styleUrl: './skills.component.scss',
})
export class SkillsComponent {
  readonly skills = SKILLS;
  animated = signal(false);

  onReveal(): void {
    if (!this.animated()) {
      this.animated.set(true);
    }
  }
}
