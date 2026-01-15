# Task 3: P&ID Diagram Analysis

A computer vision-powered system that analyzes Piping & Instrumentation Diagrams (P&IDs), extracts components and their connections, and cross-references against SOP design specifications to identify discrepancies.

## Thought Process & Approach

### The Problem
P&ID diagrams are critical engineering documents that show equipment, piping, and instrumentation in process plants. Ensuring these diagrams match the SOP design specifications is essential for safety and compliance. Manual verification is:
- Extremely tedious (diagrams can have hundreds of components)
- Error-prone (easy to miss mismatches in design pressures/temperatures)
- Requires specialized knowledge
- Time-consuming for multi-page diagrams

### Our Solution
We built an automated P&ID analysis pipeline that:

1. **Detects Components**: Uses YOLO object detection (via Roboflow API) to identify symbols for valves, pumps, tanks, heat exchangers, sensors, etc.

2. **Extracts Text**: OCR (Tesseract) extracts equipment tags (V-101, P-203), design specifications (275 psig, 100°F), and labels.

3. **Associates Labels with Symbols**: Matches text to nearby components based on spatial proximity.

4. **Builds a Graph**: Creates a NetworkX graph representing the P&ID topology - components as nodes, connections as edges.

5. **Parses SOP Specifications**: Extracts equipment design limits from SOP documents using LLM.

6. **Cross-References**: Compares P&ID specifications against SOP limits, identifying:
   - Matches (specs align)
   - Pressure discrepancies
   - Temperature discrepancies
   - Missing components (in SOP but not P&ID)
   - Extra components (in P&ID but not SOP)

### Technical Decisions

- **Microsoft Azure Document Intelligence Techniques**: Our vision pipeline is inspired by Microsoft Azure's document intelligence approaches for technical diagram analysis. We combine multiple CV techniques (object detection, OCR, line detection) in a pipeline architecture similar to Azure's Form Recognizer and Custom Vision services.

- **YOLO via Roboflow**: We use a pre-trained P&ID symbol detection model via Roboflow's API. This provides high accuracy without needing to train our own model. We include a fallback to traditional CV (contour detection) if the API is unavailable.

- **Parallel Multi-Page Processing**: P&IDs are often multi-page PDFs. We process pages in parallel to minimize total analysis time.

- **Graph Representation**: A graph structure naturally represents P&ID topology, enabling future queries like "find all paths from pump X to tank Y" or "what's upstream of valve Z".

- **Tolerance-Based Matching**: We use ±5 psig/°F tolerance when comparing specs, since minor differences may be acceptable and exact matches are rare in practice.

- **LLM for SOP Parsing**: SOP design limit tables vary widely in format. Rather than building rigid parsers, we use GPT-4 to intelligently extract structured data from any table format.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      P&ID Analysis Pipeline                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐         ┌─────────────────────────────────────────┐  │
│  │ P&ID PDF │────────►│           Per-Page Processing            │  │
│  └──────────┘         │  (Parallel)                              │  │
│                       │  ┌─────────────┐    ┌────────────────┐  │  │
│                       │  │ YOLO Detect │    │ OCR Text       │  │  │
│                       │  │ (Roboflow)  │    │ Extraction     │  │  │
│                       │  └──────┬──────┘    └───────┬────────┘  │  │
│                       │         │                   │           │  │
│                       │         └─────────┬─────────┘           │  │
│                       │                   ▼                     │  │
│                       │         ┌─────────────────┐             │  │
│                       │         │ Text-Symbol     │             │  │
│                       │         │ Association     │             │  │
│                       │         └────────┬────────┘             │  │
│                       │                  │                      │  │
│                       │                  ▼                      │  │
│                       │         ┌─────────────────┐             │  │
│                       │         │ Line Detection  │             │  │
│                       │         │ (Connections)   │             │  │
│                       │         └────────┬────────┘             │  │
│                       └──────────────────┼──────────────────────┘  │
│                                          │                         │
│                                          ▼                         │
│  ┌──────────┐         ┌─────────────────────────────────────────┐  │
│  │ SOP Doc  │────────►│ LLM Parse Design Limits                  │  │
│  └──────────┘         └─────────────────┬───────────────────────┘  │
│                                          │                         │
│       ┌──────────────────────────────────┴────────────┐            │
│       │                                               │            │
│       ▼                                               ▼            │
│  ┌────────────────┐                        ┌─────────────────────┐ │
│  │ Graph Builder  │                        │ Cross-Reference     │ │
│  │ (NetworkX)     │                        │ P&ID vs SOP         │ │
│  └───────┬────────┘                        └──────────┬──────────┘ │
│          │                                            │            │
│          ▼                                            ▼            │
│  ┌────────────────┐                        ┌─────────────────────┐ │
│  │ Graph JSON     │                        │ Discrepancy Report  │ │
│  │ Visualization  │                        │                     │ │
│  └────────────────┘                        └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

