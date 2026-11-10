-- Jefe de área: a STAFF user who sees and reassigns the tickets of their own team.
ALTER TABLE "users" ADD COLUMN     "is_team_lead" BOOLEAN NOT NULL DEFAULT false;
