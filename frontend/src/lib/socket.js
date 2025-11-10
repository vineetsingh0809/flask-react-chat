// src/lib/socket.js
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function createSocket() {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("No token found; login first");
  }
  const socket = io(API_URL, {
    auth: { token },
    transports: ["websocket"],
    withCredentials: false,
    reconnection: true,
  });
  return socket;
}
