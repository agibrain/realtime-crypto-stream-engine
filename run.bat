@echo off
echo Starting Crypto Price Streaming Application...

echo Installing dependencies...
call pnpm install --recursive

echo Generating protobuf code...
cd proto
call npx buf generate
cd ..

echo Starting backend server...
cd backend
start /b cmd /c "pnpm start"
cd ..

echo Waiting for backend to start...
timeout /t 3

echo Starting frontend server...
cd frontend
start /b cmd /c "pnpm dev"
cd ..

echo.
echo 🚀 Application started successfully!
echo 📊 Backend server: http://localhost:8080
echo 🌐 Frontend server: http://localhost:3000
echo.
echo Press any key to stop...
pause > nul

echo Stopping servers...
taskkill /f /im node.exe 2>nul || echo No node processes found
echo Servers stopped.
