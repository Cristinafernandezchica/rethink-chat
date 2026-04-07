import io from "socket.io-client";

const socket = io("http://localhost:3000");

// Pega aquí el token obtenido del login
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAzZDBmOWU2LTVkYmQtNDhjYS1iYWE1LWRiMGM1MmNhMmFiOCIsInVzZXJuYW1lIjoiY3Jpc3RpbmEiLCJyb2xlIjoidXNlciIsImlhdCI6MTc3NTU5NDc5MywiZXhwIjoxNzc2MTk5NTkzfQ.Xz7RlsqJIdONi6A-1g-ZkuJLsreHtHTnpCktPsX-CaU";

socket.on("connect", () => {
  console.log("🔌 Cristina conectada");
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
