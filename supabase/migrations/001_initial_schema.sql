-- EmComm Planner: Initial Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================================
-- Helper: auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Table: ares_groups
-- ============================================================
CREATE TABLE ares_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  region TEXT,
  admin_user_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER ares_groups_updated_at
  BEFORE UPDATE ON ares_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: users (extends auth.users)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT UNIQUE,
  call_sign TEXT,
  phone TEXT,
  aprs_call_sign TEXT,
  app_role TEXT DEFAULT 'pending' CHECK (app_role IN ('admin', 'operator', 'viewer', 'pending')),
  ares_group_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile when auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, app_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Table: deployments
-- ============================================================
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'completed', 'archived')),
  start_date DATE,
  end_date DATE,
  location TEXT,
  ares_group_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER deployments_updated_at
  BEFORE UPDATE ON deployments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: deployment_locations
-- ============================================================
CREATE TABLE deployment_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  contact_person TEXT,
  assigned_call_signs TEXT[] DEFAULT '{}',
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER deployment_locations_updated_at
  BEFORE UPDATE ON deployment_locations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: categories
-- ============================================================
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  description TEXT,
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: deployment_items
-- ============================================================
CREATE TABLE deployment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  deployment_location_id UUID REFERENCES deployment_locations(id) ON DELETE CASCADE,
  assigned_to TEXT[] DEFAULT '{}',
  quantity INTEGER DEFAULT 1,
  priority TEXT CHECK (priority IN ('essential', 'important', 'optional')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER deployment_items_updated_at
  BEFORE UPDATE ON deployment_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: tasks
-- ============================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  deployment_location_id UUID REFERENCES deployment_locations(id) ON DELETE CASCADE,
  assigned_to_call_sign TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: deployment_templates
-- ============================================================
CREATE TABLE deployment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  structure JSONB,
  category_count INTEGER DEFAULT 0,
  item_count INTEGER DEFAULT 0,
  location_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER deployment_templates_updated_at
  BEFORE UPDATE ON deployment_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: ics205_forms
-- ============================================================
CREATE TABLE ics205_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_location_id UUID REFERENCES deployment_locations(id) ON DELETE CASCADE,
  incident_name TEXT,
  operational_period_start TIMESTAMPTZ,
  operational_period_end TIMESTAMPTZ,
  radio_channels JSONB DEFAULT '[]',
  special_instructions TEXT,
  prepared_by_name TEXT,
  prepared_by_position TEXT,
  preparation_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER ics205_forms_updated_at
  BEFORE UPDATE ON ics205_forms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Table: notifications
-- ============================================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT,
  title TEXT,
  message TEXT,
  type TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Helper functions for RLS
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role(uid UUID)
RETURNS TEXT AS $$
  SELECT app_role FROM public.users WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_ares_groups(uid UUID)
RETURNS TEXT[] AS $$
  SELECT COALESCE(ares_group_ids, '{}') FROM public.users WHERE id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Enable Realtime for key tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
ALTER PUBLICATION supabase_realtime ADD TABLE deployment_items;
ALTER PUBLICATION supabase_realtime ADD TABLE deployment_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
