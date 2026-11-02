# Деплой DropChat

Runbook для ручного деплоя Cloudflare Worker'ов и публикации web через GitHub
Pages. Секреты создавайте и вводите сами; не передавайте их ассистенту, в CI или
в issue.

Порядок важен: **drive-gateway → worker → web**, потому что основной Worker
использует service binding `DRIVE`.

## 0. Что понадобится

- Node.js `>=22.22.2`, рекомендуется 24.
- npm.
- Cloudflare-аккаунт и `wrangler` через `npx`.
- Google OAuth client, refresh token и папка DropChat из
  [`google-cloud-setup.md`](google-cloud-setup.md) — если нужны облачные файлы.
- GitHub-репозиторий с включённым GitHub Pages.
- Значения для secrets в менеджере паролей:
  - `SERVER_SALT`;
  - `DOWNLOAD_SIGNING_KEY`;
  - `INTERNAL_KEY`.

Не коммитьте `.dev.vars`, токены и secrets.

## 1. Wrangler и D1

```sh
npx wrangler login
npx wrangler whoami
```

Впишите Account ID в:

- `worker/wrangler.jsonc` → `account_id`;
- `drive-gateway/wrangler.jsonc` → `account_id`.

Создайте D1, если базы ещё нет:

```sh
npx wrangler d1 create dropchat
```

Полученный `database_id` впишите в
`worker/wrangler.jsonc` → `d1_databases[0].database_id`.

Проверьте конфиги без публикации:

```sh
npx wrangler deploy --dry-run --config worker/wrangler.jsonc
npx wrangler deploy --dry-run --config drive-gateway/wrangler.jsonc
```

Примените миграции к remote D1:

```sh
npx wrangler d1 migrations apply dropchat --remote --config worker/wrangler.jsonc
npx wrangler d1 migrations list dropchat --remote --config worker/wrangler.jsonc
```

### Durable Objects

В конфигах должны использоваться SQLite-backed Durable Objects:

- `worker/wrangler.jsonc` → `Hub`, `new_sqlite_classes`;
- `drive-gateway/wrangler.jsonc` → `TokenKeeper`, `SessionStore`,
  `new_sqlite_classes`.

Не заменяйте на `new_classes`: на бесплатном тарифе нужны SQLite-backed
Durable Objects.

### Cron

В `worker/src/index.ts` есть `scheduled`-обработчик retention. Оставьте
`triggers.crons` в `worker/wrangler.jsonc`. Если удаляете `scheduled` из кода,
удалите и `triggers.crons`, иначе deploy/cron будет ссылаться на отсутствующий
обработчик.

## 2. Secrets

Сгенерируйте значения локально и сохраните их:

```sh
export SERVER_SALT="$(openssl rand -base64 32)"
export DOWNLOAD_SIGNING_KEY="$(openssl rand -base64 32)"
export INTERNAL_KEY="$(openssl rand -base64 32)"
```

`INTERNAL_KEY` должен быть одинаковым в основном Worker и `drive-gateway`.

### drive-gateway

Загрузите Google-секреты из локального `drive-gateway/.dev.vars`:

```sh
set -a
. drive-gateway/.dev.vars
set +a

printf '%s' "$GOOGLE_CLIENT_ID"     | npx wrangler secret put GOOGLE_CLIENT_ID     --config drive-gateway/wrangler.jsonc
printf '%s' "$GOOGLE_CLIENT_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET --config drive-gateway/wrangler.jsonc
printf '%s' "$GOOGLE_REFRESH_TOKEN" | npx wrangler secret put GOOGLE_REFRESH_TOKEN --config drive-gateway/wrangler.jsonc
printf '%s' "$DRIVE_FOLDER_ID"      | npx wrangler secret put DRIVE_FOLDER_ID      --config drive-gateway/wrangler.jsonc
printf '%s' "$INTERNAL_KEY"         | npx wrangler secret put INTERNAL_KEY         --config drive-gateway/wrangler.jsonc
```

Проверить имена секретов без значений:

```sh
npx wrangler secret list --config drive-gateway/wrangler.jsonc
```

### worker

