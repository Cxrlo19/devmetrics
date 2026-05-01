FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]