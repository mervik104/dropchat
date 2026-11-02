# Политика конфиденциальности / Privacy Policy

**Последнее обновление / Last updated:** 2 ноября 2026 / November 2, 2026

---

## Русская версия

### О сервисе

DropChat — личное приложение для передачи текста и файлов между устройствами.
Аккаунтов, паролей и регистрации по email или телефону нет.

### Какие данные хранятся

- **Идентификатор устройства** (случайный) и **хеш** секретного ключа. Сам ключ
  хранится только на устройстве пользователя.
- **Имя устройства и платформа**, которые пользователь указывает в настройках.
- **Сетевая метка**: необратимый хеш IP-адреса, нужный для показа устройств из
  одной сети. Сам IP-адрес не сохраняется.
- **Текст через интернет-транспорт**: сохраняется в D1 и удаляется через
  **30 дней**.
- **Metadata файлов**: имя, размер, тип и транспорт. Удаляется вместе с
  сообщением через **30 дней**.
- **Файлы через облачный транспорт**: хранятся в Google Drive владельца сервиса
  в отдельной папке под случайными именами и удаляются через **30 дней**.
- **P2P-контент**: текст и файлы, переданные через открытый DataChannel, не
  сохраняются на серверах DropChat. В D1 может сохраняться только metadata
  сообщения/файла. Локальная копия P2P-сообщений хранится в `localStorage`
  браузера (до 500 последних, 30 дней) и не синхронизируется на сервер.
- **Технические лимиты**: агрегированные счётчики квот и rate limits без
  содержимого сообщений.

### Как используются данные

Только для работы сервиса: доставки сообщений и файлов между связанными
устройствами, защиты от злоупотреблений и очистки устаревших данных. Данные не
используются для рекламы, профилирования или обучения моделей и **не продаются
третьим лицам**.

### Инфраструктура

Сервис работает на Cloudflare (Workers, D1, Durable Objects) и использует Google
Drive API для облачных файлов. Эти компании обрабатывают данные как технические
подрядчики в соответствии со своими политиками.

### Использование данных Google

Приложение запрашивает единственное разрешение
`https://www.googleapis.com/auth/drive.file`. Оно даёт доступ только к файлам,
созданным самим приложением, в Google Drive владельца сервиса. Использование и
передача информации, полученной через API Google, соответствуют
[Политике в отношении пользовательских данных в сервисах API Google](https://developers.google.com/terms/api-services-user-data-policy),
включая требования об ограниченном использовании (Limited Use).

### Удаление данных

Пользователь может в любой момент отвязать устройство, заблокировать собеседника
или сбросить identity в настройках. Сообщения и облачные файлы удаляются
автоматически через 30 дней. Для запроса удаления серверных данных обратитесь к
владельцу сервиса через issues репозитория DropChat.

### Изменения

Политика может обновляться. Актуальная версия всегда находится в этом файле.

---

## English version

### About

DropChat is a personal app for transferring text and files between devices. There
are no accounts, passwords, or sign-ups with email or phone number.

### Data we store

- **Device ID** (random) and a **hash** of the device secret. The secret itself
  is stored only on the user's device.
- **Device name and platform**, as set by the user in settings.
- **Network label**: an irreversible hash of the IP address, used to show devices
  on the same network. The IP address itself is not stored.
- **Text sent over the internet transport**: stored in D1 and deleted after
  **30 days**.
- **File metadata**: name, size, type, and transport. Deleted with the message
  after **30 days**.
- **Files sent via cloud transport**: stored in the service owner's Google Drive
  in a dedicated folder under random names and deleted after **30 days**.
- **P2P content**: text and files transferred through an open DataChannel are not
  stored on DropChat servers. D1 may store only the message/file metadata. A
  local copy of P2P messages is kept in browser `localStorage` (last 500, 30 days)
  and is not synced to the server.
- **Technical limits**: aggregate quota and rate-limit counters without message
  content.

### How data is used

Solely to operate the service: deliver messages and files between linked devices,
prevent abuse, and clean up expired data. Data is not used for advertising,
profiling, or model training and is **never sold to third parties**.

### Infrastructure

The service runs on Cloudflare (Workers, D1, Durable Objects) and uses the Google
Drive API for cloud files. These providers process data as technical
subcontractors under their own policies.

### Google user data

The app requests a single scope: `https://www.googleapis.com/auth/drive.file`. It
only grants access to files created by the app itself, in the service owner's
Google Drive. The app's use and transfer of information received from Google APIs
adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

### Deletion

Users can unlink a device, block a peer, or reset their identity in settings at
any time. Messages and cloud files are deleted automatically after 30 days. To
request deletion of server-side data, contact the service owner through the
DropChat repository issues.

### Changes

This policy may be updated. The current version is always available in this file.