```sh
printf '%s' "$SERVER_SALT"          | npx wrangler secret put SERVER_SALT          --config worker/wrangler.jsonc
printf '%s' "$DOWNLOAD_SIGNING_KEY" | npx wrangler secret put DOWNLOAD_SIGNING_KEY --config worker/wrangler.jsonc
printf '%s' "$INTERNAL_KEY"         | npx wrangler secret put INTERNAL_KEY         --config worker/wrangler.jsonc

npx wrangler secret list --config worker/wrangler.jsonc
```

### WEB_ORIGIN

В `worker/wrangler.jsonc` → `vars.WEB_ORIGIN` укажите **origin** web без пути:

```text
https://<github-user>.github.io
```

Для custom domain — `https://dropchat.example.com`.

Неправильно: `https://<user>.github.io/dropchat/`. Браузер отправляет Origin без
path, и CORS не совпадёт.

## 3. Деплой gateway, затем Worker

```sh
npm run deploy --workspace @dropchat/drive-gateway
npm run deploy --workspace @dropchat/worker
```

Проверьте bindings в выводе Wrangler: `DB`, `HUB`, `DRIVE` и все vars. Если
`DRIVE` не разрешается, проверьте имя gateway и порядок деплоя.

## 4. Web и GitHub Pages

Web публикуется workflow `.github/workflows/pages.yml` после успешного CI на
`main`.

В GitHub → Settings → Secrets and variables → Actions → Variables задайте:

| Variable | Пример | Назначение |
| --- | --- | --- |
| `VITE_API_URL` | `https://dropchat-worker.<account>.workers.dev` | Worker без `/api` |
| `VITE_BASE` | `/dropchat/` | Project Pages; для user site — `/` |

Локальная проверка сборки:

```sh
VITE_API_URL="https://dropchat-worker.<account>.workers.dev" \
VITE_BASE="/dropchat/" \
npm run build --workspace @dropchat/web
```

Содержимое для публикации: `web/dist`.

В текущем UI нет path-based маршрутов, поэтому fallback для SPA не требуется.
Если появятся прямые URL, используйте hash-based routing или настройте fallback.

## 5. Проверка после деплоя

### Worker health

```sh
curl -sS https://dropchat-worker.<account>.workers.dev/api/health
```

Ожидается:

```json
{"ok":true,"app":"DropChat"}
```

### CORS

Разрешённый origin:

```sh
curl -i -X OPTIONS \
  "https://dropchat-worker.<account>.workers.dev/api/devices" \
  -H "Origin: https://<github-user>.github.io" \
  -H "Access-Control-Request-Method: POST"
```

Ожидается `204` и `Access-Control-Allow-Origin` с вашим origin.

Чужой origin:

```sh
curl -i -X OPTIONS \
  "https://dropchat-worker.<account>.workers.dev/api/devices" \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST"
```

`Access-Control-Allow-Origin` должен отсутствовать.

### Gateway не публичен

```sh
curl -i https://dropchat-drive-gateway.<account>.workers.dev/
```

Не должно быть рабочего API. Ожидается 404/отказ соединения. В Cloudflare
Dashboard у gateway не должно быть routes, а `workers_dev` и `preview_urls`
выключены.

### UI и файлы

1. Открыть production Pages URL на двух устройствах.
2. Связать устройства через nearby request или invite.
3. Отправить текст и файл.
4. Проверить, что в сообщениях отображается транспорт `локально` или
   `интернет`.
5. Скачать облачный файл и убедиться, что в Network нет Google URL/токенов.
6. Проверить, что в задеплоенном JS нет секретов.

## 6. Диагностика

| Симптом | Причина | Что делать |
| --- | --- | --- |
| `502 storage_failed` на `/api/files/init` | `INTERNAL_KEY` не совпадает | одинаковый secret в двух Worker |
| `401` от gateway | неверный `X-Internal-Key` | проверить `INTERNAL_KEY` |
| `503` на файлах | `CLOUD_UPLOADS_ENABLED=false` | включить в `worker/wrangler.jsonc` |
| `413` | превышен `MAX_FILE_SIZE` | увеличить лимит или уменьшить файл |
| `429` | quota или rate limit | проверить defaults и `Retry-After` |
| `invalid_grant` Google | refresh token отозван/истёк | перевыпустить по Google-гайду |
| Pages показывает старый UI | workflow не завершён | проверить Actions и cache |
| CORS ошибка | `WEB_ORIGIN` содержит path | оставить только origin |
