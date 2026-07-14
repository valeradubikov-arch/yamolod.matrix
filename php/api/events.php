<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

$token = getenv('YANDEX_DISK_TOKEN') ?: '';
$publicUrl = getenv('YANDEX_PUBLIC_URL') ?: 'https://disk.yandex.ru/d/X2LAAlT4PyzKCA';
$diskPath = getenv('YANDEX_DISK_PATH') ?: '/Loginom/Сводная таблица.json';

try {
    if ($token !== '') {
        $downloadUrl = getPrivateDownloadUrl($token, $diskPath);
        $source = 'yandex-disk-private';
    } else {
        $downloadUrl = getPublicDownloadUrl($publicUrl);
        $source = 'yandex-disk-public';
    }

    $jsonContent = httpGet($downloadUrl, []);
    $decoded = json_decode($jsonContent, true);

    if (!is_array($decoded)) {
        throw new RuntimeException('Полученный файл не является корректным JSON');
    }

    echo json_encode(
        [
            'updatedAt' => $decoded['updatedAt'] ?? $decoded['updated_at'] ?? date(DATE_ATOM),
            'source' => $source,
            'rows' => array_map('normalizeRow', extractRows($decoded)),
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (Throwable $error) {
    http_response_code(502);
    echo json_encode(
        [
            'error' => 'Не удалось получить данные',
            'details' => $error->getMessage(),
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
}

function getPrivateDownloadUrl(string $token, string $diskPath): string
{
    $url = 'https://cloud-api.yandex.net/v1/disk/resources/download?path=' . rawurlencode($diskPath);
    $response = httpGet($url, ['Authorization: OAuth ' . $token]);
    $data = json_decode($response, true);

    if (!is_array($data) || empty($data['href'])) {
        throw new RuntimeException('Яндекс.Диск не вернул ссылку скачивания');
    }

    return $data['href'];
}

function getPublicDownloadUrl(string $publicUrl): string
{
    $url = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=' . rawurlencode($publicUrl);
    $response = httpGet($url, []);
    $data = json_decode($response, true);

    if (!is_array($data) || empty($data['href'])) {
        throw new RuntimeException('Публичный API Яндекс.Диска не вернул ссылку скачивания');
    }

    return $data['href'];
}

function httpGet(string $url, array $headers): string
{
    $curl = curl_init($url);
    curl_setopt_array(
        $curl,
        [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 60,
        ]
    );

    $body = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $error = curl_error($curl);
    curl_close($curl);

    if ($body === false || $status < 200 || $status >= 300) {
        throw new RuntimeException('HTTP ' . $status . ': ' . ($error ?: mb_substr((string) $body, 0, 500)));
    }

    return (string) $body;
}

function extractRows(array $decoded): array
{
    if (array_is_list($decoded)) {
        return $decoded;
    }

    foreach (['rows', 'data', 'items'] as $key) {
        if (isset($decoded[$key]) && is_array($decoded[$key])) {
            return $decoded[$key];
        }
    }

    return [];
}

function normalizeRow(array $row): array
{
    $startDate = firstValue($row, [
        'Дата начала мероприятия / воспитательного часа',
        'Дата начала',
        'Дата',
        'dateRaw',
    ]);
    $endDate = firstValue($row, [
        'Дата окончания мероприятия / воспитательного часа',
        'Дата окончания',
        'endDateRaw',
    ]);

    return [
        'sourceRow' => $row,
        'source_id' => textValue(firstValue($row, ['source_id', '_id', 'ID', 'id'])),
        'source_table' => textValue(firstValue($row, ['source_table', 'table_name', 'Таблица'])),
        'updated_at' => textValue(firstValue($row, ['updated_at', 'Дата выгрузки', 'updatedAt'])),
        'id' => textValue(firstValue($row, ['ID', 'id', 'source_id', '_id'])),
        'title' => textValue(firstValue($row, [
            'Название мероприятия / тема воспитательного часа',
            'Название мероприятия',
            'Мероприятие',
            'Название',
            'title',
        ])),
        'community' => joinedValue(firstValue($row, ['КМФ / сообщество', 'КМФ/Сообщество', 'КМФ', 'community'])),
        'dateRaw' => normalizeDate($startDate) ?: textValue($startDate),
        'endDateRaw' => normalizeDate($endDate) ?: textValue($endDate),
        'level' => textValue(firstValue($row, ['Уровень мероприятия / воспитательного часа', 'Уровень', 'level'])),
        'category' => joinedValue(firstValue($row, ['Категория мероприятия / воспитательного часа', 'Категория', 'category'])),
        'budgetRaw' => firstValue($row, ['Бюджет', 'Сумма доведённая на 01 января 2026 (в руб)', 'Сумма доведённая 01.01.2026', 'budget']),
        'estimateRaw' => firstValue($row, ['Сумма согласованной сметы', 'Согласованная смета', 'estimate']),
        'balanceRaw' => firstValue($row, ['Остаток суммы сметы', 'Остаток', 'balance']),
        'fundingSource' => joinedValue(firstValue($row, ['Источник финансирования', 'fundingSource'])),
        'travelSource' => joinedValue(firstValue($row, ['Источник финансирования на проезд', 'travelSource'])),
        'travelAmountRaw' => firstValue($row, ['Сумма проезда', 'travelAmount']),
        'institution' => joinedValue(firstValue($row, ['Ответственное учреждение', 'Учреждение', 'institution'])),
        'holder' => joinedValue(firstValue($row, ['Учреждение-держатель субсидии', 'holder'])),
        'owner' => textValue(firstValue($row, ['Ответственный', 'Отв. исполнитель', 'Ответственный исполнитель', 'owner'])),
        'department' => textValue(firstValue($row, ['Ответственный отдел', 'department'])),
        'reachRaw' => firstValue($row, ['Планируемый охват', 'Охват', 'reach']),
        'place' => joinedValue(firstValue($row, ['Прощадка', 'Площадка', 'Место проведения', 'Муниципальное образование', 'place'])),
        'format' => textValue(firstValue($row, ['Формат проведения', 'format'])),
    ];
}

function firstValue(array $row, array $keys): mixed
{
    foreach ($keys as $key) {
        if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') {
            return $row[$key];
        }
    }

    return '';
}

function joinedValue(mixed $value): string
{
    if (is_array($value)) {
        return implode(', ', array_filter(array_map('textValue', $value)));
    }

    return textValue($value);
}

function textValue(mixed $value): string
{
    if (is_array($value)) {
        return joinedValue($value);
    }

    return trim((string) $value);
}

function normalizeDate(mixed $value): string
{
    $raw = trim((string) $value);
    if ($raw === '') {
        return '';
    }

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $raw, $matches)) {
        return $matches[1] . '-' . $matches[2] . '-' . $matches[3];
    }

    if (preg_match('/^([0-3]?\d)[.\/-]([01]?\d)[.\/-](\d{4})$/', $raw, $matches)) {
        return $matches[3] . '-' . str_pad($matches[2], 2, '0', STR_PAD_LEFT) . '-' . str_pad($matches[1], 2, '0', STR_PAD_LEFT);
    }

    return '';
}
