FROM node:25-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Requires the application's committed npm lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
USER node

EXPOSE 3000
CMD ["npm", "start"]
