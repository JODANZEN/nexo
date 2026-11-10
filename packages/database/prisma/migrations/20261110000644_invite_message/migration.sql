-- Invitation message: when the invite SMS/WhatsApp was last handed to the provider.
-- Drives the 10-minute resend cooldown. Existing table/policy, no RLS change.
ALTER TABLE "users" ADD COLUMN     "invite_sent_at" TIMESTAMP(3);
