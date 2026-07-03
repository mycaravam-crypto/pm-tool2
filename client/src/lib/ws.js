// Connects to the same origin as the page (proxied to the API server by Vite in
// dev — see vite.config.js's /ws entry) so there's nothing to configure per
// environment. Reconnects on drop since a dev server restart or a laptop sleep/
// wake cycle shouldn't require reloading the page to get notifications back.
export function connectNotificationSocket(onNotification) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${window.location.host}/ws`;
  let socket;
  let reconnectTimer = null;

  function connect() {
    socket = new WebSocket(url);

    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'notification') onNotification(msg.notification);
    });

    socket.addEventListener('close', () => {
      reconnectTimer = setTimeout(connect, 3000);
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  connect();

  return () => {
    clearTimeout(reconnectTimer);
    socket?.close();
  };
}
