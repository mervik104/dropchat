# DropChat

DropChat — личное приложение для передачи текста и файлов между своими
устройствами без аккаунтов и паролей. Каждый чат соответствует устройству.
Текущий этап: **Stage 6 — облачная передача файлов через DriveGatewayAdapter, подписанные ссылки и прогресс UI**.

## Структура

- `web` — Vite + React 18 + TypeScript + Tailwind, мобильный интерфейс.
- `worker` — основной Cloudflare Worker на Hono, D1, Durable Object `Hub`, Cron.
- `drive-gateway` — отдельный Worker без публичного URL; единственное место с
  Google credentials. Доступен только через service binding `DRIVE`.
- `shared` — общие TypeScript-типы и чистые функции.
- `docs/manual-tests.md` — обязательные ручные проверки для сценариев, которые
  нельзя автоматизировать.
- `worker/migrations` — миграции D1.
- `scripts` — служебные скрипты (наполняются на Stage 5).

## Выбранные версии

Версии проверены по официальной документации Cloudflare, Vitest и Vite на
момент Stage 1.

| Пакет | Версия | Причина |
| --- | --- | --- |
| Vitest | 4.1.12 | `@cloudflare/vitest-pool-workers` требует `vitest@^4.1.0`; Vitest 5 несовместим с выбранным pool |
| @cloudflare/vitest-pool-workers | 0.23.0 | Последняя версия пакета, зафиксированного в требованиях проекта |
| Wrangler | 4.156.1 | Актуальный Wrangler CLI; pool-workers внутри использует собственный `wrangler@4.124.0` |
| Vite | 7.3.7 | Совместим с Vitest 4.1, React 18 и `@vitejs/plugin-react` |
| @vitejs/plugin-react | 5.2.0 | Поддерживает Vite 7 и React 18 |
| React / React DOM | 18.3.1 | Зафиксированная версия React 18 |
| TypeScript | 6.0.3 | Поддерживается `typescript-eslint` 8.72.1 (диапазон `<6.1.0`) |
| jsdom | 30.1.3 | Требует Node.js `^22.22.2`, `^24.15.0` или `>=26` |
| @testing-library/react | 16.3.3 | Поддерживает React 18 |
| @testing-library/user-event | 14.6.8 | Пользовательские сценарии UI |
| @vitest/coverage-istanbul | 4.1.12 | Istanbul обязателен для Workers pool |
| @vitest/coverage-v8 | 4.1.12 | V8 для `web` и `shared` |

Примечание: `@cloudflare/vitest-pool-workers` помечен авторами как deprecated в
пользу `@cloudflare/vitest-plugin`. По требованиям проекта используется именно
pool-workers; **осознанно оставляем его до Stage 12**, чтобы не менять тестовый
стек посреди разработки. На Stage 12 вернёмся к вопросу миграции отдельно.

`compatibility_date` в Wrangler-конфигах установлен в `2026-08-22`: это
максимальная дата, которую поддерживает workerd, входящий в pool-workers 0.23.0.
Не увеличивайте её без обновления тестового стека.

## Требования

- Node.js 24 (рекомендуется; локально проверено также на Node.js 26).
- npm 11 (npm workspaces).
- Для деплоя: аккаунт Cloudflare и Wrangler CLI из зависимостей проекта.

## Установка

```sh
npm ci
```

## Команды

```sh
npm test                 # все тесты во всех пакетах
npm run coverage         # покрытие + порог 100% в каждом пакете
npm run typecheck        # tsc --noEmit во всех пакетах
npm run lint             # ESLint
npm run build            # dry-run сборка Worker'ов и production build web
npm run db:migrate:local # применить миграции D1 к локальной базе
npm run smoke:stage1     # curl smoke-тест Stage 1 (нужен запущенный Worker)
npm run smoke:stage4     # linking через nearby request и invite
npm run dev:workers      # оба Worker одной командой Wrangler
```

Команды внутри конкретного пакета:

```sh
npm test --workspace @dropchat/web
npm run test:watch --workspace @dropchat/worker
npm run coverage --workspace @dropchat/drive-gateway
```

## Локальный запуск

Подготовить локальные secrets и базу:

```sh
cp worker/.dev.vars.example worker/.dev.vars
npm run db:migrate:local
```

