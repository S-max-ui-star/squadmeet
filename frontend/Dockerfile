# Two images from one file:
# - "dev" (docker-compose.yml): Vite dev server with hot reload.
# - the last stage (CI and EC2): the built files behind Caddy, which also gets the HTTPS
#   certificate and passes /api/* to the backend (SCRUM-20).
# Pinned to a digest (the multi-arch index), so a rebuild gets the same base; Dependabot
# proposes a new digest (.github/dependabot.yml, SCRUM-49 review).
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS dev
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM dev AS build
RUN npm run build

FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
