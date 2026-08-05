-- Add avatar_file and cover_file columns for local file storage

ALTER TABLE character_card ADD COLUMN avatar_file TEXT;
ALTER TABLE character_card ADD COLUMN cover_file TEXT;

ALTER TABLE persona ADD COLUMN avatar_file TEXT;
