-- Game design document (Markdown) persisted per project; user-edited, future AI updates.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS design_document TEXT NOT NULL DEFAULT '';
