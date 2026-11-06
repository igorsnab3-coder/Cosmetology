# Отчёт по контейнеризации проекта «Yana Clinic» в Docker

**Студент:** ______________________  
**Проект:** сайт клиники / интернет-магазин косметолога с ИИ-ассистентом Jarvis  
**Дата:** 05.11.2026  
**Цель работы:** упаковать весь проект в Docker так, чтобы приложение запускалось одной командой без ручной установки Node.js, зависимостей и локальных служб.

---

## 1. Краткое описание проекта

Проект — веб-приложение косметологической клиники:

- публичный сайт и каталог услуг/товаров;
- запись на процедуры и оформление заказов;
- админ-панель;
- ИИ-чат (Jarvis) через OpenAI;
- генерация PDF (заказы, каталог);
- хранение данных в SQLite.

### Архитектура до Docker

| Компонент | Технология | Порт |
|-----------|------------|------|
| HTTP-шлюз + статика | PowerShell `serve.ps1` | 5500 |
| Frontend | React + Vite → `dist/` | — |
| AI-ядро | Node.js (`ai/`) | 5600 |
| БД | Node.js + sql.js (`db/`) | 5601 |
| PDF | Node.js + Puppeteer (`pdf/`) | 5602 |

На Windows шлюз был на PowerShell. Для Linux-контейнера Docker добавлен эквивалент на Node.js: `gateway/server.js`.

---

## 2. Что сделано для Docker

1. **Multi-stage Dockerfile**
   - стадия 1: сборка frontend (`npm run build`);
   - стадия 2: runtime-образ Node.js 20 + Chromium + сервисы `ai`, `db`, `pdf`, `gateway`.
