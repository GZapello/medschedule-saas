@echo off
chcp 65001 >nul
title MedSchedule - Conectar e Enviar para o GitHub

echo =====================================================================
echo       MEDSCHEDULE - ENVIAR PROJETO PARA O GITHUB
echo =====================================================================
echo.
echo Seu usuário Git configurado no computador: GZapello
echo.
set /p REPO_NAME="Digite o NOME do repositório que você acabou de criar no GitHub (ex: medschedule-saas): "

if "%REPO_NAME%"=="" (
    echo [Erro] Nome do repositório não informado.
    pause
    exit /b
)

echo.
echo Configurando conexão com: https://github.com/GZapello/%REPO_NAME%.git ...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/GZapello/%REPO_NAME%.git
git branch -M main

echo.
echo Enviando arquivos do projeto para o GitHub...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo            PROJETO ENVIADO COM SUCESSO PARA O GITHUB!
    echo =====================================================================
    echo.
    echo Repositório disponível em: https://github.com/GZapello/%REPO_NAME%
    echo.
    echo Agora você já pode conectar esse repositório diretamente no Railway.app!
) else (
    echo.
    echo [Aviso] Se o Git solicitou permissão/login no navegador, complete a autenticação e tente novamente.
)

echo.
pause
