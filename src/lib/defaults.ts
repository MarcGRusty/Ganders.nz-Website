import type { SiteSettings, Block } from '../types';

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
  theme: {
    paper: '#E7EBE8',   // southerly grey, the colour of a Wellington sky before rain
    ink: '#0E1B22',     // harbour at night
    muted: '#55646B',
    accent: '#B9860B',  // kowhai gold
    accent2: '#1F5F6B', // deep water
    displayFont: 'Bricolage Grotesque',
    bodyFont: 'Hanken Grotesk',
    monoFont: 'IBM Plex Mono',
    radius: 2,
    maxWidth: 1120,
    motion: true,
  },
};

let n = 0;
const id = () => `b${Date.now().toString(36)}${(n++).toString(36)}`;

export const BLOCK_TYPES: Record<string, { label: string; data: () => Record<string, any> }> = {
  hero: { label: 'Intro', data: () => ({ kicker: 'Kia ora, I\'m', heading: 'Marc Gander.', body: '<p>Write a sentence or two about who you are and why someone should keep reading.</p>', image: '' }) },
  text: { label: 'Text', data: () => ({ heading: 'A heading', body: '<p>Start writing here.</p>' }) },
  image: { label: 'Image', data: () => ({ src: '', alt: '', caption: '' }) },
  cards: { label: 'Cards', data: () => ({ heading: 'Things I work on', items: [{ title: 'Project one', body: 'A short line about it.', link: '' }, { title: 'Project two', body: 'A short line about it.', link: '' }] }) },
  timeline: { label: 'Timeline', data: () => ({ heading: 'Along the way', items: [{ when: '2024', title: 'Something that mattered', body: 'What happened and what it taught you.' }] }) },
  quote: { label: 'Quote', data: () => ({ quote: 'A line you live by.', cite: '' }) },
  posts: { label: 'Latest writing', data: () => ({ heading: 'Recent writing', count: 3 }) },
  contact: { label: 'Contact', data: () => ({ heading: 'Say hello', body: '<p>I read every message.</p>', button: 'Send' }) },
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
  withData('contact', { heading: 'Say hello', body: '<p>Questions, ideas, or just a good restaurant tip. I read every message.</p>', button: 'Send it' }),
];
