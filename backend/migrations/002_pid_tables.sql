-- =====================================================
-- TASK 3: P&ID COMPUTER VISION TABLES
-- Run this in Supabase SQL Editor
-- =====================================================

-- P&ID Analysis Jobs
CREATE TABLE IF NOT EXISTS pid_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    pid_filename TEXT,
    sop_filename TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pid_jobs_status ON pid_jobs(status);
CREATE INDEX IF NOT EXISTS idx_pid_jobs_created ON pid_jobs(created_at DESC);

-- Detected P&ID Components
CREATE TABLE IF NOT EXISTS pid_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES pid_jobs(id) ON DELETE CASCADE,
    component_type TEXT NOT NULL,
    tag TEXT,
    label TEXT,
    confidence REAL NOT NULL DEFAULT 0.0,
    bbox_x INTEGER NOT NULL,
    bbox_y INTEGER NOT NULL,
    bbox_width INTEGER NOT NULL,
    bbox_height INTEGER NOT NULL,
    center_x INTEGER NOT NULL,
    center_y INTEGER NOT NULL,
    detection_method TEXT DEFAULT 'yolo',
    page_number INTEGER DEFAULT 1,
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pid_components_job ON pid_components(job_id);
CREATE INDEX IF NOT EXISTS idx_pid_components_type ON pid_components(component_type);
CREATE INDEX IF NOT EXISTS idx_pid_components_tag ON pid_components(tag);

-- P&ID Graph Edges (Connections between components)
CREATE TABLE IF NOT EXISTS pid_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES pid_jobs(id) ON DELETE CASCADE,
    source_component_id UUID NOT NULL REFERENCES pid_components(id) ON DELETE CASCADE,
    target_component_id UUID NOT NULL REFERENCES pid_components(id) ON DELETE CASCADE,
    edge_type TEXT DEFAULT 'pipe',
    line_type TEXT,
    length REAL,
    attributes JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(job_id, source_component_id, target_component_id)
);

CREATE INDEX IF NOT EXISTS idx_pid_edges_job ON pid_edges(job_id);
CREATE INDEX IF NOT EXISTS idx_pid_edges_source ON pid_edges(source_component_id);
CREATE INDEX IF NOT EXISTS idx_pid_edges_target ON pid_edges(target_component_id);

-- Graph Summary / Stats
CREATE TABLE IF NOT EXISTS pid_graphs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES pid_jobs(id) ON DELETE CASCADE,
    node_count INTEGER DEFAULT 0,
    edge_count INTEGER DEFAULT 0,
    component_counts JSONB DEFAULT '{}',
    graph_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SOP Component References (extracted from SOP using LLM)
CREATE TABLE IF NOT EXISTS pid_sop_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES pid_jobs(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    component_type TEXT,
    description TEXT,
    pressure TEXT,
    temperature TEXT,
    section_title TEXT,
    context TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pid_sop_components_job ON pid_sop_components(job_id);
CREATE INDEX IF NOT EXISTS idx_pid_sop_components_tag ON pid_sop_components(tag);

-- Discrepancy Reports (cross-reference results)
CREATE TABLE IF NOT EXISTS pid_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES pid_jobs(id) ON DELETE CASCADE,
    discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN (
        'missing_in_pid', 'missing_in_sop', 'type_mismatch', 'connection_issue', 'match'
    )),
    component_tag TEXT,
    pid_component_id UUID REFERENCES pid_components(id) ON DELETE SET NULL,
    pid_type TEXT,
    sop_type TEXT,
    source_tag TEXT,
    target_tag TEXT,
    sop_section TEXT,
    issue_description TEXT,
    context TEXT,
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pid_discrepancies_job ON pid_discrepancies(job_id);
CREATE INDEX IF NOT EXISTS idx_pid_discrepancies_type ON pid_discrepancies(discrepancy_type);
CREATE INDEX IF NOT EXISTS idx_pid_discrepancies_severity ON pid_discrepancies(severity);

-- Discrepancy Summary (cached summary stats)
CREATE TABLE IF NOT EXISTS pid_discrepancy_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL UNIQUE REFERENCES pid_jobs(id) ON DELETE CASCADE,
    total_sop_components INTEGER DEFAULT 0,
    total_pid_components INTEGER DEFAULT 0,
    matched_count INTEGER DEFAULT 0,
    missing_in_pid_count INTEGER DEFAULT 0,
    missing_in_sop_count INTEGER DEFAULT 0,
    type_mismatch_count INTEGER DEFAULT 0,
    connection_issue_count INTEGER DEFAULT 0,
    match_rate REAL DEFAULT 0.0,
    full_data JSONB DEFAULT '{}',  -- Stores complete comparison data for frontend
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add full_data column if table already exists (for existing installations)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'pid_discrepancy_summaries' AND column_name = 'full_data'
    ) THEN
        ALTER TABLE pid_discrepancy_summaries ADD COLUMN full_data JSONB DEFAULT '{}';
    END IF;
END $$;

-- Trigger function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS trigger_pid_jobs_updated ON pid_jobs;
CREATE TRIGGER trigger_pid_jobs_updated
    BEFORE UPDATE ON pid_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_pid_graphs_updated ON pid_graphs;
CREATE TRIGGER trigger_pid_graphs_updated
    BEFORE UPDATE ON pid_graphs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_pid_discrepancy_summaries_updated ON pid_discrepancy_summaries;
CREATE TRIGGER trigger_pid_discrepancy_summaries_updated
    BEFORE UPDATE ON pid_discrepancy_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
