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
