import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { after, test } from 'node:test';
import { WebSocket } from 'ws';
import app from './app.js';
import { db, insertMember } from './test/helpers.js';
import { broadcastNotification, closeWebSocketServer, initWebSocketServer } from './ws.js';

// One real HTTP server + WebSocketServer for the whole file, matching how
// index.js wires it up in production — the WS upgrade handshake happens at
// the raw http.Server level, so there's no way to exercise it through
// supertest (which never actually binds a socket you can upgrade).
const server = http.createServer(app);
initWebSocketServer(server);
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

after(() => {
  closeWebSocketServer();
  server.close();
});

function sessionCookieFor(memberId) {
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare("INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))").run(
    token,
    memberId,
  );
  return `sid=${token}`;
}

test('WS: rejects a connection with no session cookie (close code 4401)', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const { code } = await new Promise((resolve) => ws.on('close', (code, reason) => resolve({ code, reason })));
  assert.equal(code, 4401);
});

test('WS: rejects a connection with an unknown/expired session token', async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: 'sid=not-a-real-token' } });
  const { code } = await new Promise((resolve) => ws.on('close', (code, reason) => resolve({ code, reason })));
  assert.equal(code, 4401);
});

test('WS: accepts a connection with a valid session cookie and sends a connected message', async () => {
  const member = insertMember();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: sessionCookieFor(member.id) } });
  const message = await new Promise((resolve, reject) => {
    ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    ws.on('close', (code) => reject(new Error(`closed unexpectedly with code ${code}`)));
  });
  assert.deepEqual(message, { type: 'connected' });
  ws.close();
});

test('broadcastNotification: reaches only the socket for the matching member_id', async () => {
  const memberA = insertMember();
  const memberB = insertMember();
  const wsA = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: sessionCookieFor(memberA.id) } });
  const wsB = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: sessionCookieFor(memberB.id) } });

  // Drain each socket's initial "connected" message before broadcasting.
  await Promise.all([
    new Promise((resolve) => wsA.once('message', resolve)),
    new Promise((resolve) => wsB.once('message', resolve)),
  ]);

  let bReceivedSomething = false;
  wsB.once('message', () => {
    bReceivedSomething = true;
  });
  const gotA = new Promise((resolve) => wsA.once('message', (data) => resolve(JSON.parse(data.toString()))));

  const notification = { member_id: memberA.id, id: 1, type: 'assigned', subject: 'subject', body: 'body' };
  broadcastNotification(notification);

  const messageA = await gotA;
  assert.deepEqual(messageA, { type: 'notification', notification });

  // Give B a moment to (not) receive anything meant for A.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(bReceivedSomething, false);

  wsA.close();
  wsB.close();
});

test('broadcastNotification: a member with two open tabs gets it on both', async () => {
  const member = insertMember();
  const cookie = sessionCookieFor(member.id);
  const tab1 = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: cookie } });
  const tab2 = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Cookie: cookie } });
  await Promise.all([
    new Promise((resolve) => tab1.once('message', resolve)),
    new Promise((resolve) => tab2.once('message', resolve)),
  ]);

  const got1 = new Promise((resolve) => tab1.once('message', (data) => resolve(JSON.parse(data.toString()))));
  const got2 = new Promise((resolve) => tab2.once('message', (data) => resolve(JSON.parse(data.toString()))));
  broadcastNotification({ member_id: member.id, id: 2, type: 'assigned', subject: 's', body: 'b' });

  const [message1, message2] = await Promise.all([got1, got2]);
  assert.equal(message1.type, 'notification');
  assert.equal(message2.type, 'notification');

  tab1.close();
  tab2.close();
});
