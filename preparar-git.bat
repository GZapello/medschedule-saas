@echo off
chcp 65001 >nul
title MedSchedule - Preparar Repositório Git para Deploy

echo =====================================================================
echo       MEDSCHEDULE - PREPARAR REPOSITÓRIO GIT PARA HOSPEDAGEM
echo =====================================================================
echo.

echo [1/3] Inicializando repositório Git local...
git init

echo.
echo [2/3] Adicionando arquivos do sistema (respeitando .dockerignore e .gitignore)...
git add .

echo.
echo [3/3] Criando commit inicial de produção...
git commit -m "MedSchedule SaaS - Versão Pronta para Deploy em Produção (Docker + Cloud)"

echo.
echo =====================================================================
echo                   REPOSITÓRIO PREPARADO COM SUCESSO!
echo =====================================================================
echo.
echo Para enviar para o seu GitHub e conectar ao Railway/Render:
echo 1. Crie um repositório no seu GitHub (ex: medschedule-saas)
echo 2. Execute os seguintes comandos no terminal:
echo.
echo    git branch -M main
echo    git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
echo    git push -u origin main
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
