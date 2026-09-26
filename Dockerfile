# ─────────────────────────────────────────────────────────────────────────────
# Resilify Control Plane — Dockerfile
# Runs the orchestrator backend (port 4000)
# MongoDB is provided as a separate service in docker-compose
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

# Install bash and tini (proper PID 1 init for process management)
RUN apk add --no-cache tini bash

# Create app directory
WORKDIR /app

# ── Control Plane Dependencies ────────────────────────────────────────────────
COPY control-plane/package*.json ./control-plane/
RUN cd control-plane && npm ci --omit=dev

# ── Sample App Dependencies ────────────────────────────────────────────────────
COPY sample-app/package*.json ./sample-app/
RUN cd sample-app && npm ci --omit=dev

# ── Sample Apps Dependencies ───────────────────────────────────────────────────
COPY sample-apps/react-demo-app/package*.json ./sample-apps/react-demo-app/
RUN cd sample-apps/react-demo-app && npm ci --omit=dev

COPY sample-apps/student-portal/package*.json ./sample-apps/student-portal/
RUN cd sample-apps/student-portal && npm ci --omit=dev

# ── Copy Source Code ──────────────────────────────────────────────────────────
COPY control-plane/ ./control-plane/
COPY sample-app/ ./sample-app/
COPY sample-apps/ ./sample-apps/

# Create data directory for MongoDB and shared user storage
RUN mkdir -p ./data/db

# ── Environment Defaults ──────────────────────────────────────────────────────
ENV PORT=4000
ENV MONGO_URI=mongodb://mongo:27017/resilify
ENV NODE_ENV=production

# Expose control plane API + Gateway port
EXPOSE 4000

# Use tini as init to properly handle child process signals
ENTRYPOINT ["/sbin/tini", "--"]

WORKDIR /app/control-plane

CMD ["node", "server.js"]
