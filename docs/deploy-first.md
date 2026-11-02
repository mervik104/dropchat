# DropChat: первый ручной деплой

Этот гайд описывает первый ручной деплой Cloudflare Worker'ов и web на GitHub
Pages. **Не запускайте `wrangler login` и `wrangler secret put` автоматически в
CI/ассистенте**: выполните шаги сами в своём терминале.

Порядок важен: **сначала `drive-gateway`, затем основной Worker**, потому что
service binding `DRIVE` требует уже существующий Worker-шлюз.

## 0. Что понадобится

- Node.js 24+ и npm.
- Cloudflare-аккаунт.
- Google OAuth client, refresh token и папка DropChat из
  `docs/google-cloud-setup.md`.
- GitHub-репозиторий для web.
- Сохранённые в менеджере паролей значения:
  - `SERVER_SALT`;
  - `DOWNLOAD_SIGNING_KEY`;
  - `INTERNAL_KEY`.

Не коммитьте `.dev.vars`, токены или secrets.

## 1. Wrangler login и D1

```sh
npx wrangler login
npx wrangler whoami
```

`whoami` покажет Account ID. Впишите его в оба конфига:

- `worker/wrangler.jsonc` → `account_id`;
- `drive-gateway/wrangler.jsonc` → `account_id`.

Создайте D1:

```sh
npx wrangler d1 create dropchat
```

Команда выведет `database_id`. Впишите его в
`worker/wrangler.jsonc` → `d1_databases[0].database_id`.
Если имя базы отличается от `dropchat`, обновите `database_name` и команды
миграций ниже.

Проверьте конфиг Worker без публикации:

```sh
npx wrangler deploy --dry-run --config worker/wrangler.jsonc
npx wrangler deploy --dry-run --config drive-gateway/wrangler.jsonc
```

Примените миграции к **remote** D1:

```sh
npx wrangler d1 migrations apply dropchat --remote --config worker/wrangler.jsonc
```

Проверить список:

```sh
npx wrangler d1 migrations list dropchat --remote --config worker/wrangler.jsonc
```

### Durable Objects на бесплатном тарифе

Проверьте, что в конфигах используется `new_sqlite_classes`, а не
`new_classes`:

- `worker/wrangler.jsonc` → `Hub`;
- `drive-gateway/wrangler.jsonc` → `TokenKeeper`, `SessionStore`.

В текущем репозитории это уже так. Не меняйте на `new_classes` — на бесплатном
тарифе нужны SQLite-backed Durable Objects.

### Cron и scheduled

В `worker/src/index.ts` есть `scheduled`-обработчик. С Stage 7 он запускает
retention/cleanup. Поэтому `triggers.crons` нужно оставить.
Если вы временно удаляете `scheduled` из кода, удалите и секцию
`triggers.crons` из `worker/wrangler.jsonc`, иначе деплой/cron будут ссылаться
на отсутствующий обработчик.

## 2. Секреты

Сгенерируйте новые значения **локально** и сохраните их:

```sh
export SERVER_SALT="$(openssl rand -base64 32)"
export DOWNLOAD_SIGNING_KEY="$(openssl rand -base64 32)"
export INTERNAL_KEY="$(openssl rand -base64 32)"
```

`INTERNAL_KEY` должен быть **одинаковым** в основном Worker и
`drive-gateway`.

### drive-gateway secrets

Сначала загрузите Google-секреты из локального `drive-gateway/.dev.vars`.
Не печатайте их:

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

Проверить имена секретов (значения не показываются):

```sh
npx wrangler secret list --config drive-gateway/wrangler.jsonc
```

### Основной Worker secrets

```sh
printf '%s' "$SERVER_SALT"          | npx wrangler secret put SERVER_SALT          --config worker/wrangler.jsonc
printf '%s' "$DOWNLOAD_SIGNING_KEY" | npx wrangler secret put DOWNLOAD_SIGNING_KEY --config worker/wrangler.jsonc
printf '%s' "$INTERNAL_KEY"         | npx wrangler secret put INTERNAL_KEY         --config worker/wrangler.jsonc
```

Проверить:

```sh
npx wrangler secret list --config worker/wrangler.jsonc
```

