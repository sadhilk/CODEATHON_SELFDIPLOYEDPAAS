@echo off
echo ==========================================
echo   RESILIFY - Application Orchestrator
echo ==========================================
echo.

echo [1/3] Starting MongoDB...
start "MongoDB" mongod --dbpath "%~dp0data\db" --port 27017
timeout /t 2 /nobreak > nul

echo [2/3] Starting Control Plane (port 4000)...
start "Resilify Control Plane" cmd /k "cd /d %~dp0control-plane && npm start"
timeout /t 3 /nobreak > nul

echo [3/3] Starting Dashboard (port 3001)...
start "Resilify Dashboard" cmd /k "cd /d %~dp0dashboard && npm run dev"

echo.
echo ==========================================
echo   Resilify is starting up!
echo.
echo   Dashboard (Local):     http://localhost:3001
echo   Control Plane (Local): http://localhost:4000
echo   Student Portal (Local):http://localhost:4000/apps/student-portal/
echo.
echo   LAN Network Access (for Phone / other devices on Wi-Fi):
node -e "const os = require('os'); const nets = os.networkInterfaces(); for (const n in nets) for (const net of nets[n]) if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) { console.log('   Student Portal (Phone): http://' + net.address + ':4000/apps/student-portal/'); console.log('   Dashboard (Phone):      http://' + net.address + ':3001'); }"
echo ==========================================
echo.
pause
