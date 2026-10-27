import { Component, computed, inject, signal } from '@angular/core';
import { PROJECTS, ProjectCategory } from '../../data/portfolio.data';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [ScrollRevealDirective],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent {
  readonly themeService = inject(ThemeService);
  readonly projects = PROJECTS;
  activeCategory = signal<ProjectCategory>('All');

  filteredProjects = computed(() => {
    const cat = this.activeCategory();
    if (cat === 'All') return this.projects.items;
    return this.projects.items.filter((p) => p.category === cat);
  });

  setCategory(category: ProjectCategory): void {
    this.activeCategory.set(category);
  }

  getCategoryCount(category: ProjectCategory): number {
    if (category === 'All') return this.projects.items.length;
    return this.projects.items.filter((p) => p.category === category).length;
  }

  getCategoryIcon(category: ProjectCategory): string {
    const icons: Record<string, string> = {
      'Mobile Apps': '📱',
      'Extensions': '🧩',
      'Themes': '🎨',
      'NPM Libraries': '📦',
      'VS Code Extensions': '💻',
      'Snapchat Lenses': '👻',
      'Research Papers': '📄',
      'All': '✨',
    };
    return icons[category] ?? '✨';
  }
}
