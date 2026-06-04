-- +goose Up
-- +goose StatementBegin

CREATE TABLE user_plans (
    id                       TEXT PRIMARY KEY,
    name                     TEXT NOT NULL,
    type                     TEXT NOT NULL,
    is_public                INTEGER NOT NULL DEFAULT 1,
    warning_text             TEXT,
    upgrade_text             TEXT,
    logs_per_second_limit    INTEGER NOT NULL,
    max_logs_amount          INTEGER NOT NULL,
    max_logs_size_mb         INTEGER NOT NULL,
    max_logs_life_days       INTEGER NOT NULL,
    max_log_size_kb          INTEGER NOT NULL,
    allowed_projects_count   INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN plan_id TEXT REFERENCES user_plans(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN plan_id TEXT REFERENCES user_plans(id) ON DELETE SET NULL;

CREATE INDEX idx_users_plan_id ON users(plan_id);
CREATE INDEX idx_projects_plan_id ON projects(plan_id);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_projects_plan_id;
DROP INDEX IF EXISTS idx_users_plan_id;
ALTER TABLE projects DROP COLUMN plan_id;
ALTER TABLE users DROP COLUMN plan_id;
DROP TABLE IF EXISTS user_plans;

-- +goose StatementEnd
