import { WebSocketServer } from 'ws';

let wss = null;

// Attaches to the same HTTP server Express already listens on, so there's no
// second port to manage — the client connects to /ws on the same origin as /api.
export function initWebSocketServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'connected' }));
  });
}

// No auth/session concept exists in this app (see PLAN.md Section 1's scope
// note), so there's no "which member is this browser tab" to target — every
// connected client gets every notification, same as the Notifications log
// already shows all of them regardless of member.
export function broadcastNotification(notification) {
  if (!wss) return;
  const payload = JSON.stringify({ type: 'notification', notification });
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}
