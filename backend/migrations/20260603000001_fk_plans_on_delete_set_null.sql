-- +goose Up
-- +goose StatementBegin
ALTER TABLE projects
    DROP CONSTRAINT fk_projects_plan_id;

ALTER TABLE projects
    ADD CONSTRAINT fk_projects_plan_id
    FOREIGN KEY (plan_id)
    REFERENCES user_plans (id)
    ON DELETE SET NULL;

ALTER TABLE users
    DROP CONSTRAINT fk_users_plan_id;

ALTER TABLE users
    ADD CONSTRAINT fk_users_plan_id
    FOREIGN KEY (plan_id)
    REFERENCES user_plans (id)
    ON DELETE SET NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE projects
    DROP CONSTRAINT fk_projects_plan_id;

ALTER TABLE projects
    ADD CONSTRAINT fk_projects_plan_id
    FOREIGN KEY (plan_id)
    REFERENCES user_plans (id);

ALTER TABLE users
    DROP CONSTRAINT fk_users_plan_id;

ALTER TABLE users
    ADD CONSTRAINT fk_users_plan_id
    FOREIGN KEY (plan_id)
    REFERENCES user_plans (id);
-- +goose StatementEnd