**Backend (`/backend/app/task3_cv/`):**
- `pid_processor.py` - PDF to image conversion and preprocessing
- `yolo_detector.py` - YOLO-based symbol detection via Roboflow
- `text_detection.py` - OCR text extraction with bounding boxes
- `line_detection.py` - Connection detection using Hough transform
- `graph_construction.py` - Builds NetworkX graph from components
- `equipment_spec_extractor.py` - Extracts design specs from P&ID text
- `sop_cross_reference.py` - Compares P&ID specs vs SOP limits
- `image_annotator.py` - Creates annotated P&ID images

**Frontend (`/frontend/src/app/pid-analysis/`):**
- `PIDUploader.tsx` - Upload interface with progress tracking
- `GraphViewer.tsx` - Interactive graph visualization
- `ComponentList.tsx` - Filterable component table
- `DiscrepancyReport.tsx` - Comparison results with export

### Data Flow Example

```
Input: P&ID "design_diagram.pdf" + SOP "operations.docx"
                    │
                    ▼
P&ID Processing:
  - Page 1: Detect V-101 (Valve), P-203 (Pump)
  - Page 2: Detect E-742-SHELL (Heat Exchanger Shell)
  - Extract specs: V-101 = 275 psig @ 100°F
  - Build graph with connections
                    │
                    ▼
SOP Processing:
  - Parse Design Limits table
  - Extract: V-101 = 275 psig @ 100°F
            E-742 = 300 psig @ 375°F
            F-715 = 150 psig @ 200°F
                    │
                    ▼
Cross-Reference:
  - V-101: ✓ MATCH (275 psig, 100°F)
  - P-203: ✓ MATCH (found in both)
  - E-742: ⚠ PRESSURE DISCREPANCY (shell specs differ)
  - F-715: ✗ NOT FOUND in P&ID (but required by SOP)
                    │
                    ▼
Report: 2 matches, 1 pressure issue, 1 missing component
```

## How to Use

### 1. Access the P&ID Analysis Page

Click on **"P&ID Analysis"** in the sidebar to access the diagram analyzer.

### 2. Upload Files

In the **UPLOAD** tab:

1. **Upload P&ID Diagram**
   - Click "Select P&ID File" or drag-and-drop
   - Supported: PDF files (can be multi-page)

2. **Upload SOP Document**
   - Click "Select SOP File" or drag-and-drop
   - Supported: PDF or DOCX files

3. Click **"START_PID_ANALYSIS"**

> **Note:** Analysis can take several minutes depending on diagram complexity. Multi-page P&IDs with many components require more processing time for YOLO detection, OCR, graph building, and LLM-based cross-referencing. Progress is shown in real-time.

### 3. Monitor Progress

The progress bar shows:
- PDF conversion status
- Component detection progress (per page)
- Text extraction status
- Graph building status
- SOP parsing status
- Cross-reference status

### 4. View Results

Navigate through the tabs:

#### GRAPH Tab
- Interactive visualization of P&ID topology
- Nodes = Components (color-coded by type)
- Edges = Connections between components
- Click nodes for details

#### COMPONENTS Tab
- Table of all detected components
- Columns: Tag, Type, Confidence, Page, Specifications
- Filter by component type (valve, pump, tank, etc.)
- Sort by any column

#### DISCREPANCIES Tab
- **Status Banner**: Overall pass/fail with match percentage
- **Matched Items**: Equipment found in both P&ID and SOP with matching specs (green checkmarks)
- **Discrepancies**: Items with spec mismatches (yellow warnings)
- **Missing in P&ID**: SOP items not found in diagram (red X)
- **Extra in P&ID**: Components not in SOP (blue info)
- **Export**: Download report as CSV or JSON

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cv/analyze` | POST | Start P&ID analysis job |
| `/api/cv/status/{job_id}` | GET | Get analysis progress |
| `/api/cv/graph/{job_id}` | GET | Get component graph JSON |
| `/api/cv/components/{job_id}` | GET | Get detected components |
| `/api/cv/sop-components/{job_id}` | GET | Get SOP equipment list |
| `/api/cv/discrepancies/{job_id}` | GET | Get cross-reference report |
| `/api/cv/annotated-images/{job_id}` | GET | Get annotated P&ID images |

## Detection Capabilities

### Supported Component Types
| Type | Examples |
|------|----------|
| Valve | Gate, Globe, Ball, Check, Control valves |
| Pump | Centrifugal, Positive displacement |
| Tank | Storage tanks, Vessels |
| Heat Exchanger | Shell & tube, Plate |
| Sensor | Pressure, Temperature, Flow, Level |
| Instrument | Controllers, Indicators |
| Compressor | Gas compressors |
| Filter | In-line filters, Strainers |

### Extracted Specifications
- Design Pressure (psig, psi, bar)
- Design Temperature (°F, °C)
- Equipment Tags (V-101, P-203, E-742)
- Line Numbers
- Service descriptions

## Limitations & Future Improvements

**Current Limitations:**
- Detection accuracy depends on P&ID drawing quality
- Very dense diagrams may have text association errors
- Non-standard symbols may not be recognized

**Planned Improvements:**
- Custom YOLO model training for better accuracy
- Support for ISA symbol standards
- Line flow direction detection
- Equipment datasheet cross-reference
- Export to CAD formats

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
