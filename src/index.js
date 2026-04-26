import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createNodeWebSocket } from "@hono/node-ws";

const app = new Hono();
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

// ================== STATE ==================
const clients = new Map(); // ws.raw -> { ws, username }
let players = []; // array urutan join
let host = null;
let isPlaying = false;

// ================== STATIC ==================
app.use("/", serveStatic({ path: "./public/index.html" }));

// ================== WEBSOCKET ==================
app.get("/ws", upgradeWebSocket(() => {
  return {
    onOpen(_, ws) {
      clients.set(ws.raw, {
        ws,
        username: null
      });
    },

    onMessage(event, ws) {
      const client = clients.get(ws.raw);
      if (!client) return;

      const data = JSON.parse(event.data);

      // ================== JOIN ==================
      if (data.type === "JOIN") {
        client.username = data.username;

        // tambahkan ke players jika belum ada
        if (!players.find(p => p.ws === ws.raw)) {
          players.push({
            ws: ws.raw,
            username: client.username
          });
        }

        // host = yang paling atas
        host = players[0]?.ws || null;

        updatePlayers();
        updateRoles();
      }

      // ================== START ==================
      if (data.type === "START_SESSION") {
        if (ws.raw !== host) return;

        isPlaying = false;

        broadcast({
          type: "GAME_STARTED"
        });

        const delay = Math.floor(Math.random() * 5000) + 1000;

        setTimeout(() => {
          isPlaying = true;

          broadcast({
            type: "SHOW_BUTTON"
          });
        }, delay);
      }

      // ================== BUZZ ==================
      if (data.type === "BUZZ") {
        if (!isPlaying) return;

        isPlaying = false;

        broadcast({
          type: "WINNER",
          winner: client.username
        });
      }
    },

    onClose(_, ws) {
      clients.delete(ws.raw);

      // hapus dari players
      players = players.filter(p => p.ws !== ws.raw);

      // assign host baru
      host = players[0]?.ws || null;

      updatePlayers();
      updateRoles();
    }
  };
}));

// ================== UPDATE PLAYERS ==================
function updatePlayers() {
  const list = players.map(p => p.username);

  broadcast({
    type: "PLAYERS",
    players: list
  });
}

// ================== UPDATE ROLES ==================
function updateRoles() {
  for (const player of players) {
    const client = clients.get(player.ws);
    if (!client) continue;

    client.ws.send(JSON.stringify({
      type: "ROLE",
      role: player.ws === host ? "HOST" : "PLAYER"
    }));
  }
}

// ================== BROADCAST ==================
function broadcast(data) {
  const payload = JSON.stringify(data);

  for (const [, client] of clients) {
    client.ws.send(payload);
  }
}

// ================== RUN SERVER ==================
const server = serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server jalan di http://localhost:${info.port}`);
});

injectWebSocket(server);