# Data Flow Audit

## Confirmed Chain

`ditable.yanao.ru -> Loginom -> JSON on Yandex Disk -> Render backend -> frontend dashboard`

The dashboard does not connect directly to `ditable.yanao.ru`, Loginom, Google Sheets, or Yandex Disk from the browser. The browser reads only the backend API.

## Access Boundaries

- Confirmed by code: Render backend downloads JSON through Yandex Disk API, validates and normalizes rows, caches results, and serves `/api/events` and `/api/status`.
- Confirmed by live source check: public Yandex Disk JSON currently returns 687 raw rows.
- Not directly verified: source tables inside `ditable.yanao.ru` and Loginom transformation graph, because direct access to those systems is not available in this workspace.

## Runtime Data Status

Last checked with the live public JSON source:

- raw rows: 687
- normalized rows: 687
- rejected rows: 0
- duplicate source ids: 0
- missing titles: 0
- missing dates: 8

## Field Map

| JSON field | Backend field | API field | Frontend usage |
| --- | --- | --- | --- |
| `source_id` | `source_id` | `source_id` | unique id, diagnostics |
| `updated_at` | `updated_at` | `updated_at` | source freshness fallback |
| `source_table` | `source_table` | `source_table` | diagnostics/source trace |
| `ID` | `id` | `id` | display/internal id |
| `Nazvanie_meropriyatiya___tema_vospitatelnogo_chasa` | `title` | `title` | cards, search, calendar, lists |
| `Status` | `status` | `status` | available for filtering/detail views |
| `Data_nachala` | `dateRaw` | `dateRaw` | dates, calendar, monthly grouping, upcoming events |
| `Data_okonchania` | `endDateRaw` | `endDateRaw` | date ranges and active-day checks |
| `KMF___soobschestvo` | `community` | `community` | filters/search/detail context |
| `Uroven_meropriyatiya___vospitatelnogo_chasa` | `level` | `level` | filters, KPI, rings, calendar dots |
| `Kategoriya_meropriyatiya___vospitatelnogo_chasa` | `category` | `category` | filters, labels, outbound/action detection |
| `Otvetstvennoe_uchrezhdenie` | `institution` | `institution` | cards/detail chips, filters |
| `FYUS_Uchrezhdenie_derzhatel_subsidii` | `holder` | `holder` | institution fallback |
| `Soorganizator` | `coorganizer` | `coorganizer` | available for detail/search expansion |
| `Otvetstvenniy` | `owner` | `owner` | search/detail context |
| `Otvetstvenniy_otdel` | `department` | `department` | search/detail context |
| `Munitsipalnoe_obrazovanie` | `place` | `place` | cards, calendar, territory detail |
| `Proschadka` | `place` fallback | `place` | place fallback |
| `Format_provedeniya` | `format`, `isOutbound` | `format`, `isOutbound` | outbound KPI/filter |
| `Planiruemiy_ohvat` / `Planoviy_ohvat` | `reachRaw` | `reachRaw` | reach detail/analytics |
| `FYUS_Summa_dovedyonnaya_na_01_yanvarya_2026__v_rub_` | `budgetRaw` | `budgetRaw` | finance KPI/analytics |
| `FYUS_Summa_soglasovannoy_smet` | `estimateRaw` | `estimateRaw` | finance progress |
| `FYUS_Ostatok_summ_smet` | `balanceRaw` | `balanceRaw` | finance balance |
| `FYUS_Istochnik_finansirovaniya` | `fundingSource` | `fundingSource` | finance context |
| `FYUS_Istochnik_finansirovaniya_na_proezd` | `travelSource` | `travelSource` | finance context |
| `FYUS_Summa_raskhodov_na_proezd` | `travelAmountRaw` | `travelAmountRaw` | finance context |
| `FYUS_Sslka_na_smetu` | `estimateLink` | `estimateLink` | available for document/detail expansion |
| `FYUS_Status_soglasovaniya_smet` | `estimateStatus` | `estimateStatus` | available for finance/detail expansion |
| `FYUS_Status_vkhoda_na_torgi` | `tenderStatus` | `tenderStatus` | available for finance/detail expansion |
| `FYUS_Format_zaklyucheniya_dogovorov` | `contractFormat` | `contractFormat` | available for finance/detail expansion |

All original fields are also retained in `sourceRow` for diagnostics and future mapping. User-facing components should prefer normalized fields and avoid exposing internal service details.

## Important Raw Fields Not Yet Promoted

The JSON contains additional `FYUS_*` and `Apparat_*` fields. They are kept in `sourceRow` but not all are promoted to top-level API fields or UI blocks yet. They should be grouped into finance, documents, or administration views only after product meaning is confirmed.

## Source Reliability Rules

- Frontend never fetches Yandex Disk directly.
- Backend requests a temporary download URL from Yandex Disk API and follows the returned file URL.
- Production local fallback is disabled with `ALLOW_LOCAL_FALLBACK=0`.
- Invalid JSON or a schema without an events array throws an error instead of becoming an empty dashboard.
- A failed refresh does not overwrite the last successful in-memory dataset while the service is running.
- API responses include `meta` with freshness and validation counts.

