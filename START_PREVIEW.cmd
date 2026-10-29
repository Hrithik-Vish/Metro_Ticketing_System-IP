@echo off
setlocal
cd /d "%~dp0"
call mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=preview"
if errorlevel 1 (
  echo.
  echo Preview stopped with an error. Read the messages above, then press any key to close.
  pause >nul
)
