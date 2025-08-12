@echo off
echo Setting up SQL Editor...

REM Copy environment file
copy .env.example .env

echo.
echo Environment file created. Please edit .env with your database credentials.
echo.
echo Next steps:
echo 1. Edit .env file with your MySQL database credentials
echo 2. Run: npm install
echo 3. Run: npm start
echo 4. Open http://localhost:3000 in your browser
echo.
pause
