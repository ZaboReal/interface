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

2. **SOP-First Analysis (SOP → Regulations)**: We analyze starting from the SOP and search for relevant regulations, rather than the traditional approach of checking every regulation clause against the SOP.

3. **Parallel Processing**: Regulations can have hundreds of clauses. We process them in parallel (10 concurrent LLM calls) to keep analysis times reasonable.

4. **Vector Search**: Clauses are embedded and stored in a vector database (Chroma), enabling semantic search rather than just keyword matching.

### Technical Decisions

- **LLM for Clause Extraction**: Regulations are written in complex legal language. Rule-based extraction would miss nuances, so we use GPT-4 to understand context and extract structured data.

- **Page-by-Page Processing**: We process PDFs one page at a time rather than the whole document. This improves accuracy and allows for better source tracking.

- **SOP → Regulations vs Regulations → SOP**:

  The traditional approach is **Regulations → SOP**: iterate through every regulation clause and check if the SOP addresses it. This provides complete coverage but is extremely slow (potentially thousands of LLM calls) and generates many false positives for irrelevant clauses.

  We chose **SOP → Regulations**: chunk the SOP into sections, then use semantic search to find relevant regulation clauses for each section. This is significantly faster because:
  - We only process clauses that are semantically relevant to the SOP content
  - Most regulations contain clauses irrelevant to any given SOP
  - Users care about gaps in *their* document, not all possible requirements
  - Reduces false positives and noise in reports

  **Trade-off**: We prioritized speed over exhaustive coverage. The traditional approach would catch edge cases where a regulation applies but isn't semantically similar to any SOP section, but at the cost of much longer processing times.

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

### 1. Access the Compliance Page

Click on **"Compliance"** in the sidebar to access the regulatory compliance analyzer.

### 2. Upload Regulations

1. Click the **"Upload Regulations"** section
2. Select one or more regulation PDF files (e.g., OSHA 29 CFR 1910.119)
3. Click **"Ingest"** to extract and index clauses
4. Wait for processing to complete (progress shown in logs)

### 3. Upload Your SOP

1. Click the **"Upload SOP"** section
2. Select your SOP document (PDF or DOCX)
3. The document will be parsed and chunked automatically

### 4. Run Analysis

> **Note:** Analysis can take several minutes depending on document size. The system processes regulations page-by-page with parallel LLM calls, but large documents with many clauses will take longer. Monitor progress in the logs panel.

1. Click **"Analyze Compliance"**
2. The system will:
   - Find relevant clauses for each SOP section
   - Verify applicability with LLM
   - Generate compliance report
3. View results in the Compliance Report panel

### 5. Review Results

The report shows:
- **Compliance Rate**: Percentage of applicable requirements met
- **Compliant Items**: Requirements fully addressed in SOP
- **Partial Compliance**: Requirements partially addressed
- **Gaps**: Requirements not addressed (action needed)
- **Non-Compliant**: SOP contradicts requirements (urgent action)

### 6. Semantic Search

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

## Deployment & Routing

### The HTTPS Problem

When deploying the frontend to Vercel (HTTPS), browsers block "mixed content" - an HTTPS page cannot make API calls to an HTTP backend. This means we can't directly call our EC2 FastAPI server via HTTP.

### Solution: Cloudflare Tunnel

We use Cloudflare Tunnel to provide HTTPS termination without needing a domain or SSL certificate:

```
Browser (HTTPS)
      ↓
Vercel Frontend (interface-virid-ten.vercel.app)
      ↓
Cloudflare Edge (*.trycloudflare.com)
      ↓ (encrypted tunnel)
cloudflared on EC2
      ↓
FastAPI Backend (localhost:8000)
```

### How It Works

1. `cloudflared` runs on EC2 and opens an **outbound** connection to Cloudflare
2. Cloudflare assigns a random HTTPS URL (e.g., `https://snap-summary-imaging-restructuring.trycloudflare.com`)
3. API requests to that URL are routed through the tunnel to EC2's localhost:8000
4. Cloudflare handles SSL/TLS termination, so all API calls are secure

### Environment Variables

Set in Vercel dashboard:
```
NEXT_PUBLIC_API_URL=https://<your-tunnel>.trycloudflare.com
```

### Starting the Tunnel on EC2

```bash
# SSH into EC2
ssh -i ~/.ssh/backend-key.pem ubuntu@<EC2_IP>

# Ensure backend is running
cd backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000

# In another terminal, start Cloudflare tunnel
cloudflared tunnel --url http://localhost:8000

# Note the https://*.trycloudflare.com URL and set it in Vercel
```

### Making Tunnels Persistent

The tunnel URL changes on restart. To auto-restart (but still get new URLs):

```bash
pm2 start "cloudflared tunnel --url http://localhost:8000" --name cf-backend
pm2 save
```

For permanent URLs, create a Cloudflare account and named tunnel with your own domain

