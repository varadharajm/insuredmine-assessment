# InsuredMine – Node.js Assessment

My solution for the InsuredMine Node.js technical assessment. Built with Node.js, Express and MongoDB (Mongoose), plain JavaScript.

## What's covered

| Task | What it does | Where |
|---|---|---|
| 1.1 | Upload XLSX/CSV into MongoDB using worker threads | `POST /api/upload` → `src/workers/importWorker.js` |
| 1.2 | Search policy info by username | `GET /api/policies/search?username=` |
| 1.3 | Aggregated policies per user | `GET /api/policies/aggregate` |
| 1.4 | Separate collections: Agent, User, Account, LOB, Carrier, Policy | `src/models/` |
| 2.1 | Track server CPU and restart at 70% | `src/services/cpuMonitor.js`, `src/index.js` |
| 2.2 | POST a message + day + time, insert it into the DB at that time | `POST /api/messages/schedule` |

## Running it

You'll need Node 20.19+ (Mongoose 9 needs it) and MongoDB running locally, or an Atlas URI.

```bash
npm install
cp .env.example .env    # change MONGO_URI if you're not on local mongo
npm start
```

Server comes up on http://localhost:3000.

There's a Postman collection in the repo (`postman_collection.json`) with every request ready to go, and `sample/sample-data.csv` if you want a small file to try the upload with.

## Folder structure

```
src/
  index.js                 starts the server via cluster, restarts it if it exits
  app.js                   express setup, db connection, cpu monitor, scheduler
  config/                  env vars + mongo connection
  models/                  mongoose schemas
  workers/importWorker.js  the worker thread that does the actual import
  utils/rowMapper.js       maps csv headers to fields, cleans up dates/numbers
  controllers/             route handlers
  routes/                  express routers
  services/                cpu monitor, message scheduler
```

## Task 1 – Upload, search, aggregate

### Upload
`POST /api/upload` with form-data, key `file`.

```bash
curl -F "file=@sample/sample-data.csv" http://localhost:3000/api/upload
```

With the sheet you shared, the response looks like:
```json
{
  "message": "File imported successfully",
  "totalRows": 1198, "imported": 1198, "skipped": [],
  "counts": { "agents": 3, "users": 1198, "accounts": 1198, "lobs": 19, "carriers": 46, "policies": 1198 }
}
```

How it works:
- multer saves the file to `uploads/`
- the controller starts a `Worker` and passes it the file path, so the parsing and DB writes happen off the main thread and the API keeps responding
- inside the worker: read the sheet, collect unique agents / categories / carriers / users, `bulkWrite` them as upserts, then accounts, then policies (which point to everything else by `_id`)
- worker sends a summary back through `parentPort.postMessage`, temp file gets deleted

Uploading the same file again doesn't create duplicates since everything is upserted on a natural key (agent name, category name, company name, user name + email, policy number).

### Search
`GET /api/policies/search?username=Lura`

Case-insensitive partial match on the user's first name. Returns the user and their policies, with category, carrier, agent and account names filled in via `$lookup`.

### Aggregate
`GET /api/policies/aggregate`

Groups policies by user: `totalPolicies`, `totalPremium` and the list of policies.

## Task 2 – CPU restart + scheduled messages

### CPU monitor
- `src/index.js` uses the `cluster` module as a small supervisor. The primary process forks one worker that runs the server, and forks a new one whenever it exits.
- `cpuMonitor.js` checks CPU every second. If it's at or above 70% for 3 checks in a row, the worker shuts down cleanly and exits with code 1, and the primary starts a fresh one.
- It measures the main thread only, since that's what serves requests. On newer Node (22.19+) that's `process.threadCpuUsage()`. On older versions it falls back to `process.cpuUsage()`, which also counts worker threads, so readings are ignored while an import is running. The first 10 seconds after startup are skipped too.
- `GET /api/system/cpu` shows the current reading.

To see the restart happen, set `ENABLE_STRESS_ENDPOINT=true` in `.env`, restart, wait a few seconds and call `POST /api/system/stress?seconds=10`:
```
[cpu] 99.8% >= 70% - restarting server (pid 1122)
[primary] worker 1122 exited (code 1). Restart #1 in 1s...
[primary] started worker pid 1135
```

### Scheduled messages
`POST /api/messages/schedule`
```json
{ "message": "Hello InsuredMine", "day": "2026-09-24", "time": "18:30" }
```
- `day`: `YYYY-MM-DD`, `DD-MM-YYYY`, or a weekday like `"Friday"`
- `time`: `HH:mm`, `HH:mm:ss` or `h:mm AM/PM`, in IST by default (`TZ` in `.env`)

The request gets saved in `scheduledmessages` as `pending`. A poller runs every second, picks up anything that's due (using `findOneAndUpdate` so two instances can't take the same job), and inserts it into the `messages` collection.

I kept the jobs in MongoDB rather than using `setTimeout` or `node-cron` because the server restarts itself under high CPU (Task 2.1). An in-memory timer would be lost on restart; this way nothing is lost, and anything that came due while the server was down gets inserted as soon as it's back.

- `GET /api/messages/scheduled` – all jobs and their status
- `GET /api/messages` – messages that have been inserted

## Notes
- CSV headers are matched loosely: `firstname`, `first_name` and `First Name` all work. Columns I don't use come back in `unmatchedHeaders` in the upload response.
- In the provided sheet, 47 email addresses are shared by two different people, so a user is identified by first name + email. If there's no email, by first name + phone.
- Rows without a policy number or first name are skipped and listed in `skipped` with their row number.
- `npm audit` flags `xlsx@0.18.5`, the last version SheetJS published on npm. For production I'd install the patched build from their CDN: `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
