import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket && typeof window !== 'undefined') {
    // Connect to the same host as the page
    socket = io();
    
    socket.on("connect", () => {
      console.log("Connected to Socket.io server");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket.io connection error:", err);
    });
  }
  return socket;
};
