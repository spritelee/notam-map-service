# Build Frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# Build Backend
FROM python:3.11-slim
WORKDIR /app

# Copy Backend Code
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend /app/backend

# Copy Frontend Build
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Expose Cloud Run default port
EXPOSE 8080

# Run Uvicorn
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
