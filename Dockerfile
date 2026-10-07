FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY js ./js
COPY css ./css
COPY assets ./assets
COPY index.html manifest.webmanifest service-worker.js ./
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 GOODKOTA_STORAGE=firestore GOODKOTA_FIREBASE_PROJECT_ID=goodkota
USER node
CMD ["node", "server/server.mjs"]
