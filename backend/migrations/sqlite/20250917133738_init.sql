-- +goose Up
-- +goose StatementBegin

CREATE TABLE users (
    id                      TEXT PRIMARY KEY,
    email                   TEXT NOT NULL UNIQUE,
    hashed_password         TEXT,
    password_creation_time  TEXT NOT NULL DEFAULT (datetime('now')),
    role                    TEXT NOT NULL,
    status                  TEXT NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users_settings (
    id                                    TEXT PRIMARY KEY,
    is_allow_external_registrations       INTEGER NOT NULL DEFAULT 1,
    is_allow_member_invitations           INTEGER NOT NULL DEFAULT 1,
    is_member_allowed_to_create_projects  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE secret_keys (
    secret TEXT PRIMARY KEY
);

CREATE TABLE projects (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    is_api_key_required     INTEGER NOT NULL DEFAULT 0,
    is_filter_by_domain     INTEGER NOT NULL DEFAULT 0,
    is_filter_by_ip         INTEGER NOT NULL DEFAULT 0,
    allowed_domains_raw     TEXT NOT NULL DEFAULT '',
    allowed_ips_raw         TEXT NOT NULL DEFAULT '',
    logs_per_second_limit   INTEGER NOT NULL DEFAULT 0,
    max_logs_amount         INTEGER NOT NULL DEFAULT 0,
    max_logs_size_mb        INTEGER NOT NULL DEFAULT 0,
    max_logs_life_days      INTEGER NOT NULL DEFAULT 0,
    max_log_size_kb         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE project_memberships (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    project_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    UNIQUE (user_id, project_id)
);

CREATE TABLE api_keys (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    token_prefix TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    status       TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE TABLE audit_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    project_id TEXT,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_created_at ON users (created_at);
CREATE INDEX idx_projects_created_at ON projects (created_at DESC);
CREATE INDEX idx_project_memberships_user_id ON project_memberships (user_id);
CREATE INDEX idx_project_memberships_project_id ON project_memberships (project_id);
CREATE INDEX idx_project_memberships_created_at ON project_memberships (created_at ASC);
CREATE INDEX idx_api_keys_project_id ON api_keys (project_id);
CREATE INDEX idx_api_keys_token_hash ON api_keys (token_hash);
CREATE INDEX idx_audit_logs_user_id ON audit_logs (user_id, created_at);
CREATE INDEX idx_audit_logs_project_id ON audit_logs (project_id, created_at);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_audit_logs_project_id;
DROP INDEX IF EXISTS idx_audit_logs_user_id;
DROP INDEX IF EXISTS idx_api_keys_token_hash;
DROP INDEX IF EXISTS idx_api_keys_project_id;
DROP INDEX IF EXISTS idx_project_memberships_created_at;
DROP INDEX IF EXISTS idx_project_memberships_project_id;
DROP INDEX IF EXISTS idx_project_memberships_user_id;
DROP INDEX IF EXISTS idx_projects_created_at;
DROP INDEX IF EXISTS idx_users_created_at;
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS project_memberships;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS secret_keys;
DROP TABLE IF EXISTS users_settings;
DROP TABLE IF EXISTS users;

-- +goose StatementEnd