Терминал 1 — основной Worker:

```sh
npm run dev --workspace @dropchat/worker
```

Терминал 2 — web (Vite проксирует `/api` на `http://127.0.0.1:8787`):

```sh
npm run dev --workspace @dropchat/web
```

Открыть `http://127.0.0.1:5173/`. Приветственный endpoint Worker:
`http://127.0.0.1:8787/api/hello`.

Проверка Stage 1 через curl:

```sh
npm run smoke:stage1
```

Скрипт регистрирует два устройства, проверяет 401 без токена и автоматическое
появление второго устройства в `local` секции `/api/peers`.

## Web Stage 2

- Identity генерируется на устройстве: UUID `deviceId` + 32 случайных байта
  `secret` в base64url.
- Identity хранится в `localStorage` под ключом `dropchat.identity.v1`.
- При запуске приложение загружает `/api/peers`; если устройство ещё не
  зарегистрировано (`401`), оно регистрируется и запрос повторяется. Повторные
  загрузки страницы не создают новых регистраций.
- Messenger layout: список чатов слева, диалог справа; на мобильном — отдельные
  экраны с кнопкой «Назад».
- Верх списка: «Рядом», кнопка «Код приглашения» (пока disabled до Stage 4) и
  настройки с именем устройства, платформой и темой.
- Тема следует системной через `prefers-color-scheme`.
- Все бизнес-модули (`identity`, `api`, `workspace`, `socket`, `messages`) не
  зависят от React и принимают fetch/random/storage/WebSocket через интерфейсы.
- Если сервер отверг сохранённую identity (`401` + `409`), новая identity не
  создаётся: показываются действия «Повторить», «Импортировать identity» и
  «Сбросить identity». `429` при регистрации показывается отдельно.
- Настройки позволяют сохранить имя на сервере (`PATCH /api/devices/me`),
  экспортировать identity в текст и импортировать её обратно.
- В `platform/storage.ts` при старте вызывается `navigator.storage.persist()`.

## API Stage 1

- `POST /api/devices` — регистрация. Тело:
  `{deviceId, secret, name?, platform?}`. Возвращает профиль без секретов.
  `deviceId`: `[A-Za-z0-9_-]{8,128}`, `secret`: `[A-Za-z0-9_-]{32,256}`.
- `GET /api/peers` — требует
  `Authorization: Bearer <deviceId>.<secret>`. Возвращает
  `{local: PeerSummary[], linked: PeerSummary[]}`.
- Auth middleware обновляет `last_seen` и `ip_group`, но не чаще одного раза
  в 15 секунд. Смена `ip_group` записывается сразу.
- `ip_group = SHA-256(SERVER_SALT + normalizedIp)`, для IPv6 используется /64.
- Онлайн определяется по открытым WebSocket-соединениям Hub, а не по
  `last_seen`. `last_seen` остаётся метаданными HTTP-активности.
- `PATCH /api/devices/me` — обновляет `name` (1–64 символа после trim) и/или
  `invisible` (boolean). Требует auth.
- `POST /api/devices` ограничен по `ip_group`: по умолчанию 20 попыток в час.
  Env-переменная: `REGISTRATION_LIMIT_PER_HOUR`. При превышении возвращается
  `429 {"error":"rate_limited"}` и `Retry-After`.
- CORS разрешён только для `WEB_ORIGIN` и `http://localhost:*` /
  `http://127.0.0.1:*`, включая preflight `OPTIONS`.

Для локальной проверки service binding можно отдельно запустить gateway:

```sh
npm run dev --workspace @dropchat/drive-gateway -- --port 8788
```

Основной Worker при локальном запуске использует локальный реестр Wrangler.
Если gateway не запущен, запросы к `DRIVE` будут недоступны, но `/api/hello` и
`/api/health` продолжат работать.

## Тесты и покрытие

- `/worker` и `/drive-gateway`: `@cloudflare/vitest-pool-workers`, настоящие
  локальные D1, Durable Objects и Miniflare; покрытие через Istanbul.
