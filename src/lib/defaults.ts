import type { SiteSettings, Block } from '../types';
import { DEFAULT_THEME } from './themes';

// GUESS: placeholder copy until Marc supplies his own. Every line here is editable in the CMS.
export const DEFAULT_SETTINGS: SiteSettings = {
  name: 'Marc Gander',
  tagline: 'Secure the future. Enjoy the present.',
  location: 'Wellington',
  now: 'Running Syntralyn and rebuilding this site',
  email: '',
  logo: null,
  favicon: null,
  socials: [],
  footer: 'Made in Te Whanganui-a-Tara.',
  theme: DEFAULT_THEME,
  themes: [],
};

let n = 0;
const id = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;

export const BLOCK_TYPES: Record<string, { label: string; data: () => Record<string, any> }> = {
  header: { label: 'Page heading', data: () => ({ kicker: 'About', heading: 'A page heading', body: '<p>A line or two to set the scene.</p>' }) },
  hero: { label: 'Big intro', data: () => ({ kicker: 'Kia ora, I\'m', heading: 'Marc Gander.', body: '<p>Write a sentence or two about who you are and why someone should keep reading.</p>', image: '' }) },
  text: { label: 'Text', data: () => ({ heading: 'A heading', body: '<p>Start writing here.</p>' }) },
  image: { label: 'Image', data: () => ({ src: '', alt: '', caption: '' }) },
  cards: { label: 'Cards', data: () => ({ heading: 'Things I work on', items: [{ title: 'Project one', body: 'A short line about it.', link: '' }, { title: 'Project two', body: 'A short line about it.', link: '' }] }) },
  timeline: { label: 'Timeline', data: () => ({ heading: 'Along the way', items: [{ when: '2024', title: 'Something that mattered', body: 'What happened and what it taught you.' }] }) },
  quote: { label: 'Quote', data: () => ({ quote: 'A line you live by.', cite: '' }) },
  posts: { label: 'Latest writing', data: () => ({ heading: 'Recent writing', count: 3 }) },
  cta: { label: 'Call to action', data: () => ({ heading: 'Want to talk?', body: 'A short line inviting people to get in touch.', button: 'Get in touch', link: '/contact' }) },
  contact: { label: 'Contact form', data: () => ({ heading: 'Say hello', body: '<p>I read every message.</p>', button: 'Send' }) },
  embed: { label: 'Embed', data: () => ({ html: '' }) },
  spacer: { label: 'Spacer', data: () => ({ size: 64 }) },
};

export const newBlock = (type: string): Block => ({ id: id(), type, data: BLOCK_TYPES[type]?.data() ?? {} });

const withData = (type: string, data: Record<string, any>): Block => ({ ...newBlock(type), data });

// Starting copy adapted from the current ganders.nz site. Marc can change every word in the visual editor.
export const DEFAULT_HOME: Block[] = [
  withData('hero', {
    kicker: 'Kia ora, I\'m',
    heading: 'Marc *Gander*.',
    body: '<p>I spend my working hours keeping New Zealand businesses safe online. The rest belongs to family, the kitchen, Wellington\'s wild south coast and the next trip to Asia.</p>',
    image: '',
  }),
  withData('cards', {
    heading: 'What keeps me busy',
    items: [
      { title: 'Syntralyn', body: 'Cyber security and IT support for Kiwi small businesses, explained in plain English.', link: '' },
      { title: 'Artificial intelligence', body: 'Figuring out how the models work, then making them do something useful.', link: '' },
      { title: 'Business and investing', body: 'Building things that last longer than the hours I put in.', link: '' },
      { title: 'Food and travel', body: 'Thai flavours, Kiwi produce, and night markets wherever we can find them.', link: '' },
    ],
  }),
  withData('timeline', {
    heading: 'How I got here',
    items: [
      { when: 'Now', title: 'Founder, Syntralyn', body: 'A cyber security managed service and IT consultancy for NZ small to medium businesses.' },
      { when: '10+ years', title: 'A career in IT', body: 'Infrastructure, support and security roles. The best security is the kind nobody notices until the day it matters.' },
    ],
  }),
  withData('quote', { quote: 'Secure the future. Enjoy the present.', cite: 'The motto' }),
  withData('posts', { heading: 'Recent writing', count: 3 }),
  withData('cta', { heading: 'Got something in mind?', body: 'Questions, ideas, or just a good restaurant tip. I read every message.', button: 'Get in touch', link: '/contact' }),
];

// GUESS: adapted from the About text on the current ganders.nz. Marc can rewrite all of it.
export const DEFAULT_ABOUT: Block[] = [
  withData('header', {
    kicker: 'About',
    heading: 'Curious by nature, practical by trade.',
    body: '<p>I\'m Marc. I live in Wellington and I\'ve spent more than ten years in IT, most of it learning that the best security is the kind nobody notices until the day it matters.</p>',
  }),
  withData('text', {
    heading: 'The short version',
    body: '<p>I founded Syntralyn to give New Zealand\'s small and medium businesses the kind of cyber security and IT support that used to be reserved for big corporates: practical, proactive, and explained in plain English.</p><p>Outside work I\'m happiest figuring out how something works, whether that\'s an AI model, a business, or a new recipe. Friends would say I\'m loyal, dependable, and never too serious about any of it.</p>',
  }),
  withData('cards', {
    heading: 'What I care about',
    items: [
      { title: 'Curiosity', body: 'Always learning: AI, security, business, food, places.', link: '' },
      { title: 'Dependability', body: 'If I say I will, I do. At work and at home.', link: '' },
      { title: 'Presence', body: 'Build for the future, but actually enjoy today.', link: '' },
    ],
  }),
  withData('text', {
    heading: 'Away from the keyboard',
    body: '<p>Thailand and the rest of Asia keep calling me back: street food, temples, islands and the noise of a night market. At home it\'s Thai flavours meeting Kiwi produce, bush walks, and weekends on the wild south coast that end salty and windswept.</p>',
  }),
  withData('cta', { heading: 'Say kia ora', body: 'If any of this sounds like your kind of conversation, I\'d like to hear from you.', button: 'Get in touch', link: '/contact' }),
];

export const DEFAULT_CONTACT: Block[] = [
  withData('header', {
    kicker: 'Contact',
    heading: 'Let\'s talk.',
    body: '<p>Whether it\'s about security, AI, a project, or where to find the best pad kra pao in Wellington, drop me a note. I usually reply within a couple of days.</p>',
  }),
  withData('contact', { heading: 'Send a message', body: '<p>Your details stay with me. No mailing lists.</p>', button: 'Send it' }),
];
