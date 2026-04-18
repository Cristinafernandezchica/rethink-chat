// Global state
window.conversations = { general: [] };
window.currentChat = "general";
window.unreadCounts = {};

// Helper functions
window.ensureConversation = (chatId) => {
  if (!window.conversations[chatId]) {
    window.conversations[chatId] = [];
  }
};

// Initialize app
window.addEventListener("DOMContentLoaded", () => {
  window.auth.init();
  window.search.init();
  window.admin.init();
  if (window.stats) window.stats.init();
  if (window.geolocation) window.geolocation.init();
});