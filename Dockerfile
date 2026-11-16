FROM node:18-alpine

WORKDIR /app

# Copy package files first for efficient caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of the application code
COPY . .

EXPOSE 6080

CMD ["node", "server.js"]