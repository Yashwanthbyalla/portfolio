import { Component } from '@angular/core';
import { ABOUT, getAboutStats } from '../../data/portfolio.data';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [ScrollRevealDirective],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss',
})
export class AboutComponent {
  readonly about = ABOUT;
  readonly stats = getAboutStats();
  copied = false;

  readonly highlightedCode = this.syntaxHighlight(this.about.codeSnippet);

  copyCode(): void {
    navigator.clipboard.writeText(this.about.codeSnippet).then(() => {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    });
  }

  private syntaxHighlight(code: string): string {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(const|return)/g, "<span class='kw'>$1</span>")
      .replace(/"([^"]*)"/g, '<span class="str">"$1"</span>')
      .replace(/\b(developer)\b/g, '<span class="var">$1</span>')
      .replace(/(\[|\]|\{|\}|,|:)/g, '<span class="punc">$1</span>');
  }
}
