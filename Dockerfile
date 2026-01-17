# Use Node.js 20 Alpine for a smaller image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose the port Fly.io will use
EXPOSE 3000

# Set environment variable for production
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]
