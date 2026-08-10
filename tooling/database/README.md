# Test Results Database

The schema is tracked in `tooling/database/schema.sql`. The populated SQLite database is generated locally at `generated/database/medical.sqlite` and is ignored by Git because it contains medical data.

Useful commands:

```sh
npm run db:rebuild
npm run db:import
sqlite3 generated/database/medical.sqlite
```

Current duplicate rules:

- A panel is unique by `lab_name`, `collected_date`, and `panel_name`.
- A result is unique by `panel_id` and `test_name`.

That makes repeated imports idempotent while keeping the report structure close to Quest and MyChart lab PDFs.
