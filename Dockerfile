# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsup src/index.ts --format esm --dts --clean

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser
COPY --from=builder /app/package*.json ./
RUN npm ci --production --ignore-scripts
COPY --from=builder /app/dist ./dist/
USER appuser
EXPOSE 8080
CMD ["node", "dist/index.js"]