- `/web`: Vitest + jsdom + Testing Library; покрытие через V8.
- `/shared`: Vitest; покрытие через V8.
- Порог в каждом пакете: 100% lines, branches, functions, statements.
- Coverage-исключения разрешены только для тестов, конфигов, type-only файлов,
  entry-point-файлов, которые только связывают модули, `web/src/main.tsx` и
  `web/src/platform/**`. Все исключения перечислены в `vitest.config.ts` с
  комментариями.

## CI

`.github/workflows/ci.yml` запускается на каждый push и pull request. Он
выполняет `npm ci`, typecheck, lint, тесты, coverage gate и сборку. Любая ошибка
останавливает pipeline. После `git remote add` и push workflow готов к работе
без дополнительных правок.

## Git и GitHub Pages

Репозиторий инициализируется локально с веткой `main`; remote не задан.
`base` для Vite вынесен в `VITE_BASE` с дефолтом `/`:

```sh
VITE_BASE=/dropchat/ npm run build --workspace @dropchat/web
```

Для GitHub Pages project site укажите `VITE_BASE=/имя-репозитория/`, для
custom domain или пользовательского site — `/`.

## Что заменить перед деплоем

Все значения ниже — **placeholders**, их нужно заменить вручную.

1. `worker/wrangler.jsonc`:
   - `account_id` — ваш Cloudflare account ID.
   - `d1_databases[0].database_name` и `database_id` — после
     `wrangler d1 create dropchat`; впишите реальный `database_id`.
   - Перед первым деплоем примените миграции к remote D1:
     `npx wrangler d1 migrations apply dropchat --remote --config worker/wrangler.jsonc`.
   - `services[0].service` — имя задеплоенного `drive-gateway`, если вы
     переименовали Worker.
   - `vars.WEB_ORIGIN` — реальный origin web-приложения.
   - При необходимости `triggers.crons` и лимиты квот.
2. Secrets основного Worker (не хранить в `wrangler.jsonc`):
   - `SERVER_SALT`
   - `DOWNLOAD_SIGNING_KEY`
   - `INTERNAL_KEY`

   ```sh
   npx wrangler secret put SERVER_SALT --config worker/wrangler.jsonc
   npx wrangler secret put DOWNLOAD_SIGNING_KEY --config worker/wrangler.jsonc
   npx wrangler secret put INTERNAL_KEY --config worker/wrangler.jsonc
   ```

3. `drive-gateway/wrangler.jsonc`:
   - `account_id` — ваш Cloudflare account ID.
   - `name` — должен совпадать с `services[0].service` в основном Worker.
4. Secrets `drive-gateway` (появятся на Stage 5):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `DRIVE_FOLDER_ID`
   - `INTERNAL_KEY` — то же значение, что и в основном Worker.
5. GitHub/Pages:
   - remote репозитория;
   - `VITE_BASE`;
   - `VITE_API_URL` для production-сборки web.
6. Реальные домены и маршруты Cloudflare, если они будут использоваться.
7. `compatibility_date` — только после проверки совместимости с тестовым
   стеком.

`drive-gateway` обязан оставаться без публичного URL: в конфиге уже заданы
`workers_dev: false` и `preview_urls: false`, публичные `routes` не добавлять.

## API Stage 3

- `POST /api/ws-ticket` — auth; возвращает одноразовый тикет на 30 секунд.
  В D1 хранится только SHA-256 тикета.
- `GET /api/ws?ticket=...` — обмен тикета на WebSocket. Тикет одноразовый;
  device secret в URL не передаётся.
- `GET /api/chats/:peerId/messages?before=&limit=` — только для linked peers.
  `limit` 1–100 (default 50), курсор `before` — id сообщения.
- `POST /api/chats/:peerId/messages` — `{kind:"text", text, clientId}`; текст
  1–4000 символов, `MAX_MESSAGE_LENGTH=4000`. `clientId` делает отправку
  идемпотентной: повтор с тем же id и содержимым возвращает существующее
  сообщение, без дубля.
- Rate limits (env, defaults):
  - `MESSAGE_LIMIT_PER_MINUTE=60` на устройство;
  - `WS_TICKET_LIMIT_PER_MINUTE=30` на устройство;
  - `PROFILE_UPDATE_LIMIT_PER_HOUR=30` на устройство.
- WebSocket-клиент переподключается с exponential backoff + jitter; после
  реконнекта заново загружает presence и пропущенные сообщения открытого чата.
