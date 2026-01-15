#!/bin/bash
# Start both frontend and backend for the regulation task

echo "Starting Regulatory Compliance Application..."
echo ""

# Start backend in background
echo "Starting Backend API (port 8000)..."
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting Frontend (port 3000)..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=================================="
echo "Application started!"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo "Navigate to: http://localhost:3000/compliance"
echo "=================================="
echo ""
echo "Press Ctrl+C to stop both servers"

# Wait for user to stop
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
