import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || "*",
      methods: ["GET", "POST"]
    }
  });

  // Store active voting sessions and their participants in memory
  const votingSessions: Record<string, any> = {};
  const participants: Record<string, Set<string>> = {}; // cardId -> Set of userIds

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join-session", ({ cardId, userId }) => {
      socket.join(`session-${cardId}`);
      
      // Track participant
      if (cardId && userId) {
        if (!participants[cardId]) participants[cardId] = new Set();
        participants[cardId].add(userId);
        
        // Sync with voting session object
        if (votingSessions[cardId]) {
          votingSessions[cardId].participants = Array.from(participants[cardId]);
          // Broadcast updated session with participant list to everyone
          io.emit("voting-state-updated", votingSessions[cardId]);
        }
      }

      // Send current state if exists
      if (votingSessions[cardId]) {
        socket.emit("voting-state-updated", votingSessions[cardId]);
      }
    });

    socket.on("update-voting-state", ({ cardId, state }) => {
      console.log(`Server: Updating voting state for card ${cardId} to status: ${state.status}`);
      console.log(`Server: Votes: ${Object.keys(state.votes || {}).length}, Participants: ${state.participants?.length || 0}`);
      votingSessions[cardId] = state;
      // Broadcast to everyone (including background clients for discovery)
      io.emit("voting-state-updated", state);
    });

    socket.on("end-voting-session", (cardId: string) => {
      console.log(`Server: Ending voting session for card ${cardId}`);
      delete votingSessions[cardId];
      delete participants[cardId];
      // Broadcast null to everyone so they clear their local state
      io.emit("voting-state-updated", { cardId, status: null });
    });

    socket.on("cast-vote", ({ cardId, userId, vote }) => {
      if (votingSessions[cardId]) {
        if (!votingSessions[cardId].votes) votingSessions[cardId].votes = {};
        votingSessions[cardId].votes[userId] = vote;
        // Global broadcast to ensure background apps also sync
        io.emit("voting-state-updated", votingSessions[cardId]);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  httpServer
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
