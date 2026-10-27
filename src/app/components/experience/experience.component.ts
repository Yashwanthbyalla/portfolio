import { Component, signal } from '@angular/core';
import { EXPERIENCE } from '../../data/portfolio.data';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-experience',
  standalone: true,
  imports: [ScrollRevealDirective],
  templateUrl: './experience.component.html',
  styleUrl: './experience.component.scss',
})
export class ExperienceComponent {
  readonly experience = EXPERIENCE;
  expandedIndex = signal<number | null>(0);

  toggle(index: number): void {
    this.expandedIndex.update((current) => (current === index ? null : index));
  }

  isExpanded(index: number): boolean {
    return this.expandedIndex() === index;
  }
}
