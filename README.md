# DropChat

DropChat — личное приложение для передачи текста и файлов между своими
устройствами без аккаунтов и паролей. Каждый чат соответствует устройству.
Текущий этап: **Stage 0 — каркас монорепозитория и тестовая инфраструктура**.

## Структура

- `web` — Vite + React 18 + TypeScript + Tailwind, мобильный интерфейс.
- `worker` — основной Cloudflare Worker на Hono, D1, Durable Object `Hub`, Cron.
- `drive-gateway` — отдельный Worker без публичного URL; единственное место с
  Google credentials. Доступен только через service binding `DRIVE`.
- `shared` — общие TypeScript-типы и чистые функции.
- `docs/manual-tests.md` — обязательные ручные проверки для сценариев, которые
  нельзя автоматизировать.
- `worker/migrations` — миграции D1 (наполняются на Stage 1).
- `scripts` — служебные скрипты (наполняются на Stage 5).

## Выбранные версии

Версии проверены по официальной документации Cloudflare, Vitest и Vite на
момент Stage 0.

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
pool-workers. Переход на новый пакет потребует отдельного решения.

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
```

Команды внутри конкретного пакета:

```sh
npm test --workspace @dropchat/web
npm run test:watch --workspace @dropchat/worker
npm run coverage --workspace @dropchat/drive-gateway
```

## Локальный запуск

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

## Безопасность на текущем этапе

- Google credentials не попадают в `/web` и основной Worker.
- `drive-gateway` не имеет публичного маршрута.
- В репозитории нет Worker secrets; используются placeholders.
- `npm audit --omit=dev` на Stage 0 не находит уязвимостей в production
  зависимостях. Предупреждения в dev-зависимостях связаны с тестовым стеком
  Cloudflare и будут пересмотрены на Stage 12.
