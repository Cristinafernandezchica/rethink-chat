import io from "socket.io-client";

const socket = io("http://localhost:3000");

// Pega aquí el token obtenido del login
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImRhNmRhNGM3LTEyOTItNGJjMy1iNDdlLTMxYTZkNThiZGU3MyIsInVzZXJuYW1lIjoianVhbiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc1NTk0ODE1LCJleHAiOjE3NzYxOTk2MTV9.jCZnotuXBzqhmM-qLTjMBYXtNC2l_C9sh69mXmhbR1Q";

socket.on("connect", () => {
  console.log("🔌 Juan conectado");
  socket.emit("identify", TOKEN);
});

socket.on("online_users", (users) => {
  console.log("📋 Lista de usuarios online:", users);
});

socket.on("user_online", (user) => {
  console.log("🟢 Usuario online:", user);
});

socket.on("user_offline", (user) => {
  console.log("🔴 Usuario offline:", user);
});
