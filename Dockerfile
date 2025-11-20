# Dockerfile semplice per DietCoach su Raspberry (ARM64)

FROM node:20-alpine

# Impostazioni ambiente
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=512"

# Directory di lavoro
WORKDIR /app

# Copia i file di configurazione npm
COPY package*.json ./

# Installa tutte le dipendenze (prod + dev, va benissimo per il Raspberry)
RUN npm install

# Copia Prisma schema e config
COPY prisma ./prisma

# Genera il client Prisma
RUN npx prisma generate

# Copia il codice sorgente
COPY src ./src

# Espone la porta dell'API
EXPOSE 3000

# Comando di avvio
CMD ["node", "src/app.js"]
