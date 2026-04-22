// Geolocation Module - Mapa de usuarios en tiempo real (versión corregida)
window.geolocation = {
  isSharing: false,
  watchId: null,
  map: null,
  markers: {},
  currentPosition: null,
  updateInterval: null,

  init: function () {
    this.createModal();
    this.addButtonToUI();
  },

  createModal: function () {
    if (document.getElementById("geo-modal")) return;

    const modal = document.createElement("div");
    modal.id = "geo-modal";
    modal.className = "hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50";
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div class="p-4 border-b bg-gradient-to-r from-green-500 to-green-600 text-white flex justify-between items-center">
          <div>
            <h2 class="text-xl font-bold"><i class="fas fa-map-marker-alt mr-2"></i>Mapa de Usuarios</h2>
            <p class="text-xs opacity-90">Usuarios que comparten su ubicación en tiempo real</p>
          </div>
          <button id="close-geo-modal" class="text-white hover:text-gray-200 text-2xl">&times;</button>
        </div>
        
        <div class="p-4 bg-gray-100 border-b flex flex-wrap gap-3 items-center justify-between">
          <div class="flex items-center space-x-3">
            <button id="share-location-btn" class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition flex items-center space-x-2">
              <i class="fas fa-share-alt"></i>
              <span>Compartir mi ubicación</span>
            </button>
            <button id="stop-sharing-btn" class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition flex items-center space-x-2 hidden">
              <i class="fas fa-stop"></i>
              <span>Dejar de compartir</span>
            </button>
          </div>
          
          <div class="flex items-center space-x-3">
            <label class="text-sm text-gray-600">Radio de búsqueda:</label>
            <select id="radius-select" class="border rounded-lg px-2 py-1 text-sm">
              <option value="1">1 km</option>
              <option value="3">3 km</option>
              <option value="5" selected>5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
            </select>
            <button id="find-nearby-btn" class="bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 transition text-sm">
              <i class="fas fa-search"></i> Buscar cercanos
            </button>
            <button id="refresh-users-btn" class="bg-gray-500 text-white px-3 py-1 rounded-lg hover:bg-gray-600 transition text-sm">
              <i class="fas fa-sync-alt"></i> Refrescar
            </button>
          </div>
        </div>
        
        <div id="map-container" class="flex-1" style="min-height: 500px;">
          <div class="text-center py-8">
            <i class="fas fa-map-marked-alt text-4xl text-gray-400"></i>
            <p class="mt-2 text-gray-500">Cargando mapa...</p>
          </div>
        </div>
        
        <div id="nearby-results" class="p-3 border-t bg-gray-50 max-h-40 overflow-y-auto">
          <p class="text-xs text-gray-500 text-center">Comparte tu ubicación para ver usuarios cercanos</p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById("close-geo-modal").addEventListener("click", () => this.hideModal());
    document.getElementById("share-location-btn").addEventListener("click", () => this.startSharing());
    document.getElementById("stop-sharing-btn").addEventListener("click", () => this.stopSharing());
    document.getElementById("find-nearby-btn").addEventListener("click", () => this.findNearby());
    document.getElementById("refresh-users-btn").addEventListener("click", () => this.loadAllUsers());

    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.hideModal();
    });
  },

  addButtonToUI: function () {
    // Añadir botón al sidebar de usuarios
    const usersHeader = document.querySelector("#app-screen .border-r .p-4.border-b");
    if (usersHeader && !document.getElementById("geo-toggle-btn")) {
      const geoBtn = document.createElement("button");
      geoBtn.id = "geo-toggle-btn";
      geoBtn.className = "text-green-500 hover:text-green-600 transition p-2 rounded-full hover:bg-green-50";
      geoBtn.innerHTML = '<i class="fas fa-map-marked-alt text-xl"></i>';
      geoBtn.title = "Ver mapa de usuarios";
      geoBtn.onclick = () => this.showModal();

      // Insertar junto al logout button
      const logoutBtn = document.getElementById("logout-btn");
      if (logoutBtn) {
        logoutBtn.parentNode.insertBefore(geoBtn, logoutBtn);
      }
    }
  },

  showModal: function () {
    const modal = document.getElementById("geo-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    this.loadMap();
    this.loadAllUsers();

    // Iniciar actualización periódica de usuarios en el mapa (cada 10 segundos)
    if (this.updateInterval) clearInterval(this.updateInterval);
    this.updateInterval = setInterval(() => {
      if (this.isSharing) {
        this.loadAllUsers();
      }
    }, 10000);
  },

  hideModal: function () {
    const modal = document.getElementById("geo-modal");
    if (modal) modal.classList.add("hidden");

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  },

  loadMap: function () {
    // Cargar Leaflet (biblioteca de mapas gratuita)
    if (document.querySelector("#leaflet-css")) {
      this.initMap();
      return;
    }

    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => this.initMap();
    document.head.appendChild(script);
  },

  initMap: function () {
    const container = document.getElementById("map-container");
    if (!container) return;

    // Centro por defecto (Madrid)
    this.map = L.map(container).setView([40.4168, -3.7038], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
    }).addTo(this.map);

    // Intentar obtener la ubicación actual del usuario
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.map.setView([pos.coords.latitude, pos.coords.longitude], 13);
        },
        () => console.log("No se pudo obtener ubicación")
      );
    }
  },

  startSharing: function () {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización");
      return;
    }

    if (this.isSharing) {
      alert("Ya estás compartiendo tu ubicación");
      return;
    }

    this.isSharing = true;

    // Función para enviar ubicación
    const sendLocation = async (position) => {
      const { latitude, longitude } = position.coords;
      this.currentPosition = { lat: latitude, lng: longitude };

      const token = localStorage.getItem("token");
      try {
        const response = await fetch("/api/messages/location/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ lat: latitude, lng: longitude })
        });

        const data = await response.json();
        if (data.success) {
          console.log("Ubicación enviada correctamente");
          this.updateOwnMarker(latitude, longitude);
          this.loadAllUsers();
        }
      } catch (err) {
        console.error("Error enviando ubicación:", err);
      }
    };

    // Enviar ubicación inmediatamente
    navigator.geolocation.getCurrentPosition(
      sendLocation,
      (error) => {
        console.error("Error de geolocalización:", error);
        alert("Error al obtener tu ubicación. Asegúrate de permitir el acceso.");
        this.stopSharing();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );

    // Luego, actualizar cada 30 segundos (no cada cambio para evitar spam)
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      sendLocation,
      (error) => {
        console.error("Error en watchPosition:", error);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );

    document.getElementById("share-location-btn").classList.add("hidden");
    document.getElementById("stop-sharing-btn").classList.remove("hidden");

    window.ui.addAlert({ text: "📍 Compartiendo tu ubicación...", ephemeral: true });
  },

  stopSharing: async function () {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.isSharing = false;

    const token = localStorage.getItem("token");
    try {
      await fetch("/api/messages/location/delete", {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
    } catch (err) {
      console.error("Error al dejar de compartir:", err);
    }

    if (this.markers.own) {
      this.map.removeLayer(this.markers.own);
      delete this.markers.own;
    }

    document.getElementById("share-location-btn").classList.remove("hidden");
    document.getElementById("stop-sharing-btn").classList.add("hidden");

    window.ui.addAlert({ text: "📍 Has dejado de compartir tu ubicación", ephemeral: true });

    this.loadAllUsers();
  },

  updateOwnMarker: function (lat, lng) {
    if (!this.map) return;

    if (this.markers.own) {
      this.markers.own.setLatLng([lat, lng]);
    } else {
      this.markers.own = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "own-marker",
          html: '<div class="w-6 h-6 bg-green-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>',
          iconSize: [24, 24]
        })
      }).addTo(this.map);
      this.markers.own.bindPopup("<b>Tú</b><br>Estás aquí").openPopup();
    }
  },

  loadAllUsers: async function () {
    const token = localStorage.getItem("token");

    try {
      const response = await fetch("/api/messages/location/all", {
        headers: { "Authorization": `Bearer ${token}` }
      });

      const data = await response.json();

      if (data.success && data.users) {
        // Limpiar usuarios duplicados por username
        const uniqueUsers = [];
        const seenUsernames = new Set();

        for (const user of data.users) {
          if (!seenUsernames.has(user.username)) {
            seenUsernames.add(user.username);
            uniqueUsers.push(user);
          }
        }

        this.updateUserMarkers(uniqueUsers);

        // Actualizar contador en la UI
        const nearbyDiv = document.getElementById("nearby-results");
        if (nearbyDiv && uniqueUsers.length > 0) {
          const countHtml = `<p class="text-xs text-gray-500 mb-1">📍 ${uniqueUsers.length} usuario(s) en el mapa</p>`;
          if (!nearbyDiv.innerHTML.includes("usuario(s) en el mapa")) {
            // No sobrescribir si ya hay resultados de búsqueda cercana
          }
        }
      }
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    }
  },

  updateUserMarkers: function (users) {
    if (!this.map) return;

    // Eliminar marcadores que ya no existen
    Object.keys(this.markers).forEach(key => {
      if (key !== "own" && !users.find(u => u.username === key)) {
        this.map.removeLayer(this.markers[key]);
        delete this.markers[key];
      }
    });

    // Añadir o actualizar marcadores
    users.forEach(user => {
      if (this.markers[user.username]) {
        this.markers[user.username].setLatLng([user.lat, user.lng]);
      } else {
        const marker = L.marker([user.lat, user.lng], {
          icon: L.divIcon({
            className: "user-marker",
            html: `<div class="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-md"></div>`,
            iconSize: [20, 20]
          })
        }).addTo(this.map);

        marker.bindPopup(`
          <b>${escapeHtml(user.username)}</b><br>
          Última vez: ${new Date(user.updatedAt).toLocaleTimeString()}
        `);

        this.markers[user.username] = marker;
      }
    });
  },

  findNearby: async function () {
    if (!this.currentPosition) {
      alert("Primero comparte tu ubicación para buscar usuarios cercanos");
      return;
    }

    const radius = document.getElementById("radius-select").value;
    const token = localStorage.getItem("token");

    try {
      const response = await fetch(
        `/api/messages/location/nearby?lat=${this.currentPosition.lat}&lng=${this.currentPosition.lng}&radius=${radius}`,
        { headers: { "Authorization": `Bearer ${token}` } }
      );

      const data = await response.json();

      if (data.success) {
        this.displayNearbyUsers(data.users);

        // Dibujar círculo en el mapa
        if (this.circle) {
          this.map.removeLayer(this.circle);
        }
        this.circle = L.circle([this.currentPosition.lat, this.currentPosition.lng], {
          color: '#22c55e',
          fillColor: '#22c55e',
          fillOpacity: 0.1,
          radius: radius * 1000
        }).addTo(this.map);

        // Centrar el mapa en la posición actual
        this.map.setView([this.currentPosition.lat, this.currentPosition.lng], 12);
      }
    } catch (err) {
      console.error("Error buscando usuarios cercanos:", err);
    }
  },

  displayNearbyUsers: function (users) {
    const container = document.getElementById("nearby-results");
    if (!container) return;

    // Eliminar duplicados por username
    const uniqueUsers = [];
    const seen = new Set();
    for (const user of users) {
      if (!seen.has(user.username)) {
        seen.add(user.username);
        uniqueUsers.push(user);
      }
    }

    if (uniqueUsers.length === 0) {
      container.innerHTML = `<p class="text-sm text-gray-500 text-center">📡 No hay usuarios cercanos en este radio</p>`;
      return;
    }

    container.innerHTML = `
      <p class="text-xs font-semibold text-gray-600 mb-2">👥 Usuarios cercanos (${uniqueUsers.length})</p>
      <div class="space-y-1">
        ${uniqueUsers.map(user => `
          <div class="flex justify-between items-center text-sm p-1 hover:bg-gray-100 rounded">
            <span class="font-medium">${escapeHtml(user.username)}</span>
            <span class="text-green-600 text-xs">📍 a ${user.distance} km</span>
          </div>
        `).join('')}
      </div>
    `;
  }
};