2. **docker-compose.yml** — один сервис `yana-clinic`, порт `5500`, том для данных, монтирование секретов.
3. **entrypoint.sh** — последовательно поднимает DB → AI → PDF → Gateway.
4. **gateway/** — Node.js API-шлюз (замена `serve.ps1` внутри контейнера).
5. **.dockerignore** — исключает `node_modules`, секреты и лишние файлы из контекста сборки.
6. **.env.docker.example** — шаблон переменных окружения для контейнера.

### Схема внутри контейнера

```
Браузер → :5500 gateway
              ├─ /api/*  → db :5601 / ai :5600 / pdf :5602
              └─ статика → /app/dist
Данные   → volume yana_data (/app/data)
Секреты  → bind-mount .env (LOCALAPPDATA\YanaClinic\.env)
```

---

## 3. Требования

- Docker Desktop (проверено: Docker 29.x, Compose v5.x)
- Файл секретов с `ADMIN_PASSWORD` и (опционально) `OPENAI_API_KEY`
- По умолчанию используется: `%LOCALAPPDATA%\YanaClinic\.env`

---

## 4. Как запустить

В PowerShell из корня проекта:

```powershell
# 1) Убедиться, что Docker Desktop запущен
docker version

# 2) Собрать и запустить
docker compose up --build -d

# 3) Проверить здоровье
curl http://127.0.0.1:5500/api/health

# 4) Открыть сайт
start http://127.0.0.1:5500/
```

Остановка:

```powershell
docker compose down
```

Полная очистка контейнера (данные в volume сохраняются):

```powershell
docker compose down
```

Удалить и данные БД в Docker volume:

```powershell
docker compose down -v
```

Если секреты лежат в другом файле:

```powershell
$env:DOCKER_ENV_FILE = "C:\path\to\your.env"
docker compose up --build -d
```

---

## 5. Переменные окружения (секреты)

| Переменная | Назначение |
|------------|------------|
| `ADMIN_PASSWORD` | пароль админ-панели (обязательно, ≥10 символов) |
| `OPENAI_API_KEY` | ключ OpenAI для Jarvis |
| `OPENAI_MODEL` | модель ИИ |
| `TELEGRAM_BOT_TOKEN` | уведомления о заказах |
| `TELEGRAM_CHAT_ID` / `TELEGRAM_USER` | получатель уведомлений |
| `JARVIS_INTERNAL_TOKEN` | внутренний токен gateway ↔ AI |

Секреты **не** кладутся в образ Docker — только монтируются при запуске.

---

## 6. Преимущества контейнеризации

1. **Воспроизводимость** — одинаковый запуск на любом ПК с Docker.
2. **Изоляция** — зависимости (Node, Chromium, библиотеки) внутри образа.
3. **Простота сдачи** — преподавателю достаточно `docker compose up --build`.
4. **Персистентность** — заказы и каталог хранятся в Docker volume `yana_data`.
5. **Безопасность** — `.env` не копируется в образ (см. `.dockerignore`).

---

## 7. Проверка работоспособности (чеклист)

Фактическая проверка на машине разработчика (05.11.2026):

- [x] `docker compose up --build -d` завершается без ошибок
- [x] контейнер `yana-clinic` в статусе **healthy**
- [x] `GET /api/health` → `{"ok":true,"storage":"sqlite","ai":true,"db":true,"pdf":true}`
- [x] сайт доступен на `http://127.0.0.1:5500/`
- [ ] Каталог товаров загружается (ручная проверка в браузере)
- [ ] Админ-панель принимает пароль из `.env` (ручная проверка)
- [ ] (опционально) чат Jarvis отвечает при наличии `OPENAI_API_KEY`
- [ ] (опционально) PDF скачивается из админки

Лог успешного старта (фрагмент):

```
Starting DB on :5601
SQLite DB on http://127.0.0.1:5601/
Starting AI on :5600
Starting PDF on :5602
Starting gateway on :5500
Gateway on http://0.0.0.0:5500/
Jarvis AI core on http://127.0.0.1:5600/
PDF service on http://127.0.0.1:5602/
```

---

## 8. Основные добавленные файлы

| Файл | Роль |
|------|------|
| `Dockerfile` | сборка образа |
| `docker-compose.yml` | оркестрация запуска |
| `docker/entrypoint.sh` | старт всех процессов |
| `gateway/server.js` | HTTP API + статика в Linux-контейнере |
| `.dockerignore` | фильтр контекста сборки |
| `.env.docker.example` | шаблон секретов |
| `ОТЧЁТ_DOCKER.md` | этот отчёт |

---

## 9. Аудит надёжности (повторная проверка)

Проверено вручную после упаковки:

| Проверка | Результат |
|----------|-----------|
| Контейнер healthy | OK |
| `/api/health` (db/ai/pdf) | OK |
| Статика `/`, `/admin.html`, `/procedures.html` | OK |
| Каталог `/api/products` | OK |
| Админ login + session + orders | OK |
| PDF `/api/pdf/catalog` (~4.5 MB) | OK |
| Блокировка `/.env`, `/serve.ps1` | OK |
| Наружу опубликован только порт 5500 | OK |
| Внутри: db/ai/pdf на 127.0.0.1 | OK |
| Секреты bind-mount read-only | OK |
| Данные в volume `yana_data` | OK |

Усиления после аудита:

- `init: true` — корректные сигналы/зомби-процессы;
- `shm_size: 256mb` — стабильность Chromium/Puppeteer;
- `stop_grace_period: 25s` + flush SQLite перед остановкой;
- entrypoint ждёт готовности DB/AI/PDF/gateway;
- CSP-заголовки в gateway (как в `serve.ps1`).

Ограничения (осознанные):

- образ ~2 GB из‑за Chromium для PDF;
- путь секретов по умолчанию Windows (`%LOCALAPPDATA%\YanaClinic\.env`); на другой ОС нужен `DOCKER_ENV_FILE`;
- Windows-запуск через `serve.ps1` и Docker-запуск через `gateway` — два режима, один проект.

---

## 10. Вывод

Проект полностью упакован в Docker: frontend собирается при build, backend-сервисы (БД, AI, PDF, gateway) запускаются внутри одного контейнера, данные сохраняются в volume, секреты подключаются с хоста. Для демонстрации преподавателю достаточно установленного Docker Desktop и команды `docker compose up --build`.

---

## 11. Приложение: полезные команды

```powershell
docker compose ps
docker compose logs -f yana-clinic
docker images yana-clinic
docker volume ls | Select-String yana
```
