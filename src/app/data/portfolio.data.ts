export interface Stat {
  icon: string;
  value: string;
  label: string;
}

export interface Experience {
  company: string;
  role: string;
  period: string;
  tool?: string;
  highlights: string[];
  tech: string[];
  awards?: string[];
}

export interface Skill {
  name: string;
  level: number;
}

export interface Project {
  id: number;
  title: string;
  description: string;
  category: ProjectCategory;
  link?: string;
  linkLabel?: string;
  tech?: string[];
}

export type ProjectCategory =
  | 'All'
  | 'Mobile Apps'
  | 'Extensions'
  | 'Themes'
  | 'NPM Libraries'
  | 'VS Code Extensions'
  | 'Snapchat Lenses'
  | 'Research';

export const HERO = {
  greeting: "Hi, I'm",
  name: 'Yashwanth Byalla',
  roles: [
    'Full-Stack Developer',
    'Angular Expert',
    'Node.js Specialist',
    'UI/UX Enthusiast',
    'Problem Solver',
  ],
  description:
    'Full-Stack Developer passionate about creating elegant, innovative solutions with cutting-edge technologies and stunning user experiences.',
  floatingIcons: ['⚡', '🚀', '💡', '🎯', '⭐', '🔥'],
};

export const ABOUT = {
  title: 'About Me',
  bio: `My name is Yashwanth and I am a passionate Full-Stack Developer with a love for creating innovative digital experiences. I specialize in building scalable web applications using cutting-edge technologies. I enjoy spending my free time exploring new technologies, building challenging projects and sharing knowledge with the developer community. When I'm not coding, you'll find me experimenting with new frameworks, contributing to open-source projects, or mentoring fellow developers.`,
  expertise: `Lead Developer & Full-Stack Developer specializing in Angular + Node.js with expertise in Security Engineering, PGP File Encryption and Veracode SAST/DAST Integration. I architect scalable enterprise applications using modern frameworks like NX Workspace, Tailwind CSS and many others.`,
  resumePath: '/assets/1Resume_Yashwanth_Byalla1.pdf',
  codeSnippet: `const developer = {
  name: "Yashwanth Byalla",
  role: "Lead Developer",
  frontend: ["Angular", "TypeScript", "Tailwind CSS"],
  backend: ["Node.js", "SQL"],
  security: ["PGP Encryption", "Veracode SAST/DAST"],
  tools: ["NX Workspace", "Angular Material"],
  aiExpertise: {
    tools: ["ChatGPT", "GitHub Copilot", "Cursor AI", "Amazon Q"],
    built: ["AI Code Review Bot", "LLM Workflow Automator",
            "Smart Dev CLI", "AI-powered Tools"],
    skills: ["Prompt Engineering", "AI Workflow Automation",
             "LLM API Integration", "Agentic Dev Pipelines"],
    philosophy: "Automate the repetitive, engineer the meaningful"
  },
  passion: "Building AI-augmented developer tools"
};`,
};

export function getYearsExperience(): number {
  const startDate = new Date(2016, 5, 1);
  const now = new Date();
  let years = now.getFullYear() - startDate.getFullYear();
  const monthDiff = now.getMonth() - startDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < startDate.getDate())) {
    years--;
  }
  return years;
}

export function getAboutStats(): Stat[] {
  return [
    { icon: '💼', value: `${getYearsExperience()}+`, label: 'Years Experience' },
    { icon: '🚀', value: '25+', label: 'Open Source Contributions' },
    { icon: '🏆', value: '5', label: 'Industries served' },
    { icon: '⭐', value: '15+', label: 'Certifications' },
    { icon: '👥', value: '4', label: 'Research Publications' },
    { icon: '☕', value: '10K+', label: 'Cups of Coffee' },
  ];
}

