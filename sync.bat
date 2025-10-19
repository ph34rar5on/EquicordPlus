@echo off
cd /d "C:\EquicordPlus"
powershell.exe -ExecutionPolicy Bypass -File "sync-fork.ps1"
pause