### WEB_ORIGIN

В `worker/wrangler.jsonc` задайте `vars.WEB_ORIGIN` равным **origin** web без
пути:

```text
https://<github-user>.github.io
```

Для custom domain — `https://dropchat.example.com`.
Неправильно: `https://<user>.github.io/dropchat/` — браузер отправляет Origin без
path, и CORS не совпадёт.

## 3. Деплой gateway, затем Worker

Сначала:

```sh
npx wrangler deploy --config drive-gateway/wrangler.jsonc
```

Проверьте, что у gateway нет публичного URL:

```sh
curl -i https://dropchat-drive-gateway.<account-subdomain>.workers.dev/
```

Ожидается отказ/404, а не рабочий API: в конфиге уже стоят
`workers_dev: false` и `preview_urls: false`, публичных routes нет.

Затем основной Worker:

```sh
npx wrangler deploy --config worker/wrangler.jsonc
```

Wrangler должен показать bindings:
`DB`, `HUB`, `DRIVE`, все vars. Если `DRIVE` не разрешается, проверьте имя
`drive-gateway` и порядок деплоя.

## 4. Сборка web для GitHub Pages

Соберите вручную с API URL Worker и base репозитория:

```sh
VITE_API_URL="https://dropchat-worker.stepanenkoboris064.workers.dev" \
VITE_BASE="/<repository-name>/" \
npm run build --workspace @dropchat/web
```

- `VITE_API_URL` — полный URL Worker без `/api` на конце.
- `VITE_BASE` — `/<repository-name>/` для project pages GitHub.
- Для пользовательского site или custom domain: `VITE_BASE=/`.
- Содержимое для публикации: `web/dist`.

В текущем UI нет path-based маршрутов, поэтому GitHub Pages не требует
fallback. Для будущей навигации используйте **HashRouter**, чтобы избежать 404
на прямых URL.

Опубликуйте `web/dist` в GitHub Pages вручную или через будущий deploy workflow
(Stage 10). Перед публикацией убедитесь, что в бандле нет секретов: web знает
только API URL.

## 5. Проверка после деплоя

### Worker health

```sh
curl -sS https://dropchat-worker.<account-subdomain>.workers.dev/api/health
```

Ожидается:

```json
{"ok":true,"app":"DropChat"}
```

### CORS

Разрешённый origin:

```sh
curl -i -X OPTIONS \
  "https://dropchat-worker.<account-subdomain>.workers.dev/api/devices" \
  -H "Origin: https://<github-user>.github.io" \
  -H "Access-Control-Request-Method: POST"
```

Ожидается `204` и `Access-Control-Allow-Origin` с вашим origin.

Чужой origin:

```sh
curl -i -X OPTIONS \
  "https://dropchat-worker.<account-subdomain>.workers.dev/api/devices" \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST"
```

`Access-Control-Allow-Origin` должен отсутствовать.

### Gateway не публичен

```sh
curl -i https://dropchat-drive-gateway.<account-subdomain>.workers.dev/
```

Не должно быть рабочего endpoint (`200` с API). Ожидается 404/отказ.
Проверьте также, что в Cloudflare Dashboard у gateway нет routes и
`workers.dev` выключен.

### Google Drive

1. Откройте web на GitHub Pages с телефона.
2. Создайте invite-код на компьютере и свяжите телефон.
3. Отправьте файл с телефона.
4. Скачайте его на компьютер по кнопке «Скачать».
5. Убедитесь, что скачивание идёт attachment и не открывается как HTML/SVG.
6. Проверьте `GET /api/health`.
7. Проверьте, что в Network нет Google URL/токенов, только запросы к вашему
   Worker и signed download URL.

### Если файл не загружается

- `502 storage_failed` на `/api/files/init` → `INTERNAL_KEY` в двух Worker не
  совпадает.
- `401` от gateway → проверьте `X-Internal-Key` / секрет.
- `503` → `CLOUD_UPLOADS_ENABLED` выключен.
- `413` → `MAX_FILE_SIZE`.
- `429` → quota или rate limit.
- Ошибка Google `invalid_grant` → перевыпустите refresh token по
  `docs/google-cloud-setup.md`.
