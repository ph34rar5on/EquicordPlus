function Sync-Fork {
    <#
    .SYNOPSIS
    Syncs the current branch with upstream/dev and pushes to origin/main
    
    .DESCRIPTION
    This function performs three git operations:
    1. Fetches from upstream remote
    2. Merges upstream/dev into current branch
    3. Pushes current branch to origin/main
    
    .EXAMPLE
    Sync-Fork
    #>
    
    Write-Host "🔄 Fetching from upstream..." -ForegroundColor Yellow
    git fetch upstream
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to fetch from upstream" -ForegroundColor Red
        return
    }
    
    Write-Host "🔀 Merging upstream/dev..." -ForegroundColor Yellow
    git merge upstream/dev
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to merge upstream/dev" -ForegroundColor Red
        return
    }
    
    Write-Host "⬆️  Pushing to origin/main..." -ForegroundColor Yellow
    git push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Successfully synced fork!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to push to origin/main" -ForegroundColor Red
    }
}

# Create an alias for shorter usage
Set-Alias -Name syncfork -Value Sync-Fork
