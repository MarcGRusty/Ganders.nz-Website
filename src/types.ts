export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;
  SITE_URL: string;
}

export interface Theme {
  paper: string;      // background
  ink: string;        // main text
  muted: string;      // secondary text
  accent: string;     // the one strong colour
  accent2: string;    // supporting colour
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  radius: number;     // px
  maxWidth: number;   // px
  motion: boolean;
}

export interface SiteSettings {
  name: string;
  tagline: string;
  location: string;
  now: string;          // the "currently" line shown in the header
  email: string;
  logo: string | null;  // media key
  favicon: string | null;
  socials: { label: string; url: string }[];
  footer: string;
  theme: Theme;
}

export type Block = { id: string; type: string; data: Record<string, any> };

export interface Page {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  in_menu: number;
  menu_order: number;
  blocks: Block[];
  seo: { description?: string; image?: string };
  updated_at: string;
}

export interface Post {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover: string | null;
  tags: string[];
  status: 'idea' | 'draft' | 'review' | 'scheduled' | 'published';
  source: string;
  publish_at: string | null;
  published_at: string | null;
  updated_at: string;
}
