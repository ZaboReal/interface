# Task 2: Regulatory Compliance Analysis

An intelligent document processing system that analyzes Standard Operating Procedures (SOPs) against regulatory requirements, identifying compliance gaps and generating actionable reports.

## Thought Process & Approach

### The Problem
Organizations must ensure their SOPs comply with numerous industry regulations (OSHA, EPA, NFPA, API, etc.). Manual compliance checking is:
- Time-consuming (regulations can be hundreds of pages)
- Error-prone (easy to miss requirements)
- Expensive (requires specialized compliance officers)
- Difficult to maintain (regulations update frequently)

### Our Solution
We built an LLM-powered compliance analysis pipeline that:

1. **Extracts Clauses from Regulations**: Parses regulation PDFs and uses GPT-4 to extract individual requirements, categorizing them by type (mandatory/recommended/prohibited), severity, and category.

2. **SOP-First Analysis**: Rather than checking every clause against the SOP (which would flag many irrelevant requirements), we take an SOP-first approach:
   - Chunk the SOP into logical sections
   - Use semantic search to find potentially relevant clauses
   - Verify applicability with LLM reasoning
   - Report only gaps that actually apply

3. **Parallel Processing**: Regulations can have hundreds of clauses. We process them in parallel (10 concurrent LLM calls) to keep analysis times reasonable.

4. **Vector Search**: Clauses are embedded and stored in a vector database (Chroma), enabling semantic search rather than just keyword matching.

### Technical Decisions

- **LLM for Clause Extraction**: Regulations are written in complex legal language. Rule-based extraction would miss nuances, so we use GPT-4 to understand context and extract structured data.

- **Page-by-Page Processing**: We process PDFs one page at a time rather than the whole document. This improves accuracy and allows for better source tracking.

- **SOP-First vs Clause-First**: We chose SOP-first analysis because:
  - Most regulations contain clauses irrelevant to any given SOP
  - Users care about gaps in *their* document, not all possible requirements
  - Reduces false positives and noise in reports

- **Semantic Search + LLM Verification**: Two-stage matching - vector similarity finds candidates, then LLM confirms relevance. This balances speed with accuracy.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Compliance Pipeline                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │ PDF/DOCX │───►│ Unstructured │───►│ Clause Extractor │   │
│  │ Upload   │    │ Parser       │    │ (GPT-4 Parallel) │   │
│  └──────────┘    └──────────────┘    └────────┬────────┘   │
│                                               │             │
│                                               ▼             │
│                                      ┌─────────────────┐   │
│                                      │ Vector DB       │   │
│                                      │ (Chroma)        │   │
│                                      └────────┬────────┘   │
│                                               │             │
│  ┌──────────┐    ┌──────────────┐            │             │
│  │ SOP      │───►│ Chunk SOP    │◄───────────┘             │
│  │ Upload   │    │ Into Sections│    Semantic Search       │
│  └──────────┘    └──────┬───────┘                          │
│                         │                                   │
│                         ▼                                   │
│                  ┌──────────────┐                           │
│                  │ SOP Analyzer │                           │
│                  │ (LLM Verify) │                           │
│                  └──────┬───────┘                           │
│                         │                                   │
│                         ▼                                   │
│                  ┌──────────────┐                           │
│                  │ Compliance   │                           │
│                  │ Report       │                           │
│                  └──────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

**Backend (`/backend/app/task2_regulation/`):**
- `pdf_parser.py` - Converts PDF/DOCX to parsed sections using Unstructured.io
- `clause_extractor.py` - LLM-powered extraction of requirements from regulations
- `sop_analyzer.py` - Analyzes SOP against extracted clauses

**Frontend (`/frontend/src/app/compliance/`):**
- `DocumentUploader.tsx` - Upload interface for SOP and regulations
- `RegulationsViewer.tsx` - Browse uploaded regulations
- `ClauseViewer.tsx` - View extracted clauses with filtering
- `ComplianceReport.tsx` - Interactive compliance results
- `SemanticSearch.tsx` - Search clauses by meaning
- `LogViewer.tsx` - View processing logs

### Data Models

```typescript
// Extracted Clause
interface Clause {
  id: string;
  text: string;
  type: "mandatory" | "recommended" | "prohibited";
  category: "safety" | "documentation" | "training" | "equipment" | ...;
  severity: "critical" | "important" | "advisory";
  actions: string[];
  source_document: string;
  page_range: string;
}

// Analysis Result
interface ComplianceResult {
  compliant: Clause[];      // SOP fully addresses requirement
  partial: Clause[];        // SOP partially addresses it
  non_compliant: Clause[];  // SOP contradicts requirement
  not_addressed: Clause[];  // Gap: requirement not in SOP
  summary: {
    compliance_rate: number;
    coverage_rate: number;
  };
}
```

## How to Use

### 1. Start the Application

```bash
# From the app directory
./start.sh
```

### 2. Access the Compliance Page

Navigate to `http://localhost:3000` and click on **"Compliance"** in the sidebar, or go directly to:

```
http://localhost:3000/compliance
```

### 3. Upload Regulations

1. Click the **"Upload Regulations"** section
2. Select one or more regulation PDF files (e.g., OSHA 29 CFR 1910.119)
3. Click **"Ingest"** to extract and index clauses
4. Wait for processing to complete (progress shown in logs)

### 4. Upload Your SOP

1. Click the **"Upload SOP"** section
2. Select your SOP document (PDF or DOCX)
3. The document will be parsed and chunked automatically

### 5. Run Analysis

1. Click **"Analyze Compliance"**
2. The system will:
   - Find relevant clauses for each SOP section
   - Verify applicability with LLM
   - Generate compliance report
3. View results in the Compliance Report panel

### 6. Review Results

The report shows:
- **Compliance Rate**: Percentage of applicable requirements met
- **Compliant Items**: Requirements fully addressed in SOP
- **Partial Compliance**: Requirements partially addressed
- **Gaps**: Requirements not addressed (action needed)
- **Non-Compliant**: SOP contradicts requirements (urgent action)

### 7. Semantic Search

Use the search panel to find clauses by meaning:
- Search "fire safety equipment" to find all fire-related requirements
- Search "training requirements" to find training clauses
- Results ranked by semantic similarity

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/regulation/upload/sop` | POST | Upload SOP document |
| `/api/regulation/upload/regulations` | POST | Upload regulation PDFs |
| `/api/regulation/regulations/ingest` | POST | Extract clauses from regulations |
| `/api/regulation/analyze` | POST | Start compliance analysis job |
| `/api/regulation/analyze/{job_id}` | GET | Get analysis results |
| `/api/regulation/search` | POST | Semantic search of clauses |

## Environment Variables

```env
# Backend (.env)
OPENAI_API_KEY=your-openai-key          # Required for LLM
SUPABASE_URL=your-supabase-url          # For persistence
SUPABASE_KEY=your-supabase-key
CHROMA_PERSIST_DIR=./chroma_data        # Vector DB storage
```

## Sample Regulations Included

The `/data/regulations/` folder contains sample regulations for testing:
- REG-29 CFR 1910 119 (OSHA Process Safety)
- REG-NFPA 86 (Ovens and Furnaces)
- REG-API 510 2022 (Pressure Vessel Inspection)
- REG-40 CFR Part 63 (EPA Air Quality)
- And more...
