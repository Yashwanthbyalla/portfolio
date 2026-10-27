import { Component } from '@angular/core';
import { HERO, CONTACT } from '../../data/portfolio.data';
import { TypewriterComponent } from '../typewriter/typewriter.component';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [TypewriterComponent],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss',
})
export class HeroComponent {
  readonly hero = HERO;

  /** Mouse parallax: expose normalized -1..1 offsets as CSS vars on the hero section. */
  onHeroMouseMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    el.style.setProperty('--mx', x.toFixed(3));
    el.style.setProperty('--my', y.toFixed(3));
  }

  onHeroMouseLeave(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.style.setProperty('--mx', '0');
    el.style.setProperty('--my', '0');
  }

  /** 3D tilt for the profile card wrapper. */
  onCardMove(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  }

  onCardLeave(event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }

  readonly quickStats = [
    { value: '10+', label: 'Yrs Exp' },
    { value: '50+', label: 'Projects' },
    { value: '30+', label: 'Awards' },
  ];

  readonly techPills = ['Angular', 'Node.js', 'TypeScript', 'Tailwind', 'AI dev Tools', 'AI Solution Architect'];

  readonly particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    left: `${(i * 4.2 + Math.sin(i) * 8) % 100}%`,
    top:  `${(i * 4.7 + Math.cos(i) * 9) % 100}%`,
    delay: `${(i * 0.35) % 8}s`,
    duration: `${6 + (i % 5)}s`,
    size: `${2 + (i % 3)}px`,
  }));
}
