import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { signToken, type AuthUser } from '../src/middleware/auth';

// These tests cover auth, RBAC and validation: all of them are rejected before any DB query runs.
const app = createApp();

const author: AuthUser = { id: 'u-author', name: 'Priya', email: 'priya@test', role: 'AUTHOR', authorId: 'AUTH001' };
const admin: AuthUser = { id: 'u-admin', name: 'Neha', email: 'neha@test', role: 'ADMIN', authorId: null };
const bearer = (user: AuthUser) => `Bearer ${signToken(user)}`;

describe('authentication', () => {
  it('rejects requests without a token with a 401 error body', async () => {
    const res = await request(app).get('/api/books');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } });
  });

  it('rejects a tampered token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `${bearer(author)}x`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns the current user for a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', bearer(author));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: 'AUTHOR', authorId: 'AUTH001' });
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['email', 'password']);
  });
});

describe('role-based access control', () => {
  it('blocks authors from admin routes', async () => {
    const res = await request(app).get('/api/admin/tickets').set('Authorization', bearer(author));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('blocks admins from author-only routes', async () => {
    const res = await request(app).get('/api/books').set('Authorization', bearer(admin));
    expect(res.status).toBe(403);
  });

  it('blocks authors from posting admin responses', async () => {
    const res = await request(app)
      .post('/api/admin/tickets/1/responses')
      .set('Authorization', bearer(author))
      .send({ body: 'hi' });
    expect(res.status).toBe(403);
  });

  it('requires a token for the event stream', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });
});

describe('input validation', () => {
  it('rejects a ticket with a too-short description, listing the field', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', bearer(author))
      .send({ bookId: null, subject: 'Royalty question', description: 'too short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'description', message: 'Please describe the issue in at least 20 characters' },
    ]);
  });

  it('requires bookId to be present (null for general queries)', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', bearer(author))
      .send({ subject: 'Royalty question', description: 'A description that is long enough.' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('bookId');
  });

  it('rejects a non-numeric ticket id', async () => {
    const res = await request(app).get('/api/tickets/abc').set('Authorization', bearer(author));
    expect(res.status).toBe(400);
  });

  it('rejects unknown queue filter values', async () => {
    const res = await request(app).get('/api/admin/tickets?status=DONE').set('Authorization', bearer(admin));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('status');
  });

  it('rejects an empty PATCH', async () => {
    const res = await request(app).patch('/api/admin/tickets/1').set('Authorization', bearer(admin)).send({});
    expect(res.status).toBe(400);
  });

  it('returns a JSON 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns a JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
