// src/lib/socket.js
import { io } from "socket.io-client";

export function createSocket() {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("No token found; login first");
  }
  const socket = io("http://localhost:5000", {
    auth: { token },
    transports: ["websocket"],
  });
  return socket;
}
