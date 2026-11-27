import { Hono } from 'hono';
import type { Env } from '../types';
import { need, audit, hashPassword, verifyPassword } from '../lib/auth';
import { PERMISSIONS, cleanPermissions } from '../lib/permissions';
import { stripDashes } from '../lib/style-guard';

// Mounted under /api/people. People, roles and the activity log.
const people = new Hono<{ Bindings: Env; Variables: { uid: number; user: any } }>();

const tempPassword = () => {
  const words = ['kowhai', 'harbour', 'southerly', 'tui', 'fern', 'kauri', 'pounamu', 'rimu', 'tide', 'ridge', 'kea', 'flax'];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${pick()}-${crypto.getRandomValues(new Uint32Array(1))[0] % 900 + 100}`;
};

async function ownerCount(env: Env, excludeUser?: number) {
  const r = await env.DB.prepare(
    "SELECT COUNT(DISTINCT u.id) n FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.name = 'Owner' AND u.active = 1 AND u.id != ?"
  ).bind(excludeUser ?? -1).first<{ n: number }>();
  return r?.n ?? 0;
}

// ----- Your own account -----
people.put('/me/password', async (c) => {
  const { current, next } = await c.req.json<{ current: string; next: string }>();
  if (!next || next.length < 10) return c.json({ error: 'Use at least 10 characters.' }, 400);
  const u = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(c.get('uid')).first<{ password_hash: string }>();
  if (!u || !(await verifyPassword(current || '', u.password_hash))) return c.json({ error: 'Your current password is not right.' }, 400);
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').bind(await hashPassword(next), c.get('uid')).run();
  await audit(c, 'password.changed');
  return c.json({ ok: true });
});

people.put('/me', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(stripDashes(String(name || '')).slice(0, 80), c.get('uid')).run();
  return c.json({ ok: true });
});

// ----- Permissions catalogue -----
people.get('/permissions', (c) => c.json(PERMISSIONS));

// ----- Roles -----
people.get('/roles', need('users.manage'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT r.*, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS members FROM roles r ORDER BY r.system DESC, r.name').all<any>();
  return c.json(results.map((r) => ({ ...r, permissions: JSON.parse(r.permissions) })));
});

people.post('/roles', need('roles.manage'), async (c) => {
  const b = await c.req.json<{ name: string; description?: string; permissions?: string[] }>();
  const name = stripDashes(String(b.name || '')).trim().slice(0, 60);
  if (!name) return c.json({ error: 'Give the role a name.' }, 400);
  if (await c.env.DB.prepare('SELECT 1 FROM roles WHERE name = ? COLLATE NOCASE').bind(name).first()) return c.json({ error: 'A role with that name already exists.' }, 400);
  const r = await c.env.DB.prepare('INSERT INTO roles (name, description, permissions) VALUES (?, ?, ?) RETURNING id')
    .bind(name, stripDashes(String(b.description || '')).slice(0, 300), JSON.stringify(cleanPermissions(b.permissions))).first<{ id: number }>();
  await audit(c, 'role.created', name);
  return c.json({ id: r!.id }, 201);
});

people.put('/roles/:id{[0-9]+}', need('roles.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const role = await c.env.DB.prepare('SELECT * FROM roles WHERE id = ?').bind(id).first<any>();
  if (!role) return c.json({ error: 'Not found.' }, 404);
  if (role.name === 'Owner') return c.json({ error: 'The Owner role always has every permission and cannot be changed.' }, 400);
  const b = await c.req.json<{ name?: string; description?: string; permissions?: string[] }>();
  const name = role.system ? role.name : stripDashes(String(b.name ?? role.name)).trim().slice(0, 60) || role.name;
  await c.env.DB.prepare('UPDATE roles SET name = ?, description = ?, permissions = ? WHERE id = ?')
    .bind(name, stripDashes(String(b.description ?? role.description)).slice(0, 300), JSON.stringify(b.permissions ? cleanPermissions(b.permissions) : JSON.parse(role.permissions)), id).run();
  await audit(c, 'role.updated', name);
  return c.json({ ok: true });
});

people.delete('/roles/:id{[0-9]+}', need('roles.manage'), async (c) => {
  const role = await c.env.DB.prepare('SELECT * FROM roles WHERE id = ?').bind(Number(c.req.param('id'))).first<any>();
  if (!role) return c.json({ error: 'Not found.' }, 404);
  if (role.system) return c.json({ error: 'Built-in roles can be edited but not deleted.' }, 400);
  await c.env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(role.id).run();
  await audit(c, 'role.deleted', role.name);
  return c.json({ ok: true });
});

// ----- People -----
people.get('/users', need('users.manage'), async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT u.id, u.email, u.name, u.active, u.last_login, u.created_at, u.must_change_password, COALESCE(json_group_array(ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '[]') AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id GROUP BY u.id ORDER BY u.id"
  ).all<any>();
  return c.json(results.map((u) => ({ ...u, roles: JSON.parse(u.roles) })));
});

async function setRoles(env: Env, userId: number, roleIds: number[]) {
  await env.DB.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(userId).run();
  for (const r of [...new Set(roleIds.map(Number))]) await env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE id = ?').bind(userId, r).run();
}
const ownerRoleId = (env: Env) => env.DB.prepare("SELECT id FROM roles WHERE name = 'Owner'").first<{ id: number }>().then((r) => r!.id);

people.post('/users', need('users.manage'), async (c) => {
  const b = await c.req.json<{ email: string; name?: string; roles?: number[] }>();
  const email = String(b.email || '').toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'That email address does not look right.' }, 400);
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return c.json({ error: 'Someone with that email already has a login.' }, 400);
  // Only an Owner can make another Owner.
  if ((b.roles || []).map(Number).includes(await ownerRoleId(c.env)) && !c.get('user').perms.has('*')) return c.json({ error: 'Only an Owner can add another Owner.' }, 403);
  const password = tempPassword();
  const r = await c.env.DB.prepare('INSERT INTO users (email, name, password_hash, must_change_password) VALUES (?, ?, ?, 1) RETURNING id')
    .bind(email, stripDashes(String(b.name || '')).slice(0, 80), await hashPassword(password)).first<{ id: number }>();
  await setRoles(c.env, r!.id, b.roles || []);
  await audit(c, 'user.added', email);
  return c.json({ id: r!.id, password }, 201);
});

people.put('/users/:id{[0-9]+}', need('users.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ name?: string; active?: boolean; roles?: number[]; resetPassword?: boolean }>();
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<any>();
  if (!user) return c.json({ error: 'Not found.' }, 404);
  const owner = await ownerRoleId(c.env);
  const isOwnerNow = !!(await c.env.DB.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?').bind(id, owner).first());
  const iAmOwner = c.get('user').perms.has('*');
  if (isOwnerNow && !iAmOwner) return c.json({ error: 'Only an Owner can change another Owner.' }, 403);
  if (b.roles && b.roles.map(Number).includes(owner) && !iAmOwner) return c.json({ error: 'Only an Owner can make someone an Owner.' }, 403);
  const losingOwner = isOwnerNow && ((b.roles && !b.roles.map(Number).includes(owner)) || b.active === false);
  if (losingOwner && (await ownerCount(c.env, id)) === 0) return c.json({ error: 'There must always be at least one active Owner.' }, 400);
  if (id === c.get('uid') && b.active === false) return c.json({ error: 'You cannot switch off your own login.' }, 400);
  if (b.name !== undefined || b.active !== undefined)
    await c.env.DB.prepare('UPDATE users SET name = ?, active = ? WHERE id = ?').bind(b.name !== undefined ? stripDashes(String(b.name)).slice(0, 80) : user.name, b.active === undefined ? user.active : b.active ? 1 : 0, id).run();
  if (b.roles) await setRoles(c.env, id, b.roles);
  let password: string | undefined;
  if (b.resetPassword) {
    password = tempPassword();
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').bind(await hashPassword(password), id).run();
  }
  await audit(c, 'user.updated', `${user.email}${b.roles ? ' roles' : ''}${b.active === false ? ' switched off' : b.active ? ' switched on' : ''}${password ? ' password reset' : ''}`);
  return c.json({ ok: true, password });
});

people.delete('/users/:id{[0-9]+}', need('users.manage'), async (c) => {
  const id = Number(c.req.param('id'));
  if (id === c.get('uid')) return c.json({ error: 'You cannot remove yourself.' }, 400);
  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(id).first<{ email: string }>();
  if (!user) return c.json({ ok: true });
  const owner = await ownerRoleId(c.env);
  if (await c.env.DB.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?').bind(id, owner).first()) {
    if (!c.get('user').perms.has('*')) return c.json({ error: 'Only an Owner can remove another Owner.' }, 403);
    if ((await ownerCount(c.env, id)) === 0) return c.json({ error: 'There must always be at least one active Owner.' }, 400);
  }
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  await audit(c, 'user.removed', user.email);
  return c.json({ ok: true });
});

people.get('/audit', need('audit.view'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT a.*, u.email, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200').all();
  return c.json(results);
});

export default people;
