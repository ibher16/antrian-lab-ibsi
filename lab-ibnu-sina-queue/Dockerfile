# Build Stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod and sum files
COPY backend/go.mod backend/go.sum ./backend/
WORKDIR /app/backend
RUN go mod download

# Copy the rest of the backend source code
WORKDIR /app
COPY backend/ ./backend/

# Build the backend
WORKDIR /app/backend
RUN go mod tidy
RUN go build -o main ./cmd/server/main.go

# Final Stage
FROM alpine:latest

WORKDIR /app

# Install dependencies for healthcheck or other tools if needed
RUN apk add --no-cache ca-certificates

# Copy the binary from the builder stage
COPY --from=builder /app/backend/main .

# Copy the frontend files
COPY frontend ./frontend

# Environment Variables
ENV PORT=8080
ENV STATIC_FILES_PATH=./frontend
ENV DATABASE_URL=""
ENV DB_ROOT_DSN=""

# Run the backend
CMD ["./main"]
