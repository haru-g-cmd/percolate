# Stage 1: Build the client
FROM node:20-alpine AS build

WORKDIR /app

# Copy the entire project for the build stage
COPY . .

# Build the client
RUN cd client && npm ci && npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy server code and package files
COPY package.json package-lock.json server.js ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY db/ ./db/

# Copy built client from the build stage
COPY --from=build /app/client/dist ./client/dist

# Install production dependencies only
RUN npm ci --omit=dev

EXPOSE 3000

CMD ["node", "server.js"]
