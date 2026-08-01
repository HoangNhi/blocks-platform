FROM node:22.22-alpine AS build
WORKDIR /app

COPY apps/web/Blocks.Web/package.json apps/web/Blocks.Web/package-lock.json ./
RUN npm ci

COPY apps/web/Blocks.Web/ ./
RUN npm run build

FROM nginx:alpine AS runtime
ENV PORT=8080
ENV API_GATEWAY_URL=http://api-gateway:8080
ENV NGINX_ENVSUBST_FILTER=PORT,API_GATEWAY_URL

COPY apps/web/Blocks.Web/nginx.heroku.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
