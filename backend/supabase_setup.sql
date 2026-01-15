-- Supabase pgvector setup for Regulatory Compliance Document Processor
-- Run this in your Supabase SQL Editor to set up all tables

-- Enable the pgvector extension
create extension if not exists vector;

-- ============================================
-- Documents table (for vector embeddings)
-- ============================================
create table if not exists documents (
  id text primary key,
  collection text not null,
  content text not null,
  embedding vector(384),  -- all-MiniLM-L6-v2 produces 384-dimensional vectors
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Create index for faster vector similarity search
create index if not exists documents_embedding_idx
on documents using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Create index for collection filtering
create index if not exists documents_collection_idx on documents(collection);

-- ============================================
-- Regulations table (for storing parsed PDFs)
-- ============================================
create table if not exists regulations (
  id uuid primary key default gen_random_uuid(),
  filename text not null unique,
  file_hash text,  -- To detect duplicate uploads
  page_count int default 0,
  full_text text,
  parsed_data jsonb default '{}',
  clause_count int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists regulations_filename_idx on regulations(filename);

-- ============================================
-- Clauses table (extracted regulatory clauses)
-- ============================================
create table if not exists clauses (
  id text primary key,
  regulation_id uuid references regulations(id) on delete cascade,
  text text not null,
  category text default 'general',
  severity text default 'informational',
  extraction_method text default 'pattern',
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists clauses_regulation_idx on clauses(regulation_id);
create index if not exists clauses_category_idx on clauses(category);
create index if not exists clauses_severity_idx on clauses(severity);

-- ============================================
-- Analysis Jobs table (persist job status)
-- ============================================
create table if not exists analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  job_id text unique not null,
  status text default 'pending',  -- pending, processing, completed, failed
  progress int default 0,
  sop_filename text,
  regulation_ids uuid[] default '{}',
  results jsonb,
  error text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create index if not exists analysis_jobs_job_id_idx on analysis_jobs(job_id);
create index if not exists analysis_jobs_status_idx on analysis_jobs(status);

-- ============================================
-- Vector similarity search function
-- ============================================
create or replace function match_documents (
  query_embedding vector(384),
  match_count int default 10,
  filter_collection text default null
)
returns table (
  id text,
  collection text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    d.id,
    d.collection,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where (filter_collection is null or d.collection = filter_collection)
  order by d.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ============================================
-- Permissions
-- ============================================
grant usage on schema public to anon, authenticated;
grant all on documents to anon, authenticated;
grant all on regulations to anon, authenticated;
grant all on clauses to anon, authenticated;
grant all on analysis_jobs to anon, authenticated;
grant execute on function match_documents to anon, authenticated;
