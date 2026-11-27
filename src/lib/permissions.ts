// Every permission Studio knows about, grouped for the role editor.
// Adding a feature? Add its permission here and check it on the API route.
export const PERMISSIONS: { group: string; items: { id: string; label: string }[] }[] = [
  { group: 'Pages', items: [
    { id: 'pages.view', label: 'See pages' },
    { id: 'pages.edit', label: 'Edit pages and save drafts' },
    { id: 'pages.publish', label: 'Publish and unpublish pages' },
    { id: 'pages.delete', label: 'Create and delete pages' },
  ] },
  { group: 'Writing', items: [
    { id: 'posts.view', label: 'See posts' },
    { id: 'posts.edit', label: 'Write and edit posts' },
    { id: 'posts.publish', label: 'Publish and schedule posts' },
    { id: 'posts.delete', label: 'Delete posts' },
  ] },
  { group: 'Media', items: [
    { id: 'media.view', label: 'See media' },
    { id: 'media.upload', label: 'Upload media' },
    { id: 'media.delete', label: 'Delete media' },
  ] },
  { group: 'Site', items: [
    { id: 'design.edit', label: 'Change design, logo and icon' },
    { id: 'settings.edit', label: 'Change site details' },
    { id: 'messages.view', label: 'Read form messages' },
    { id: 'messages.reply', label: 'Reply to and sort form messages' },
    { id: 'mail.manage', label: 'Email settings and test emails' },
    { id: 'messages.delete', label: 'Delete form messages' },
  ] },
  { group: 'AI', items: [
    { id: 'ai.use', label: 'Use AI writing help' },
    { id: 'ai.manage', label: 'Manage AI services and keys' },
  ] },
  { group: 'Grow', items: [
    { id: 'ideas.use', label: 'Use Create Ideas and the knowledge base' },
    { id: 'social.post', label: 'Post to social accounts' },
    { id: 'integrations.manage', label: 'Connect outside systems' },
    { id: 'modules.manage', label: 'Build and install modules' },
  ] },
  { group: 'People', items: [
    { id: 'users.manage', label: 'Add people and change their roles' },
    { id: 'roles.manage', label: 'Create and change roles' },
    { id: 'audit.view', label: 'See the activity log' },
  ] },
];

export const ALL_PERMISSIONS = PERMISSIONS.flatMap((g) => g.items.map((i) => i.id));

export const has = (perms: Set<string>, p: string) => perms.has('*') || perms.has(p);

/** Keep only permissions that exist, so a typo can't grant something unexpected. */
export const cleanPermissions = (list: unknown) =>
  Array.isArray(list) ? [...new Set(list.map(String).filter((p) => ALL_PERMISSIONS.includes(p)))] : [];
