import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://rlxzyxojexkwzumkfpir.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mHXmPFVtqwKEjxTFL49_-Q_G5yB2_5w";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
