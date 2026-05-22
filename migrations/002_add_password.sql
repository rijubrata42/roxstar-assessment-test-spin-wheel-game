-- Migration 002: Add password_hash column to users table
-- NOTE: Run scripts/reset-passwords.js after this migration to set
--       the bcrypt hash for seed users (password: password123)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
