# Google Cloud и Google Drive для DropChat

Этот гайд описывает настройку **личного Google Drive** как хранилища DropChat.
Приложение использует OAuth2 refresh token вашего аккаунта и только scope
`https://www.googleapis.com/auth/drive.file`.

**Важно:** никогда не отправляйте client secret, refresh token или access token
в чат/ассистенту/issue. Кладите их только в gitignored `drive-gateway/.dev.vars`
локально и через `wrangler secret put` для деплоя.

## 1. Создайте проект Google Cloud

1. Откройте https://console.cloud.google.com/
2. Сверху выберите селектор проектов → **New Project**.
3. Имя: `DropChat` (или любое).
4. Нажмите **Create** и дождитесь создания.
5. Убедитесь, что в селекторе выбран именно проект DropChat.

## 2. Включите Google Drive API

1. Меню → **APIs & Services** → **Library**.
2. Найдите **Google Drive API**.
3. Откройте и нажмите **Enable**.
4. Дождитесь статуса Enabled.

## 3. Настройте OAuth consent screen

1. **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → **Create**.
3. Заполните:
   - App name: `DropChat`
   - User support email: ваш email
   - Developer contact information: ваш email
4. **Save and Continue**.
5. На шаге **Scopes**:
   - **Add or remove scopes**;
   - вручную добавьте только:
     `https://www.googleapis.com/auth/drive.file`
   - не добавляйте `drive`, `drive.readonly`, `drive.metadata` и другие scopes.
6. **Save and Continue**.
7. На шаге **Test users** добавьте свой Google-аккаунт (если Google просит).
8. **Save and Continue** → **Back to Dashboard**.
9. Нажмите **Publish app** → **Confirm**.
   - Приложение должно быть **In production**, а **не Testing**.
   - В Testing refresh token обычно живёт только 7 дней; DropChat нужен
     долгоживущий refresh token.
   - Google может показать запрос на verification для sensitive scope. Для
     личного использования следуйте подсказкам консоли; scope остаётся только
     `drive.file`.

## 4. Создайте OAuth client

1. **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID**.
3. Application type: **Desktop app**.
4. Name: `DropChat desktop`.
5. **Create**.
6. Скопируйте **Client ID** и **Client secret**. Не публикуйте их.

## 5. Положите client id/secret в локальный `.dev.vars`

```sh
cp drive-gateway/.dev.vars.example drive-gateway/.dev.vars
```

Откройте `drive-gateway/.dev.vars` и заполните:

```dotenv
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REFRESH_TOKEN=""
DRIVE_FOLDER_ID=""
INTERNAL_KEY="dev-only-change-me"
```

`drive-gateway/.dev.vars` уже исключён в `.gitignore`. Проверьте:

```sh
git check-ignore -v drive-gateway/.dev.vars
```

`INTERNAL_KEY` должен совпадать с `INTERNAL_KEY` основного Worker при локальной
проверке; для деплоя оба секрета задаются отдельно.

## 6. Получите refresh token и создайте папку DropChat

Запустите:

```sh
node scripts/get-refresh-token.mjs
```

Скрипт:

1. Запускает loopback-сервер только на `127.0.0.1`.
2. Печатает ссылку Google OAuth с `access_type=offline` и `prompt=consent`.
3. Ждёт callback, обменивает code на токены.
4. Создаёт папку `DropChat` в вашем Drive.
5. Печатает `GOOGLE_REFRESH_TOKEN` и `DRIVE_FOLDER_ID`.

Откройте ссылку в браузере, выберите свой аккаунт и разрешите доступ. После
успеха скопируйте два значения в `drive-gateway/.dev.vars`.

Если refresh token не появился, проверьте, что consent screen опубликован и
запуск был с `prompt=consent`.

## 7. Локальный запуск Worker + drive-gateway одной командой

Запускайте оба Worker одним процессом Wrangler: первый конфиг — основной
Worker, второй — gateway, доступный только через service binding.

```sh
npx wrangler dev -c worker/wrangler.jsonc -c drive-gateway/wrangler.jsonc --persist-to .wrangler/state
```

Или из корня:

```sh
npm run dev:workers
```

Основной Worker доступен на `http://127.0.0.1:8787`. `drive-gateway` не имеет
публичного URL; он доступен только основному Worker через binding `DRIVE`.

Web запускается отдельно:

```sh
npm run dev --workspace @dropchat/web
```

## 8. Деплой секретов

Сначала задеплойте `drive-gateway` (у него нет публичного маршрута), затем
основной Worker.

```sh
npx wrangler secret put GOOGLE_CLIENT_ID --config drive-gateway/wrangler.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET --config drive-gateway/wrangler.jsonc
npx wrangler secret put GOOGLE_REFRESH_TOKEN --config drive-gateway/wrangler.jsonc
npx wrangler secret put DRIVE_FOLDER_ID --config drive-gateway/wrangler.jsonc
npx wrangler secret put INTERNAL_KEY --config drive-gateway/wrangler.jsonc

npx wrangler secret put SERVER_SALT --config worker/wrangler.jsonc
npx wrangler secret put DOWNLOAD_SIGNING_KEY --config worker/wrangler.jsonc
npx wrangler secret put INTERNAL_KEY --config worker/wrangler.jsonc
```

`INTERNAL_KEY` в обоих Worker должен быть одинаковым.

Проверьте, что gateway не имеет публичного URL:

- `workers_dev: false` и `preview_urls: false` уже стоят в конфиге;
- не добавляйте routes;
- попытка открыть `<worker>.workers.dev` не должна давать рабочий API.

## 9. Ротация и отзыв

- Чтобы отозвать доступ: https://myaccount.google.com/permissions
- После отзыва старый refresh token перестанет работать.
- Перевыпуск: снова запустите `node scripts/get-refresh-token.mjs` и обновите
  секрет через `wrangler secret put`.
- Не переиспользуйте один refresh token в нескольких окружениях без понимания
  последствий.

## 10. Частые проблемы

| Симптом | Причина | Что делать |
| --- | --- | --- |
| `invalid_grant` | токен отозван/истёк/не тот client | перевыпустить refresh token |
| токен умирает через 7 дней | consent screen в Testing | перевести в Production |
| `redirect_uri_mismatch` | client не Desktop/не loopback | создать Desktop OAuth client |
| `insufficientPermissions` | неверный folder id/scope | проверить `drive.file` и `DRIVE_FOLDER_ID` |
| 403 `rateLimitExceeded` | квота Google | повторить с backoff, проверить квоты |
| папка не создалась | Drive API выключен | включить Google Drive API |
| gateway отвечает 404 локально | запущен только один Worker | запустить оба конфига одной командой |

## 11. Чек-лист

- [ ] Проект Google Cloud создан.
- [ ] Google Drive API включена.
- [ ] OAuth consent screen: только `drive.file`.
- [ ] Приложение опубликовано в Production.
- [ ] OAuth client типа Desktop app.
- [ ] Client id/secret лежат только в gitignored `.dev.vars`.
- [ ] `node scripts/get-refresh-token.mjs` создал папку и выдал refresh token.
- [ ] Оба Worker запускаются одной командой `wrangler dev` с двумя конфигами.
- [ ] Секреты задеплоены через `wrangler secret put`.
- [ ] У `drive-gateway` нет публичного URL.