export const EXPERIENCE = {
  title: 'Work Experience',
  subtitle: 'My professional journey',
  summary: [
    { label: 'Years Experience', value: `${getYearsExperience()}+` },
    { label: 'Companies', value: '4' },
    { label: 'Projects', value: '50+' },
    { label: 'Awards', value: '9+' },
  ],
  items: [
    {
      company: 'EPSILON',
      role: 'Lead Developer',
      period: '08/2021 - Present',
      highlights: [
        'Architected frontend features across enterprise apps using Angular, Tailwind CSS, HTML5, CSS3',
        'Led Angular & Node.js development in Nx workspace',
        'Led Angular upgrades, reducing bundle sizes',
        'Designed GPG file encryption workflows with docs & training',
        'Fixed Veracode (SAST/DAST) vulnerabilities',
        'Established ADR process for architectural decisions',
        'Implemented GTM & Adobe Tag Manager analytics',
        'Responsive UI across desktop and mobile',
      ],
      tech: [
        'Angular',
        'Node.js',
        'Nx Workspace',
        'TypeScript',
        'Tailwind CSS',
        'Bootstrap',
        'Angular Material',
        'HTML5',
        'CSS3',
        'SQL',
        'PGP File Encryption',
        'Veracode (SAST/DAST)',
        'Google Tag Manager',
        'Adobe Tag Manager',
      ],
      awards: [
        'Magnitude Award',
        'Automate to Innovate Award',
        'Passion Award',
        'Inclusion Award',
        'Work Together to Win Together Award',
        '1% Better Everyday',
      ],
    },
    {
      company: 'DXC Technology',
      role: 'Professional 1 Software Engineer',
      period: '05/2020 - 08/2021',
      tool: 'Agility Platform (cloud provider creation tool)',
      highlights: [
        'Developed UI screens using Angular 8, HTML5, CSS3',
        'Managed a team of developers',
      ],
      tech: ['Angular v8', 'Bootstrap', 'Angular Material', 'TypeScript', 'HTML5', 'CSS3'],
    },
    {
      company: 'Mindtree',
      role: 'Senior Software Engineer',
      period: '09/2019 - 05/2020',
      tool: 'Data Platform Ingestion & Recognition (DPIR) — Hospitality industry',
      highlights: [
        'Angular 8 UI development + NodeJS service layer',
      ],
      tech: ['Angular v8', 'NodeJS', 'Bootstrap', 'Angular Material', 'TypeScript', 'HTML5', 'CSS3'],
      awards: ['Hats Off Award', 'Multiple A-Team Awards'],
    },
    {
      company: 'Tata Consultancy Services',
      role: 'Systems Engineer',
      period: '06/2016 - 09/2019',
      highlights: [
        'Manufacturing & Communications industry',
        'Angular 4-7 development, provided Angular training, recorded lectures',
        'Involved in IoT, AR/VR POCs',
      ],
      tech: [
        'Angular v4-7',
        'NodeJs',
        'Bootstrap',
        'Angular Material',
        'TypeScript',
        'jQuery',
        'Kendo UI for Angular',
        'ASP.Net',
        'MVC',
        'T4 Template',
        'ColdFusion',
        'HTML5',
        'CSS3',
        'ReactJs',
      ],
    },
  ] as Experience[],
};

export const SKILLS = {
  title: 'Tech Stack',
  subtitle: 'Technologies I work with',
  items: [
    { name: 'Angular', level: 95 },
    { name: 'Node.js', level: 90 },
    { name: 'TypeScript', level: 92 },
    { name: 'AI/ML Integration', level: 75 },
    { name: 'Tailwind CSS', level: 90 },
    { name: 'Angular Material', level: 85 },
    { name: 'NX Workspace', level: 88 },
    { name: 'SQL Database', level: 88 },
    { name: 'PGP Encryption', level: 85 },
    { name: 'Veracode SAST/DAST', level: 80 },
    { name: 'Bootstrap', level: 90 },
    { name: 'HTML5 & CSS3', level: 95 },
  ] as Skill[],
  learning: [
    'AI/ML Integration',
    'Machine Learning APIs',
    'Secure Coding',
    'Enterprise Architecture',
    'Cloud Security',
    'Performance Optimization',
  ],
};