- `expires_at = created_at + RETENTION_DAYS * 24h`; по умолчанию 30 дней.
- Hub хранит открытые сокеты, рассылает `message.new` и `presence`, а
  `/api/peers` получает online напрямую из Hub.
- Heartbeat в D1 не пишется: presence считается по открытым сокетам. Это
  выбрано, чтобы не делать запись в D1 каждые 25 секунд на устройство.

## Google Drive — настройка

Подробный гайд: [docs/google-cloud-setup.md](docs/google-cloud-setup.md).

Скрипт `scripts/get-refresh-token.mjs` создаёт папку DropChat и печатает
`GOOGLE_REFRESH_TOKEN` / `DRIVE_FOLDER_ID`. Секреты никогда не коммитятся:
локально — `drive-gateway/.dev.vars`, деплой — `wrangler secret put`.

Локальный запуск обоих Worker одной командой:

```sh
npm run dev:workers
# или
npx wrangler dev -c worker/wrangler.jsonc -c drive-gateway/wrangler.jsonc --persist-to .wrangler/state
```

## Задача для Cron Stage 7

- Удалять просроченные `ws_tickets` (`expires_at < now`).
- Удалять старые записи endpoint/registration rate limit и `invite_failures`.
- Удалять просроченные `invites` и старые `peer_requests`.
- Чистить `blocks` при удалении/блокировке устройств, если это понадобится.
- Удалять файлы/сообщения по retention.

## API Stage 4

- `GET /api/peers` теперь также возвращает `incomingRequests`.
- `POST /api/peers/request {toDeviceId}` — запрос только к видимому устройству
  из того же `ip_group`; создаёт pending-запрос и шлёт `peer.request`.
- `POST /api/peers/respond {fromDeviceId, accept}` — принять/отклонить.
  Принятие создаёт строку в `peers` и шлёт `peer.linked` обоим устройствам.
- `POST /api/invites` — создаёт **crypto-random** 6-значный код на 5 минут.
- `POST /api/invites/redeem {code}` — связывает устройства.
  - не более 5 неудачных попыток на устройство за 10 минут (`429`);
  - `invites.attempts` увеличивается при неудачном redeem существующего
    кода; после 5 таких попыток код помечается использованным и умирает;
  - TTL проверяется по `expires_at`; single-use через `used`.
- Invisible mode: `PATCH /api/devices/me {invisible:true}`; устройство исчезает
  из `local`/запросов, но остаётся доступным для уже установленных связей.

## Web Stage 4

- «Рядом»: кнопка «Запрос» у nearby-устройства.
- Секция «Запросы» с кнопками «Принять» / «Отклонить».
- Диалог «Код приглашения»: создание кода и ввод чужого кода.
- Настройки: имя + чекбокс «Невидимый режим», сохраняется через PATCH.
- События `peer.request` / `peer.linked` обновляют список peers.

## Stage 5 pre-hardening

- Invite brute-force: кроме лимита на устройство добавлены лимиты на `ip_group`
  (default **20/10 мин**) и глобальный предохранитель (default **100/10 мин**),
  env: `INVITE_IP_GROUP_FAILURE_LIMIT`, `INVITE_GLOBAL_FAILURE_LIMIT`.
- `DELETE /api/peers/:id` разрывает связь; доступ к сообщениям исчезает.
- `POST /api/peers/:id/block` блокирует устройство и разрывает связь.
- Peer requests: `PEER_REQUEST_LIMIT_PER_HOUR=20`, `MAX_PENDING_PEER_REQUESTS=10`,
  `PEER_REQUEST_TTL_HOURS=24`.
- UI: меню чата с «Отвязать» / «Заблокировать»; уведомление создателю инвайта
  «Устройство X подключилось».

## drive-gateway Stage 5

- Внутренний Worker без публичного URL, доступен только через service binding
  `DRIVE`.
- Все запросы требуют `X-Internal-Key`; иначе `401`.
- `POST /init {size,mime}` создаёт resumable session; session URI хранится
  только в `SessionStore` DO и никогда не покидает gateway.
- `PUT /parts/:sessionId` принимает `Content-Range` и chunk; обрабатывает
  `308`, completion, resync через `bytes */total`.
