/**
 * Public Supabase config. The anon key is meant for the browser and is
 * protected by Row Level Security. Service-role must never be put here.
 *
 * Vercel did not have env vars on the first deploy, so these fallbacks
 * keep the production build pointed at our project.
 */
export const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qwiwnhxaojogwbbvkhsb.supabase.co"

export const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3aXduaHhhb2pvZ3diYnZraHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4OTE4NjksImV4cCI6MjEwNDQ2Nzg2OX0.Z63oqkbzlQ4MpS2_izT7i2vKpHkTIbKkbwhs-lFjx5s"
