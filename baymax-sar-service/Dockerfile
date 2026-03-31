# Use Node.js LTS (Alpine for smaller image size)
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies first (for caching)
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Expose ports
# PORT (Express API)
EXPOSE 4000
# MQTT WebSocket port (Dashboard)
EXPOSE 9001
# MQTT TCP port (Internal agents)
EXPOSE 1883

# Start the service
CMD [ "npm", "start" ]
