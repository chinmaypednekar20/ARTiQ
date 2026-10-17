# ==============================================================================
# ARTiQ Artist Dashboard — Production Dockerfile
# ==============================================================================

FROM node:20-slim

WORKDIR /app

# Install build dependencies for native modules (e.g., bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package descriptors
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source
COPY . .

# Ensure uploads directory exists
RUN mkdir -p public/uploads

EXPOSE 3000

CMD ["node", "server.js"]
