-- +goose Up
-- +goose StatementBegin

ALTER TABLE users
    ADD COLUMN microsoft_oauth_id TEXT;

CREATE INDEX idx_users_microsoft_oauth_id ON users (microsoft_oauth_id) WHERE microsoft_oauth_id IS NOT NULL;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP INDEX IF EXISTS idx_users_microsoft_oauth_id;

ALTER TABLE users
    DROP COLUMN microsoft_oauth_id;

-- +goose StatementEnd
