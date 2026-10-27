import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { HERO } from '../../data/portfolio.data';

@Component({
  selector: 'app-typewriter',
  standalone: true,
  template: `
    <span class="grad font-semibold">{{ displayText() }}</span><span class="type-cursor"></span>
  `,
})
export class TypewriterComponent implements OnInit, OnDestroy {
  private readonly words = HERO.roles;
  displayText = signal('');
  private wordIndex = 0;
  private charIndex = 0;
  private isDeleting = false;
  private tid?: ReturnType<typeof setTimeout>;

  ngOnInit() { this.tick(); }
  ngOnDestroy() { clearTimeout(this.tid); }

  private tick() {
    const word = this.words[this.wordIndex];
    if (this.isDeleting) {
      this.charIndex--;
      this.displayText.set(word.substring(0, this.charIndex));
    } else {
      this.charIndex++;
      this.displayText.set(word.substring(0, this.charIndex));
    }

    let delay = this.isDeleting ? 45 : 95;
    if (!this.isDeleting && this.charIndex === word.length) {
      delay = 1800; this.isDeleting = true;
    } else if (this.isDeleting && this.charIndex === 0) {
      this.isDeleting = false;
      this.wordIndex = (this.wordIndex + 1) % this.words.length;
      delay = 400;
    }
    this.tid = setTimeout(() => this.tick(), delay);
  }
}
