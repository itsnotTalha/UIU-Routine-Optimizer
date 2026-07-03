# Routine Optimizer

A small web app that helps you build a class routine and find conflict-free weekly schedules.

## What it does

- Paste course section details into the app
- Save course entries locally in a JSON file so they stay after refresh
- Generate all schedule combinations that do not overlap
- Click a course or schedule block to inspect details

## How to run

1. Open the project folder
2. Start the app with `./run.sh` on Linux or `run.bat` on Windows
3. Open `http://127.0.0.1:8000` in your browser

## Notes

- Saved course entries are stored in `backend/courses.json`
- Delete or edit that file if you want to clear saved data manually
- The backend exposes:
  - `POST /api/optimize` for schedule generation
  - `GET /api/courses` to load saved entries
  - `POST /api/courses` to save entries
  - `PUT /api/courses/{id}` to edit an entry
  - `DELETE /api/courses/{id}` to remove an entry
