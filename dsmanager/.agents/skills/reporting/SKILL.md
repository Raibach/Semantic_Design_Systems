name: verification
description: Force AI to verify all code changes and services before reporting complete
---

# verification

Before saying "complete" or "done", run verification checks and report results.

## Usage

Use this skill after every code change or service check request.

## Steps

1. After writing code, run readFile on the file to confirm the change landed. If diff doesn't match, fix it.

2. Playwright verification:
   - browser_navigate to http://localhost:5173
   - browser_snapshot
   - browser_evaluate to capture console errors
   - browser_evaluate to check for div[style*="z-index: 9999"]
   - browser_screenshot filename: page.png

3. Services check (when asked):
   - Run lsof -i :5432 (PostgreSQL)
   - Run lsof -i :19530 (Zilliz)
   - Run lsof -i :8000 (FastAPI)
   - Run lsof -i :5173 (Frontend)
   Report RUNNING with PID or NOT RUNNING for each.

4. Report format:
   - Snapshot summary
   - Console errors (none or list)
   - Badge found? Text content if found
   - Root status (loaded or not)
   - Diagnosis if badge missing
   - Fix if needed

DO NOT say "complete" until you have run these checks and provided the report.