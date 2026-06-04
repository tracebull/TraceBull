-- +goose Up
UPDATE users SET role = 'MANAGER' WHERE role = 'MEMBER';

ALTER TABLE users_settings RENAME COLUMN is_allow_member_invitations TO is_allow_manager_invitations;
ALTER TABLE users_settings RENAME COLUMN is_member_allowed_to_create_projects TO is_manager_allowed_to_create_projects;

-- +goose Down
UPDATE users SET role = 'MEMBER' WHERE role IN ('MANAGER', 'USER');

ALTER TABLE users_settings RENAME COLUMN is_allow_manager_invitations TO is_allow_member_invitations;
ALTER TABLE users_settings RENAME COLUMN is_manager_allowed_to_create_projects TO is_member_allowed_to_create_projects;
