@echo off
setlocal

rem ===== PocoERP: commit and push to GitHub + Gitee =====

rem 1. Commit message: command line args > user input > default "updated"
rem NOTE: assigning an empty value UNDEFINES the variable in cmd,
rem so use "if defined" checks instead of comparing to "".
set "msg=%*"
if defined msg set "msg=%msg:"=%"
if not defined msg set /p "msg=Enter commit message (press Enter for 'updated'): "
if not defined msg set "msg=updated"
echo.
echo [push-git] Commit message: %msg%
echo.

rem 2. Stage and commit
git add -A
if errorlevel 1 (
    echo [push-git] git add failed, aborting.
    exit /b 1
)

git commit -m "%msg%"
rem If there is nothing to commit, continue to push anyway
rem (there may be older commits not pushed yet)

rem 3. Push to every configured remote (github / gitee)
for /f %%r in ('git remote') do (
    echo.
    echo [push-git] Pushing to remote: %%r
    git push %%r HEAD
    if errorlevel 1 (
        echo [push-git] Push to %%r FAILED. Check network or remote config.
    ) else (
        echo [push-git] Push to %%r done.
    )
)

echo.
echo [push-git] All finished.
endlocal
