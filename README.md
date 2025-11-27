# Theta (Cell Inefficiency) Impact Dashboard

Interactive visualization comparing pciSeq runs with and without the theta (cell inefficiency) model.

## Quick Start

### 1. Generate Data

From the `/media/dimitris/Sabrent4TB/theta/` directory:

```bash
python3 generate_theta_dashboard_data.py
```

This will:
- Load cell data from `without_cell_inefficiency/` and `with_cell_inefficiency/`
- Compute regional metrics and cell type distributions
- Calculate classification transitions between the two runs
- Generate JSON files in `theta_dashboard/data/`

### 2. View Dashboard

Start a local web server:

```bash
cd theta_dashboard
python3 -m http.server 8001
```

Then open in your browser:
```
http://localhost:8001
```

## Dashboard Features

### Controls
- **Region Selector**: View data for CA1, CA2, CA3, or DG
- **Filter Toggle**: Switch between all cells or cells with ≥40 gene counts

### Visualizations

**1. Sankey Diagram (Top)**
- Shows how cell classifications changed from WITHOUT to WITH theta
- Left nodes: Classifications without theta
- Right nodes: Classifications with theta
- Link thickness: Number of cells that transitioned

**2. Bar Charts (Bottom)**
- Left: Cell type distribution WITHOUT theta
- Right: Cell type distribution WITH theta
- Top 15 cell types by count
- Color-coded by cell type

## Data Structure

```
theta_dashboard/
├── index.html              # Main page
├── css/style.css           # Styling
├── js/main.js              # Dashboard logic
├── data/
│   ├── without_theta.json  # Baseline pciSeq data
│   ├── with_theta.json     # Theta-enabled pciSeq data
│   └── cell_colour_scheme_yao.json  # Cell type colors
└── README.md
```

## Generated Data Files

### without_theta.json / with_theta.json

```json
{
  "run_id": "without_theta",
  "total_cells": 24455,
  "regions": {
    "ca1": {
      "total_cells": 3015,
      "cell_type_counts": {...},
      "purity": 35.29,
      "high_gene_count": {...}
    },
    ...
  },
  "transitions": {
    "ca1": {
      "all": [...],
      "high_gene": [...]
    },
    ...
  }
}
```

### Heatmap Artifacts

- `dg_ca1_contrib_heatmap.json`: Plotly figure JSON for the DG-in-CA1 contribution-difference heatmap
- `dg_ca1_contrib_heatmap.html`: Standalone interactive HTML for the same heatmap
- `heatmap_payloads.json`: Open data payload with genes and per-cell top-N differences for flexible in-dashboard rendering

These are produced by `generate_theta_dashboard_data.py` using shared helpers in `contrib_heatmap_utils.py`.

## Technical Notes

- **CORS Restriction**: Must use a web server (not `file://`)
- **Browser Compatibility**: Modern browsers with Plotly.js support
- **Data Size**: Lightweight JSON files (~50KB total)
- **Dependencies**: Plotly.js (loaded via CDN)
- **Heatmap Utils**: Heatmap generation logic is centralized in `contrib_heatmap_utils.py` and used by the generator.
- **Example CLI**: `examples/heatmap_dg_in_ca1.py` demonstrates building a DG-in-CA1 heatmap via the shared utils; it is optional and not required by the dashboard.

## Troubleshooting

**Dashboard not loading:**
- Ensure you're using `http://localhost:8001`, not `file://`
- Check browser console for errors
- Verify data files exist in `data/` directory

**Data generation fails:**
- Check that `without_cell_inefficiency/` and `with_cell_inefficiency/` directories exist
- Ensure `cellData.tsv` files are present in each run's `data/tsv/` folder
- Verify `bbox/` directory contains region boundary files

**Colors not showing:**
- Color scheme file may be missing
- Dashboard will use default colors if `cell_colour_scheme_yao.json` not found
