# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# po pierwszym `npm install` lokalnie commitnij package-lock.json i zamień to na `npm ci`
RUN npm install
COPY . .
RUN npm run build

# --- serwowanie statycznych plików + proxy /api do backendu ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
