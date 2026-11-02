# Ручные проверки DropChat

Автоматические тесты покрывают бизнес-логику, HTTP-контракты и компоненты UI.
Реальные WebRTC-соединения, Google Drive, Android WebView и особенности ОС
проверяются вручную по чек-листам ниже.

## Stage 0 — локальный каркас

1. Выполнить `npm ci`.
2. Выполнить `npm run typecheck`, `npm run lint`, `npm test`, `npm run coverage`.
3. В отдельном терминале запустить `npm run dev --workspace @dropchat/worker`.
4. Проверить `curl http://127.0.0.1:8787/api/hello` — ожидается
   `{"app":"DropChat","protocol":1,"runtime":"worker"}`.
5. Проверить `curl http://127.0.0.1:8787/api/health` — ожидается
   `{"ok":true,"app":"DropChat"}`; это подтверждает реальный локальный D1.
6. В отдельном терминале запустить `npm run dev --workspace @dropchat/web`.
7. Открыть `http://127.0.0.1:5173/` — ожидается заголовок DropChat и статус
   «Сервер доступен».
8. Остановить оба dev-сервера.

## Stage 1 — регистрация, auth, ip_group, /api/peers

1. Выполнить `cp worker/.dev.vars.example worker/.dev.vars`.
2. Выполнить `npm run db:migrate:local`.
3. Запустить Worker: `npm run dev --workspace @dropchat/worker`.
4. Выполнить `npm run smoke:stage1` — ожидается
   `Local peer discovery OK` и `Stage 1 smoke test passed.`
5. Проверить отсутствие токена:
   `curl -i http://127.0.0.1:8787/api/peers` — ожидается `401` и
   `{"error":"unauthorized"}`, без эха токена.
6. Зарегистрировать устройство вручную и убедиться, что ответ содержит профиль,
   но не содержит `secret`, `secret_hash` или `ip_group`.
7. Проверить preflight:
   `curl -i -X OPTIONS http://127.0.0.1:8787/api/devices -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST'`
   — ожидается `204` и `Access-Control-Allow-Origin: http://localhost:5173`.
8. Повторить preflight с `Origin: https://evil.example` — заголовок
   `Access-Control-Allow-Origin` должен отсутствовать.
9. Перезапустить Worker и повторить `npm run smoke:stage1` — регистрация и
   локальное обнаружение должны снова работать на сохранённой D1.
10. Остановить Worker.
