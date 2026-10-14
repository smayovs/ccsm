// Notificaciones de ccsm (lo carga el service worker con importScripts; ver vite.config.ts)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { cuerpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "ccsm", {
    body: d.cuerpo || "", icon: "icono-192.png", badge: "icono-192.png", data: { url: d.url || "#/" },
  }));
});

// Al tocarla abre la app en la pantalla del aviso (o la trae al frente si ya está abierta)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || "#/", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
    for (const v of ventanas) if ("focus" in v) { v.navigate(destino); return v.focus(); }
    return self.clients.openWindow(destino);
  }));
});
