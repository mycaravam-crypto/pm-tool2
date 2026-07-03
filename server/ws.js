import { WebSocketServer } from 'ws';
import { findSession, COOKIE_NAME } from './middleware/requireAuth.js';

let wss = null;

function parseCookie(header, name) {
  if (!header) return null;
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Attaches to the same HTTP server Express already listens on, so there's no
// second port to manage — the client connects to /ws on the same origin as /api.
// The WS upgrade handshake bypasses Express's middleware stack entirely (it's
// handled at the raw http.Server level), so cookie-parser/requireAuth don't run
// here — the cookie has to be read and the session looked up by hand.
export function initWebSocketServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (socket, request) => {
    const token = parseCookie(request.headers.cookie, COOKIE_NAME);
    const session = token ? findSession(token) : null;
    if (!session) {
      socket.close(4401, 'unauthorized');
      return;
    }
    socket.memberId = session.member_id;
    socket.send(JSON.stringify({ type: 'connected' }));
  });
}

// Targeted to the specific member the notification is for — now that login
// exists, every connected socket has a known identity, so there's no reason to
// broadcast everyone's notifications to everyone (the Notifications *log* still
// shows all of them to anyone logged in; this only changes the live push/sound).
// A member with multiple tabs open gets it on all of them.
export function broadcastNotification(notification) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'notification', notification });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN && client.memberId === notification.member_id) {
      client.send(payload);
    }
  }
}
