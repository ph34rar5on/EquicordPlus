@echo off
echo 🔄 Fetching from upstream...
git fetch upstream
if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to fetch from upstream
    exit /b 1
)

echo 🔀 Merging upstream/dev...
set GIT_EDITOR=true
set EDITOR=true
set VISUAL=true
git -c core.editor=true merge upstream/dev --no-edit --no-ff -m "Merge remote-tracking branch 'upstream/dev'"
if %ERRORLEVEL% neq 0 (
    echo ❌ Failed to merge upstream/dev
    exit /b 1
)

echo ⬆️  Pushing to origin/main...
git push origin main
if %ERRORLEVEL% equ 0 (
    echo ✅ Successfully synced fork!
) else (
    echo ❌ Failed to push to origin/main
    exit /b 1
)
