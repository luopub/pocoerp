@echo off
chcp 65001 >nul
setlocal

rem ===== PocoERP 一键提交并推送到 GitHub + Gitee =====

rem 1. 获取 commit 消息：优先命令行参数，其次用户输入，最后默认 updated
set "msg=%*"
rem 去掉参数自带的引号，避免破坏 if 判断
set "msg=%msg:"=%"
if "%msg%"=="" set /p "msg=请输入 commit 消息（直接回车使用 updated）: "
if "%msg%"=="" set "msg=updated"
echo.
echo [push-git] 提交消息: %msg%
echo.

rem 2. 暂存并提交
git add -A
if errorlevel 1 (
    echo [push-git] git add 失败，终止。
    exit /b 1
)

git commit -m "%msg%"
rem 没有改动可提交时也继续往下推送（可能有未推送的历史提交）

rem 3. 推送到所有已配置的远程仓库（github / gitee）
for /f %%r in ('git remote') do (
    echo.
    echo [push-git] 推送到远程: %%r
    git push %%r HEAD
    if errorlevel 1 (
        echo [push-git] 推送到 %%r 失败，请检查网络或远程配置。
    ) else (
        echo [push-git] 推送到 %%r 完成。
    )
)

echo.
echo [push-git] 全部完成。
endlocal
