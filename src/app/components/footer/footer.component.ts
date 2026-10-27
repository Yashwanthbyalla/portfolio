import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `
    <footer class="border-t border-white/8 bg-dark-950/80 backdrop-blur-sm">
      <div class="section-wrap py-6 sm:py-8">
        <div class="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p class="text-gray-500 text-sm text-center sm:text-left">
            © {{ year }} <span class="text-gray-300">Yashwanth Byalla</span> · Built with
            <span class="text-primary-400">Angular 22</span> &
            <span class="text-accent-400">Tailwind CSS</span>
          </p>
          <a href="#home" class="flex items-center gap-1.5 text-gray-500 hover:text-primary-400 text-sm transition-colors group">
            Back to top
            <svg class="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
}
