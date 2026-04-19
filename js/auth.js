// Authentication Module
window.auth = {
  mode: "login",

  init: () => {
    const title = document.getElementById("auth-title");
    const btn = document.getElementById("auth-btn");
    const toggle = document.getElementById("toggle-auth");
    const errorBox = document.getElementById("auth-error");

    toggle.addEventListener("click", () => {
      window.auth.mode = window.auth.mode === "login" ? "register" : "login";
      title.innerText = window.auth.mode === "login" ? "Iniciar sesión" : "Crear cuenta";
      btn.innerText = window.auth.mode === "login" ? "Entrar" : "Registrarse";
      toggle.innerText = window.auth.mode === "login"
        ? "¿No tienes cuenta? Regístrate"
        : "¿Ya tienes cuenta? Inicia sesión";
      errorBox.innerText = "";
    });

    btn.addEventListener("click", async () => {
      const username = document.getElementById("auth-username").value.trim();
      const password = document.getElementById("auth-password").value.trim();

      if (!username || !password) {
        errorBox.innerText = "Rellena todos los campos";
        return;
      }

      btn.disabled = true;
      btn.classList.add("opacity-60");
      errorBox.innerText = "";

      try {
        if (window.auth.mode === "register") {
          const { ok, data } = await window.api.register(username, password);
          if (!ok) {
            errorBox.innerText = data.error || "Error al registrar";
          } else {
            errorBox.innerText = "Cuenta creada. Ahora inicia sesión.";
            window.auth.mode = "login";
            title.innerText = "Iniciar sesión";
            btn.innerText = "Entrar";
          }
        } else {
          const { ok, data } = await window.api.login(username, password);
          if (!ok) {
            errorBox.innerText = data.error || "Error al iniciar sesión";
          } else {
            localStorage.setItem("token", data.token);
            localStorage.setItem("username", data.user.username);
            localStorage.setItem("role", data.user.role);

            document.getElementById("auth-screen").classList.add("hidden");
            document.getElementById("app-screen").classList.remove("hidden");
            document.getElementById("user-display").innerText = data.user.username;

            if (window.chat?.initSocket) {
              window.chat.initSocket();
            }
          }
        }
      } catch {
        errorBox.innerText = "Error de conexión con el servidor";
      } finally {
        btn.disabled = false;
        btn.classList.remove("opacity-60");
      }
    });

    document.getElementById("logout-btn")?.addEventListener("click", () => {
      localStorage.clear();
      if (window.chat?.socket) window.chat.socket.disconnect();
      location.reload();
    });
  }
};