export const PROJECTS = {
  title: 'Personal Achievements',
  subtitle: 'Showcasing my creative journey',
  categories: [
    'All',
    'Mobile Apps',
    'Extensions',
    'Themes',
    'NPM Libraries',
    'VS Code Extensions',
    'Snapchat Lenses',
    'Research',
  ] as ProjectCategory[],
  items: [
    {
      id: 1,
      title: 'Neon Time-Loop Runner',
      description: 'Race through neon worlds, master time loops, compete with your ghost.',
      category: 'Mobile Apps',
      link: '#',
      linkLabel: 'Play Store',
      tech: ['HTML5', 'CSS3', 'JS', 'Three.js', 'Web Audio API', 'WebGL'],
    },
    {
      id: 2,
      title: 'Bubble Blaster',
      description: 'Hit balls as they pop up, track hits/taps/accuracy.',
      category: 'Mobile Apps',
      link: '#',
      linkLabel: 'Play Store',
      tech: ['Apache Cordova', 'Android SDK', 'AnimeJS', 'Bootstrap', 'JS'],
    },
    {
      id: 3,
      title: 'Asteroid Exploder',
      description: 'Colorful chain reaction game.',
      category: 'Mobile Apps',
      link: '#',
      linkLabel: 'Play Store',
      tech: ['Apache Cordova', 'Android SDK', 'AnimeJS', 'Bootstrap', 'JS'],
    },
    {
      id: 4,
      title: 'Tricky Name Riddles',
      description: 'Educational brain training game.',
      category: 'Mobile Apps',
      link: '#',
      linkLabel: 'Play Store',
      tech: ['Apache Cordova', 'Android SDK', 'AnimeJS', 'Bootstrap', 'JS'],
    },
    {
      id: 5,
      title: 'Mind Game – Match the Pair',
      description: 'Memory pair matching game.',
      category: 'Mobile Apps',
      link: '#',
      linkLabel: 'Play Store',
      tech: ['Apache Cordova', 'Android SDK', 'AnimeJS', 'jQuery', 'Bootstrap', 'JS'],
    },
    {
      id: 6,
      title: 'SEAL (Scroll Effect Animation Library)',
      description: 'JS library for scroll-based animations.',
      category: 'NPM Libraries',
    },
    {
      id: 7,
      title: 'upgrade-buddy',
      description: 'Node.js CLI for managing/upgrading project dependencies.',
      category: 'NPM Libraries',
    },
    {
      id: 8,
      title: 'structify-project',
      description: 'CLI tool for visualizing/exporting directory structures.',
      category: 'NPM Libraries',
    },
    {
      id: 9,
      title: 'branchname-validator',
      description: 'Git utility for enforcing branch naming conventions.',
      category: 'NPM Libraries',
    },
    {
      id: 10,
      title: 'js-handykit',
      description: 'JavaScript utility toolkit with reusable helper functions (in progress).',
      category: 'NPM Libraries',
    },
    {
      id: 11,
      title: 'Misty Blue',
      description: 'Clean blue-toned VS Code theme.',
      category: 'VS Code Extensions',
    },
    {
      id: 12,
      title: 'Snippet Sparks',
      description: 'Managing and inserting reusable code snippets.',
      category: 'VS Code Extensions',
    },
    {
      id: 13,
      title: 'Script Whiz',
      description: 'CLI-based extension for developer utilities.',
      category: 'VS Code Extensions',
    },
    {
      id: 14,
      title: 'Sync Buddy',
      description: 'Synchronizing workspace configs and project settings.',
      category: 'VS Code Extensions',
    },
    {
      id: 15,
      title: 'ngBoostY',
      description: 'Productivity utilities for Angular development.',
      category: 'VS Code Extensions',
    },
    {
      id: 16,
      title: 'Log Master',
      description: 'Managing and analyzing debugging logs.',
      category: 'VS Code Extensions',
    },
    {
      id: 17,
      title: 'Branch Name Validator',
      description: 'Validating Git branch naming conventions.',
      category: 'VS Code Extensions',
    },
    {
      id: 18,
      title: 'FunkyFacial Fiasco',
      description: '2.1M+ views facial AR lens.',
      category: 'Snapchat Lenses',
    },
    {
      id: 19,
      title: 'TimeTale Insight',
      description: 'Interactive lens experience.',
      category: 'Snapchat Lenses',
    },
    {
      id: 20,
      title: 'Charm Magic Studio',
      description: 'Creative AR lens with magical effects.',
      category: 'Snapchat Lenses',
    },
    {
      id: 21,
      title: 'Editing Captured Key Framed Animation Based on Motion Warping',
      description: 'ICCECE, 2014',
      category: 'Research',
    },
    {
      id: 22,
      title: 'Security for Java Applets',
      description: 'IJRITCC, 2014',
      category: 'Research',
    },
    {
      id: 23,
      title: 'Click the Balls',
      description: 'IJISET, 2014',
      category: 'Research',
    },
    {
      id: 24,
      title: 'Rapid Ball',
      description: 'IJIET, 2015',
      category: 'Research',
    },
    {
      id: 25,
      title: 'Reminder Extension',
      description: 'Chrome extension for schedule management.',
      category: 'Extensions',
      link: '#',
      linkLabel: 'Chrome Store',
      tech: ['AnimeCSS', 'Bootstrap', 'JS', 'jQuery', 'Moment.js'],
    },
    {
      id: 26,
      title: 'Traverse Theme',
      description: 'Chrome theme with ocean traverse imagery.',
      category: 'Themes',
      link: '#',
      linkLabel: 'Chrome Store',
    },
    {
      id: 27,
      title: 'Misty Blue VS Code Theme',
      description: 'Cool dark theme for VS Code.',
      category: 'Themes',
      link: '#',
      linkLabel: 'Marketplace',
    },
  ] as Project[],
};

export const CONTACT = {
  title: 'Get In Touch',
  subtitle: "Let's create something amazing together",
  intro:
    "I'm always excited to work on new projects and collaborate with talented individuals. Whether you have a project in mind or just want to say hello, feel free to reach out!",
  email: 'yashwanthbyalla95@gmail.com',
  phone: '+91-8919346754',
  location: 'India',
  linkedin: 'https://www.linkedin.com/in/yashwanthbyalla/',
  github: 'https://github.com/yashwanthbyalla',
};

export const NAV_ITEMS = [
  { label: 'Home', href: '#home' },
  { label: 'About', href: '#about' },
  { label: 'Experience', href: '#experience' },
  { label: 'Skills', href: '#skills' },
  { label: 'Projects', href: '#projects' },
  { label: 'Contact', href: '#contact' },
];