- `GET /files/:driveFileId` пробрасывает Range и streaming.
- `DELETE /files/:driveFileId` permanent delete; `404` считается успехом.
- `GET /health` возвращает квоту Drive.
- `TokenKeeper` DO кэширует access token, обновляет за 5 минут до expiry,
  коалесцирует параллельные refresh и хранит только access token.
- Google fetch: retry с backoff на `429`, `5xx` и `403 rateLimitExceeded`;
  один retry после `401` с инвалидацией токена.
- Shared `StorageAdapter` описывает контракт для Stage 6.

## Stage 6 — файлы через облако

- `DriveGatewayAdapter` реализует shared `StorageAdapter` через binding `DRIVE`.
- File APIs:
  - `POST /api/files/init` → `{fileId, partSize: 8388608}`;
  - `PUT /api/files/:id/parts/:n` — sequential chunks + `Content-Range`;
  - `GET /api/files/:id/state` — resume;
  - `POST /api/files/:id/complete` — file message;
  - `POST /api/files/:id/link` — signed URL на 60 секунд;
  - `GET /api/files/:id/download?t=...` — без Authorization, с Range;
  - `DELETE /api/files/:id` — cancel upload.
- Ограничения (env):
  - `MAX_FILE_SIZE=5GB`;
  - `PER_DEVICE_UPLOAD_PER_24H=10GB`;
  - `PER_DEVICE_STORED_TOTAL=50GB`;
  - `GLOBAL_STORED_TOTAL=1TB`;
  - `CLOUD_UPLOADS_ENABLED=true`;
  - `FILE_INIT_LIMIT_PER_HOUR=50`;
  - `FILE_PART_LIMIT_PER_MINUTE=600`;
  - `FILE_COMPLETE_LIMIT_PER_HOUR=100`;
  - `FILE_LINK_LIMIT_PER_MINUTE=60`.
- Kill switch проверяется на `/files/init`.
- Download headers: sanitized attachment filename, `nosniff`, `application/octet-stream`;
  только whitelisted images (`png/jpeg/gif/webp/avif`) могут быть inline.
- Web: attach button, progress/cancel, file bubbles, download, hint «хранится 30 дней», «истёк».
- Клиентский upload engine: 8 MiB chunks, 3 попытки на часть с exponential backoff, resume API и abort/cancel.

### Известное ограничение Stage 6

Автоматическое продолжение после полной перезагрузки страницы требует повторного
выбора файла: браузерное хранилище `File`/File Handle будет добавлено отдельно.
Состояние на сервере и `resumeUpload` уже реализованы и протестированы.

## Ограничение текущего этапа

Retention/cron и Drive cleanup — Stage 7. Реальный Drive проверяется вручную по
чек-листу, потому что CI не имеет credentials.

## Безопасность на текущем этапе

- В D1 хранится только `SHA-256(secret)`, исходный secret никогда не
  сохраняется и не возвращается.
- Сравнение хешей выполняется без раннего выхода; неверный, отсутствующий или
  неизвестный токен возвращает одинаковый `401 {"error":"unauthorized"}`.
- `ip_group` — необратимый SHA-256; сырой IP и `SERVER_SALT` не попадают в
  ответы `/api/peers`.
- `deviceId` и `secret` валидируются по формату и длине.
- Запись touch-метаданных троттлится до одного раза в 15 секунд, чтобы снизить
  нагрузку на D1; смена сети обновляет `ip_group` немедленно.
- Регистрация устройств ограничена по `ip_group` (20/час по умолчанию).
- CORS не использует wildcard и не отдаёт заголовки посторонним origin.
- WebSocket-тикеты одноразовые, живут 30 секунд, хранятся как SHA-256.
- Текст сообщений ограничен 4000 символами; retention задаёт `expires_at`.
- В ответах API нет device secret, `secret_hash`, `ip_group` и Drive URL.
- Google credentials не попадают в `/web` и основной Worker.
- `drive-gateway` не имеет публичного маршрута.
- В репозитории нет Worker secrets; используются placeholders и локальный
  `.dev.vars` (игнорируется git).
- `npm audit --omit=dev` не находит уязвимостей в production-зависимостях.
  Предупреждения есть только в dev-зависимостях Cloudflare-тест-стека; они
  будут пересмотрены на Stage 12.
