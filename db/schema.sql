PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS test_panels (
  id INTEGER PRIMARY KEY,
  source_file TEXT,
  lab_name TEXT NOT NULL,
  specimen_id TEXT,
  requisition_id TEXT,
  collected_date TEXT NOT NULL,
  collected_at TEXT,
  received_at TEXT,
  reported_at TEXT,
  fasting TEXT CHECK (fasting IN ('yes', 'no', 'unknown') OR fasting IS NULL),
  report_status TEXT,
  panel_name TEXT NOT NULL,
  panel_status TEXT,
  display_order INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (lab_name, collected_date, panel_name)
);

CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY,
  panel_id INTEGER NOT NULL REFERENCES test_panels(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  value_text TEXT NOT NULL,
  value_operator TEXT CHECK (value_operator IN ('<', '<=', '>', '>=') OR value_operator IS NULL),
  value_number REAL,
  unit TEXT,
  reference_range TEXT,
  reference_low REAL,
  reference_high REAL,
  flag TEXT,
  status TEXT NOT NULL DEFAULT 'gray' CHECK (status IN ('green', 'yellow', 'red', 'gray')),
  interpretation TEXT,
  display_order INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (panel_id, test_name)
);

CREATE INDEX IF NOT EXISTS idx_test_panels_collected_date
  ON test_panels (collected_date);

CREATE INDEX IF NOT EXISTS idx_test_results_test_name
  ON test_results (test_name);

CREATE INDEX IF NOT EXISTS idx_test_results_status
  ON test_results (status);
