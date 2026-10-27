import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CONTACT } from '../../data/portfolio.data';
import { ScrollRevealDirective } from '../../directives/scroll-reveal.directive';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule, ScrollRevealDirective],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss',
})
export class ContactComponent {
  private readonly fb = inject(FormBuilder);
  readonly contact = CONTACT;
  submitted = signal(false);

  readonly contactInfo = [
    { icon: '📧', label: 'Email', value: CONTACT.email, href: `mailto:${CONTACT.email}`, external: false },
    { icon: '📞', label: 'Phone', value: CONTACT.phone, href: `tel:${CONTACT.phone}`, external: false },
    { icon: '📍', label: 'Location', value: CONTACT.location, href: '#', external: false },
  ];

  readonly form = this.fb.group({
    name:    ['', [Validators.required, Validators.minLength(2)]],
    email:   ['', [Validators.required, Validators.email]],
    subject: ['', Validators.required],
    message: ['', [Validators.required, Validators.minLength(10)]],
  });

  onSubmit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.submitted.set(true);
    const { name, email, subject, message } = this.form.value;
    window.location.href = `mailto:${this.contact.email}?subject=${encodeURIComponent(subject ?? '')}&body=${encodeURIComponent(`From: ${name} (${email})\n\n${message}`)}`;
    setTimeout(() => { this.form.reset(); this.submitted.set(false); }, 2500);
  }
}
