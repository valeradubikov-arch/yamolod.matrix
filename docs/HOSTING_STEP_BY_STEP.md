# Как разместить дашборд на хостинге и подключить домен

## Что выбрать

Самый простой вариант для этого проекта: **Render** или **Railway**.

Нам нужен хостинг с Node.js, потому что backend должен безопасно хранить токен Яндекс.Диска и отдавать `/api/events`.

## Что уже готово

В папке `site` уже лежит готовый проект:

- `public/index.html` — дашборд;
- `server/index.mjs` — backend;
- `server/data-source.mjs` — загрузка JSON из Яндекс.Диска;
- `render.yaml` — автоконфиг для Render;
- `Dockerfile` — универсальный вариант для Docker-хостинга.

## Переменные окружения

На хостинге нужно задать:

```text
HOST=0.0.0.0
CACHE_SECONDS=60
YANDEX_DISK_PATH=/Loginom/Сводная таблица.json
YANDEX_PUBLIC_URL=https://disk.yandex.ru/d/X2LAAlT4PyzKCA
YANDEX_DISK_TOKEN=реальный_oauth_токен
```

`YANDEX_DISK_TOKEN` лучше задать как secret/private variable.

Если токена пока нет, можно временно оставить только публичную ссылку. Backend попробует скачать файл через публичный API Яндекс.Диска.

## Проверка после деплоя

Открыть:

```text
https://ваш-сайт/api/status
```

Хороший ответ:

```json
{
  "ok": true,
  "source": "yandex-disk-private",
  "rows": 642
}
```

Если `source` равен `yandex-disk-public`, значит работает публичная ссылка.

Если `source` равен `local-fallback`, значит хостинг не смог скачать JSON из Яндекса и взял тестовые данные.

## Подключение домена

После первого деплоя хостинг выдаст адрес вида:

```text
https://yamolod-event-matrix.onrender.com
```

В настройках хостинга нужно добавить custom domain, например:

```text
events.example.ru
```

Хостинг покажет DNS-запись. Обычно это:

```text
CNAME events -> yamolod-event-matrix.onrender.com
```

Эту запись нужно добавить у регистратора домена или в DNS-панели.

После этого подождать обновления DNS: обычно 5-30 минут, иногда до нескольких часов.

## Важное

Токен Яндекс.Диска нельзя вставлять:

- в `public/index.html`;
- в JavaScript сайта;
- в публичный GitHub;
- в переписку с коллегами.

Токен должен жить только в переменных окружения backend-хостинга.
