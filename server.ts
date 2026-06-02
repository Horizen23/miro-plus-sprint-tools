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

interface VotingState {
  cardId: string;
  cardTitle: string;
  status: 'voting' | 'revealed' | null;
  votes: Record<string, string>;
  participants?: string[];
}

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
  const votingSessions: Record<string, VotingState> = {};
  const participants: Record<string, Set<string>> = {}; // cardId -> Set of userIds

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Track which board this socket belongs to
    let currentBoardId: string | null = null;

    socket.on("join-board", (boardId: string) => {
      currentBoardId = boardId;
      socket.join(`board-${boardId}`);
      console.log(`Client ${socket.id} joined board: ${boardId}`);
    });

    // Helper: emit to board room or globally (fallback for clients without boardId)
    const emitToBoard = (event: string, data: VotingState | { cardId: string, status: null }) => {
      if (currentBoardId) {
        io.to(`board-${currentBoardId}`).emit(event, data);
      } else {
        io.emit(event, data);
      }
    };

    socket.on("join-session", ({ cardId, userId }: { cardId: string, userId: string }) => {
      socket.join(`session-${cardId}`);
      
      // Track participant
      if (cardId && userId) {
        if (!participants[cardId]) participants[cardId] = new Set();
        participants[cardId].add(userId);
        
        // Sync with voting session object
        const session = votingSessions[cardId];
        if (session) {
          session.participants = Array.from(participants[cardId]);
          emitToBoard("voting-state-updated", session);
        }
      }

      // Send current state if exists
      if (votingSessions[cardId]) {
        socket.emit("voting-state-updated", votingSessions[cardId]);
      }
    });

    socket.on("update-voting-state", ({ cardId, state }: { cardId: string, state: VotingState }) => {
      console.log(`Server: Updating voting state for card ${cardId} to status: ${state.status}`);
      console.log(`Server: Votes: ${Object.keys(state.votes || {}).length}, Participants: ${state.participants?.length || 0}`);
      votingSessions[cardId] = state;
      emitToBoard("voting-state-updated", state);
    });

    socket.on("end-voting-session", (cardId: string) => {
      console.log(`Server: Ending voting session for card ${cardId}`);
      delete votingSessions[cardId];
      delete participants[cardId];
      emitToBoard("voting-state-updated", { cardId, status: null });
    });

    socket.on("cast-vote", ({ cardId, userId, vote }: { cardId: string, userId: string, vote: string }) => {
      const session = votingSessions[cardId];
      if (session) {
        if (!session.votes) session.votes = {};
        session.votes[userId] = vote;
        emitToBoard("voting-state-updated", session);
      }
    });

    // --- Jira Auth Bridge ---
    socket.on("join-auth", (state: string) => {
      console.log(`Server: Client ${socket.id} joining auth room: auth-${state}`);
      socket.join(`auth-${state}`);
    });

    socket.on("complete-auth", ({ state, code }: { state: string, code: string }) => {
      console.log(`Server: Auth completed for state ${state}. Broadcasting to room...`);
      // Broadcast specifically to the room where the Miro App is waiting
      io.to(`auth-${state}`).emit("auth-success", { state, code });
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
