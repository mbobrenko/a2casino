# Развёртывание на сервере (Hetzner Cloud)

Сервер сам ставит Docker, скачивает проект из GitHub, запускает его с HTTPS и каждые 5 минут
забирает обновления из ветки `main`. Домен не нужен: используется бесплатный адрес вида
`casino.1-2-3-4.sslip.io`, который указывает на IP сервера.

## 1. Ключ GitHub только для чтения

1. Откройте https://github.com/settings/personal-access-tokens/new
2. Token name: `a2casino-server`, Expiration: на ваш выбор (например, 1 год).
3. Repository access: **Only select repositories** → `a2casino`.
4. Permissions → Repository permissions → **Contents: Read-only**. Больше ничего не включайте.
5. **Generate token** и скопируйте его (начинается с `github_pat_`). Никому его не пересылайте.

## 2. Сервер

1. https://console.hetzner.cloud → проект → **Add Server** (Create server).
2. Location: любая в Европе. Image: **Ubuntu 24.04**.
3. Type: Shared vCPU, x86, **4 vCPU / 8 GB RAM** (около 8–10 € в месяц).
4. Networking: оставить Public IPv4 включённым.
5. SSH keys: можно пропустить (пароль root придёт на почту).
6. **Cloud config**: вставьте целиком файл `deploy/cloud-init.yaml` и замените в нём
   `PASTE_GITHUB_TOKEN_HERE` на ключ из шага 1, а `PASTE_ADMIN_PASSWORD_HERE` на пароль
   для бэк-офиса (от 10 символов).
7. **Create & Buy now**. Через ~10 минут после запуска будут работать:
   - сайт игрока: `https://casino.<IP-через-дефисы>.sslip.io`
   - бэк-офис: `https://admin.<IP-через-дефисы>.sslip.io` (вход `admin@a2casino.local` и ваш пароль)

   Например, для IP `91.98.10.20` адрес сайта `https://casino.91-98-10-20.sslip.io`.

## Обслуживание (если понадобится зайти на сервер)

```bash
cat /var/log/a2casino-install.log                     # журнал первой установки
systemctl list-timers a2casino-update.timer           # автообновление
sh /opt/a2casino/deploy/update.sh --force             # пересобрать вручную
cd /opt/a2casino && docker compose -f docker-compose.yml -f deploy/compose.prod.yml logs -f api
```

Секреты (пароль базы, JWT, ключи вебхуков) генерируются при установке и лежат в `/opt/a2casino/.env`.
Это демо-стенд: тестовые платежи и игры включены (`DEV_TOOLS=true`).
