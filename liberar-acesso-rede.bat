@echo off
chcp 65001 >nul
title MedSchedule - Liberar Acesso na Rede Local (Firewall e Wi-Fi)

:: Verifica se está executando com privilégios de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Solicitando permissão de Administrador do Windows...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

cls
echo =====================================================================
echo       MEDSCHEDULE - LIBERAÇÃO DE ACESSO REMOTO PARA ANDROID
echo =====================================================================
echo.
echo [1/3] Liberando a porta 4000 (API Backend) no Firewall do Windows...
netsh advfirewall firewall delete rule name="MedSchedule SaaS API (Porta 4000)" >nul 2>&1
netsh advfirewall firewall add rule name="MedSchedule SaaS API (Porta 4000)" dir=in action=allow protocol=TCP localport=4000 profile=any >nul
if %errorlevel% equ 0 (
    echo   -> Porta 4000 liberada com sucesso no Firewall!
) else (
    echo   -> [Aviso] Não foi possível configurar a regra na porta 4000.
)

echo.
echo [2/3] Liberando a porta 5173 (Interface Web) no Firewall do Windows...
netsh advfirewall firewall delete rule name="MedSchedule Vite Dev (Porta 5173)" >nul 2>&1
netsh advfirewall firewall add rule name="MedSchedule Vite Dev (Porta 5173)" dir=in action=allow protocol=TCP localport=5173 profile=any >nul
if %errorlevel% equ 0 (
    echo   -> Porta 5173 liberada com sucesso no Firewall!
) else (
    echo   -> [Aviso] Não foi possível configurar a regra na porta 5173.
)

echo.
echo [3/3] Configurando o perfil da rede Wi-Fi para Privada...
powershell -Command "Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' } | Set-NetConnectionProfile -NetworkCategory Private -ErrorAction SilentlyContinue"
echo   -> Rede Wi-Fi ajustada para permitir comunicação entre dispositivos locais!

echo.
echo =====================================================================
echo                  CONFIGURAÇÃO CONCLUÍDA COM SUCESSO!
echo =====================================================================
echo.
echo Seu computador está pronto para receber conexões do aplicativo Android.
echo.
echo Endereço IP do seu computador na rede Wi-Fi:
powershell -Command "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' }).IPAddress; if ($ip) { Write-Host \"   ==> http://$($ip):4000/api\" -ForegroundColor Green } else { Write-Host \"   ==> http://192.168.0.100:4000/api\" -ForegroundColor Green }"
echo.
echo No seu celular Android:
echo 1. Certifique-se de estar conectado no mesmo Wi-Fi deste computador.
echo 2. Abra o aplicativo MedSchedule.
echo 3. O aplicativo se conectará automaticamente!
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
