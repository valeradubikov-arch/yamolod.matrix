# Перенос дашборда на хостинг

## Что уже подготовлено

- `public/index.html` — дашборд без зависимости от Google Apps Script.
- `server/index.mjs` — Node.js backend и статический сервер.
- `server/data-source.mjs` — загрузка JSON с Яндекс.Диска и нормализация строк Loginom.
- `php/api/events.php` — запасной PHP endpoint, если хостинг будет без Node.js.
- `scripts/probe-data.mjs` — быстрая проверка источника данных.

## Основная схема

```text
Loginom
  -> Яндекс.Диск: /Loginom/Сводная таблица.json
  -> backend сайта: /api/events
  -> frontend дашборда
```

## Переменные окружения

Для боевой версии:

```text
YANDEX_DISK_TOKEN=реальный_oauth_токен
YANDEX_DISK_PATH=/Loginom/Сводная таблица.json
CACHE_SECONDS=0
HOST=127.0.0.1
PORT=3000
```

Для теста публичной ссылки можно не задавать `YANDEX_DISK_TOKEN`; тогда backend попробует:

```text
YANDEX_PUBLIC_URL=https://disk.yandex.ru/d/X2LAAlT4PyzKCA
```

Важно: `YANDEX_DISK_TOKEN` — это имя переменной окружения. Сам токен нельзя использовать как имя переменной.

## Проверка

Локально:

```bash
cd site
npm run check
npm run probe
npm start
```

На некоторых хостингах нужно указать:

```text
HOST=0.0.0.0
```

Открыть:

```text
http://localhost:3000
http://localhost:3000/api/status
http://localhost:3000/api/events
```

Если нужно принудительно обновить данные без кэша:

```text
/api/events?refresh=1
/api/status?refresh=1
```

## Что должен показать `/api/status`

```json
{
  "ok": true,
  "source": "yandex-disk-private",
  "rows": 642,
  "updatedAt": "2026-07-14T..."
}
```

Если `source` равен `local-fallback`, значит сервер не смог достучаться до Яндекс.Диска и взял тестовый локальный JSON.

## Минимальные требования к JSON из Loginom

Желательные поля:

```text
source_id
updated_at
source_table
Название мероприятия / тема воспитательного часа
Дата начала мероприятия / воспитательного часа
Дата окончания мероприятия / воспитательного часа
Уровень мероприятия / воспитательного часа
Категория мероприятия / воспитательного часа
Ответственное учреждение
Ответственный
Планируемый охват
Муниципальное образование
Формат проведения
Прощадка
```

Даты лучше держать в формате:

```text
YYYY-MM-DD
```

## Решение по хостингу

Лучший вариант — Node.js-хостинг, потому что весь дашборд и backend будут в одном проекте.

PHP-вариант оставлен как резерв, если выбранный хостинг поддерживает только PHP.
