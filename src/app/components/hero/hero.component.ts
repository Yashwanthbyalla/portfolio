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
