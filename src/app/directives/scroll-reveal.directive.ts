import { Directive, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appScrollReveal]',
  standalone: true,
})
export class ScrollRevealDirective implements OnInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;

  readonly animationClass = input('reveal');
  readonly delay = input(0);
  readonly revealed = output<void>();

  ngOnInit(): void {
    const element = this.el.nativeElement as HTMLElement;
    element.classList.add(this.animationClass());
    if (this.delay() > 0) {
      element.style.transitionDelay = `${this.delay()}ms`;
    }

    // If IntersectionObserver is not supported, show immediately
    if (!('IntersectionObserver' in window)) {
      element.classList.add('visible');
      this.revealed.emit();
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            this.revealed.emit();
            // Once revealed, no need to keep observing
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.05, rootMargin: '0px 0px -30px 0px' }
    );

    // Small delay so styles are applied before observing
    requestAnimationFrame(() => {
      this.observer?.observe(element);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
