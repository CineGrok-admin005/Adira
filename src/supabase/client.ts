import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL!;

// Anon key: can read published filmmakers (is_published = true, non-demo statuses)
export const anonClient = createClient(url, process.env.SUPABASE_ANON_KEY!);

// Service role key: bypasses RLS — used only for profiles table signup counts
export const serviceClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
