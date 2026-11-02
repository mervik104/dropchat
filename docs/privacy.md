# Политика конфиденциальности / Privacy Policy

**Последнее обновление / Last updated:** 2 ноября 2026 / November 2, 2026

---

## Русская версия

### О сервисе
DropChat — личное приложение для передачи текста и файлов между устройствами. Аккаунтов, паролей и регистрации по email или телефону нет.

### Какие данные хранятся
- **Идентификатор устройства** (случайный) и **хеш** секретного ключа устройства. Сам ключ хранится только на вашем устройстве.
- **Имя устройства и платформа**, которые вы указываете в настройках.
- **Сетевая метка**: необратимый хеш вашего IP-адреса, нужный для показа устройств из одной сети. Сам IP-адрес не сохраняется.
- **Сообщения**: текст и метаданные файлов (имя, размер, тип). Хранятся **30 дней**, затем удаляются автоматически.
- **Файлы** при передаче через облако: хранятся в Google Drive владельца сервиса, в отдельной папке, под случайными именами. Удаляются автоматически через **30 дней**.
- Файлы, переданные напрямую между устройствами (локальный режим), на серверах не хранятся.

### Как используются данные
Только для работы сервиса: доставки сообщений и файлов между связанными устройствами. Данные не используются для рекламы, профилирования или обучения моделей. Данные **не продаются и не передаются третьим лицам**.

### Инфраструктура
Сервис работает на Cloudflare (Workers, D1) и использует Google Drive API для хранения файлов. Эти компании обрабатывают данные как технические подрядчики в соответствии со своими политиками.

### Использование данных Google
Приложение запрашивает единственное разрешение `https://www.googleapis.com/auth/drive.file`. Оно даёт доступ только к файлам, созданным самим приложением, в Google Drive владельца сервиса. Использование и передача информации, полученной через API Google, соответствуют [Политике в отношении пользовательских данных в сервисах API Google](https://developers.google.com/terms/api-services-user-data-policy), включая требования об ограниченном использовании (Limited Use).

### Удаление данных
Вы можете в любой момент отвязать устройство или сбросить identity в настройках. Чтобы запросить удаление ваших данных, напишите на **YOUR_EMAIL@example.com**. Без запроса все сообщения и файлы удаляются автоматически через 30 дней.

### Изменения
Эта политика может обновляться. Актуальная версия всегда находится на этой странице.

---

## English version

### About
DropChat is a personal app for transferring text and files between devices. There are no accounts, passwords, or sign-ups with email or phone number.

### Data we store
- **Device ID** (random) and a **hash** of the device secret. The secret itself is stored only on your device.
- **Device name and platform**, as set by you in the settings.
- **Network label**: an irreversible hash of your IP address, used to show devices on the same network. The IP address itself is not stored.
- **Messages**: text and file metadata (name, size, type). Kept for **30 days**, then deleted automatically.
- **Files** sent via cloud mode: stored in the service owner's Google Drive, in a dedicated folder, under random names. Deleted automatically after **30 days**.
- Files sent directly between devices (local mode) are not stored on any server.

### How data is used
Solely to operate the service: delivering messages and files between linked devices. Data is not used for advertising, profiling, or model training. Data is **never sold or shared with third parties**.

### Infrastructure
The service runs on Cloudflare (Workers, D1) and uses the Google Drive API to store files. These providers process data as technical subcontractors under their own policies.

### Google user data
The app requests a single scope: `https://www.googleapis.com/auth/drive.file`. It only grants access to files created by the app itself, in the service owner's Google Drive. The app's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

### Deletion
You can unlink a device or reset your identity in the settings at any time. To request deletion of your data, email **YOUR_EMAIL@example.com**. Otherwise, all messages and files are deleted automatically after 30 days.

### Changes
This policy may be updated. The current version is always available on this page.
