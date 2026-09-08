-- ==============================================================================
-- Pioneers Technical - Complete Supabase Cloud Database Schema & Setup
-- Project URL: https://ixdheaayfjqprerslpys.supabase.co
-- ==============================================================================

-- 1. Create or Update Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id TEXT PRIMARY KEY,
    job_card TEXT,
    contract TEXT,
    service_order TEXT,
    project TEXT,
    "desc" TEXT,
    unit TEXT,
    qty NUMERIC DEFAULT 0,
    location TEXT,
    mob_date TEXT,
    exp_start TEXT,
    exp_end TEXT,
    act_start TEXT,
    act_end TEXT,
    assigned_to TEXT,
    team TEXT,
    remarks TEXT,
    status TEXT DEFAULT 'Scheduled',
    assigned_teams JSONB DEFAULT '[]'::jsonb,
    shift TEXT DEFAULT 'Day',
    color TEXT,
    priority TEXT DEFAULT 'Medium',
    progress INTEGER DEFAULT 0,
    required_manpower INTEGER DEFAULT 4,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add any missing columns dynamically if table already exists
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS contract TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS service_order TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS "desc" TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS qty NUMERIC DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS mob_date TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS exp_start TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS exp_end TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS act_start TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS act_end TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 2. Create or Update Employees / Workforce Table
CREATE TABLE IF NOT EXISTS public.employees (
    id TEXT PRIMARY KEY,
    emp_id TEXT,
    name TEXT,
    name_en TEXT,
    name_ar TEXT,
    project TEXT,
    team TEXT,
    job_cat TEXT,
    vehicle_type TEXT DEFAULT '-',
    plate TEXT DEFAULT '-',
    brand TEXT DEFAULT '-',
    sec_expiry TEXT DEFAULT '-',
    vehicle_status TEXT DEFAULT 'N/A',
    gate_pass TEXT DEFAULT 'N/A',
    tools_box TEXT DEFAULT '-',
    status TEXT DEFAULT 'Active',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add any missing columns dynamically if table already exists
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS emp_id TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS name_ar TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS job_cat TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT '-';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS plate TEXT DEFAULT '-';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '-';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS sec_expiry TEXT DEFAULT '-';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS vehicle_status TEXT DEFAULT 'N/A';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS gate_pass TEXT DEFAULT 'N/A';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tools_box TEXT DEFAULT '-';

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 4. Create Access Policies (Allow full access for authenticated & anon client)
DROP POLICY IF EXISTS "Allow all access to projects" ON public.projects;
CREATE POLICY "Allow all access to projects"
    ON public.projects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to employees" ON public.employees;
CREATE POLICY "Allow all access to employees"
    ON public.employees FOR ALL USING (true) WITH CHECK (true);

-- 5. Enable Realtime Replication for instant cross-device sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'projects'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'employees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;
END $$;
