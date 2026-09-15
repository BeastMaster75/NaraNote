# Dev only. Source is bind-mounted at runtime (see docker-compose.yml); this
# image just carries node_modules, built inside Linux so Vite's esbuild
# binary matches the container rather than a Windows host install.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
