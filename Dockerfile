FROM node:20-alpine

WORKDIR /app

# Copy everything
COPY . .

# Build frontend
RUN cd frontend && npm install && npm run build

# Install backend dependencies
RUN cd backend && npm install

EXPOSE 3001

CMD ["node", "backend/src/index.js"]
