// Admin Module
window.admin = {
  init: () => {
    const adminGlobalBtn = document.getElementById("admin-alert-global");
    const adminEfimeraBtn = document.getElementById("admin-alert-efimera");
    const alertModal = document.getElementById("alert-modal");
    const alertText = document.getElementById("alert-text");
    const alertCancel = document.getElementById("alert-cancel");
    const alertConfirm = document.getElementById("alert-confirm");
    const testAlertBtn = document.getElementById("test-alert");

    if (testAlertBtn) {
      testAlertBtn.addEventListener("click", () => {
        if (window.chat?.socket) {
          window.chat.socket.emit("send_alert", {
            type: "info",
            text: "Esto es una alerta de prueba",
            ephemeral: true
          });
        }
      });
    }

    if (adminGlobalBtn) {
      adminGlobalBtn.addEventListener("click", () => {
        alertModal.dataset.type = "global";
        alertModal.classList.remove("hidden");
      });
    }

    if (adminEfimeraBtn) {
      adminEfimeraBtn.addEventListener("click", () => {
        alertModal.dataset.type = "efimera";
        alertModal.classList.remove("hidden");
      });
    }

    if (alertCancel) {
      alertCancel.addEventListener("click", () => {
        alertModal.classList.add("hidden");
        alertText.value = "";
      });
    }

    if (alertConfirm) {
      alertConfirm.addEventListener("click", () => {
        const text = alertText.value.trim();
        const type = alertModal.dataset.type;

        if (!text) return;

        if (window.chat?.socket) {
          if (type === "global") {
            window.chat.socket.emit("send_alert", { text, ephemeral: false });
          } else {
            window.chat.socket.emit("send_alert", { text, ephemeral: true });
          }
        }

        alertModal.classList.add("hidden");
        alertText.value = "";
      });
    }
  }
};