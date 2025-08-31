#!/bin/bash

# Exit on any error
set -e

echo "Starting Crypto Price Streaming Application..."

# Install dependencies if not already installed
echo "Installing dependencies..."
pnpm install --recursive

# Generate protobuf code if needed
echo "Generating protobuf code..."
cd proto && npx buf generate && cd ..

# Start backend server in the background
echo "Starting backend server..."
cd backend
pnpm start &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend server in the background
echo "Starting frontend server..."
cd frontend
pnpm dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "🚀 Application started successfully!"
echo "📊 Backend server: http://localhost:8080"
echo "🌐 Frontend server: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "Servers stopped."
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for background processes
wait
