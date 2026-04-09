FROM node:18-alpine

WORKDIR /app

# Instalar dependencias del sistema para el driver de RethinkDB
RUN apk add --no-cache python3 make g++ bash

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# Crear script de inicio
RUN echo '#!/bin/sh\n\
echo "⏳ Esperando a que RethinkDB esté listo..."\n\
sleep 10\n\
echo "🗄️ Inicializando base de datos..."\n\
npm run initdb\n\
echo "🚀 Iniciando servidor..."\n\
node src/server.js' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]