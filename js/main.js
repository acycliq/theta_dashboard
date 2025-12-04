// Global state
const state = {
    baseData: null,
    altData: null,
    currentRegion: 'ca1',
    currentFilter: 'all',
    cellColors: null,
    thetaRegion: 'ca1',
    thetaData: null,
    useDensityPlot: true,
    componentsRegion: 'ca1',
    componentsMode: 'shape', // 'shape' | 'rate'
    selectedCellNum: null,
    heatmapRegion: 'ca1',
    heatmapPredictedClasses: [],  // Array of selected predicted classes (multi-select)
    heatmapDesiredClass: null,    // Will be set when payload loads
    heatmapTopN: 3,
    heatmapPayloadCache: {},  // Cache payloads by region: {ca1: {...}, ca2: {...}, ...}
    geneScatterData: null,    // Gene scatter data (exp vs counts)
    geneScatterGroup: 'dg_in_ca1',  // Currently selected group
    geneScatterCell: null     // Currently selected cell index
};

// Region display names
const REGION_NAMES = {
    'ca1': 'CA1',
    'ca2': 'CA2',
    'ca3': 'CA3',
    'dg': 'Dentate Gyrus (DG)'
};

// Simplified class color palette
const SIMPLE_CLASS_COLORS = {
    'CA1': '#1f77b4',
    'CA2': '#ff7f0e',
    'CA3': '#9467bd',
    'DG': '#2ca02c',
    'Astro': '#17becf',
    'Oligo': '#8c564b',
    'L5': '#e377c2',
    'L6': '#bcbd22',
    'Other': '#7f7f7f',
    'Zero': '#000000'
};

// Initialize dashboard
async function init() {
    try {
        showLoading(true);

        // Load both datasets
        state.baseData = await loadJSON('data/without_theta.json');
        state.altData = await loadJSON('data/with_theta.json');

        // Try to load color scheme
        try {
            state.cellColors = await loadJSON('data/cell_colour_scheme_yao.json');
        } catch (e) {
            console.warn('Color scheme not found, using default colors');
            state.cellColors = {};
        }

        // Set up event listeners
        setupEventListeners();

        // Render initial charts
        updateCharts();

        showLoading(false);

    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showError();
    }
}

// Load JSON file
async function loadJSON(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }
    return await response.json();
}

// Set up event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Region selector (comparison tab)
    document.getElementById('regionSelect').addEventListener('change', (e) => {
        state.currentRegion = e.target.value;
        updateCharts();
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Update filter
            state.currentFilter = e.target.dataset.filter;
            updateCharts();
        });
    });

    // Theta region selector
    document.getElementById('thetaRegionSelect').addEventListener('change', (e) => {
        state.thetaRegion = e.target.value;
        renderThetaHistograms();
    });

    // Density plot toggle
    document.getElementById('useDensityPlot').addEventListener('change', (e) => {
        state.useDensityPlot = e.target.checked;
        renderThetaHistograms();
    });

    // Components region selector
    const compSelect = document.getElementById('componentsRegionSelect');
    if (compSelect) {
        compSelect.addEventListener('change', (e) => {
            state.componentsRegion = e.target.value;
            renderComponentsScatter();
        });
    }

    // Components mode buttons (shape vs rate)
    const compModeBtns = document.querySelectorAll('.comp-mode-btn');
    compModeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.comp-mode-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.componentsMode = e.target.dataset.mode;
            renderComponentsScatter();
        });
    });

    // Single cell: load by Cell_Num
    const loadBtn = document.getElementById('loadCellButton');
    const cellInput = document.getElementById('cellNumInput');
    if (loadBtn && cellInput) {
        const loadHandler = () => {
            const val = cellInput.value.trim();
            if (val) {
                state.selectedCellNum = Number(val);
                renderCellComponents();
            }
        };
        loadBtn.addEventListener('click', loadHandler);
        cellInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadHandler();
        });
    }

    // Heatmap controls
    const regionSel = document.getElementById('heatmapRegionSelect');
    const predictedClassSel = document.getElementById('heatmapPredictedClassSelect');
    const desiredClassSel = document.getElementById('heatmapDesiredClassSelect');
    const topNSel = document.getElementById('heatmapTopN');
    if (regionSel && predictedClassSel && desiredClassSel && topNSel) {
        // Class dropdowns will be populated dynamically when payload loads
        regionSel.value = state.heatmapRegion;
        topNSel.value = state.heatmapTopN;

        regionSel.addEventListener('change', async (e) => {
            state.heatmapRegion = e.target.value;
            await ensureHeatmapPayloadLoaded();
            renderDGCA1HeatmapFromPayload();
        });
        predictedClassSel.addEventListener('change', async (e) => {
            // Get all selected options from multi-select
            state.heatmapPredictedClasses = Array.from(e.target.selectedOptions).map(opt => opt.value);
            await ensureHeatmapPayloadLoaded();
            renderDGCA1HeatmapFromPayload();
        });
        desiredClassSel.addEventListener('change', async (e) => {
            state.heatmapDesiredClass = e.target.value;
            await ensureHeatmapPayloadLoaded();
            renderDGCA1HeatmapFromPayload();
        });
        topNSel.addEventListener('change', async (e) => {
            state.heatmapTopN = Number(e.target.value);
            await ensureHeatmapPayloadLoaded();
            renderDGCA1HeatmapFromPayload();
        });
    }

    // Gene scatter controls (Scaled Expression tab)
    const geneScatterGroupSel = document.getElementById('geneScatterGroupSelect');
    const geneScatterCellSel = document.getElementById('geneScatterCellSelect');

    if (geneScatterGroupSel) {
        geneScatterGroupSel.addEventListener('change', (e) => {
            state.geneScatterGroup = e.target.value;
            state.geneScatterCell = null; // Reset cell selection
            populateGeneScatterCellDropdown();
            renderGeneScatterPlot();
        });
    }
    if (geneScatterCellSel) {
        geneScatterCellSel.addEventListener('change', (e) => {
            state.geneScatterCell = parseInt(e.target.value);
            renderGeneScatterPlot();
        });
    }
}

// Switch between tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tabName === 'comparison') {
        document.getElementById('comparisonTab').classList.add('active');
    } else if (tabName === 'theta') {
        document.getElementById('thetaTab').classList.add('active');
        // Render theta histograms if not already rendered
        if (!state.thetaData && state.altData && state.altData.theta_data) {
            state.thetaData = state.altData.theta_data;
            renderThetaHistograms();
        }
    } else if (tabName === 'components') {
        document.getElementById('componentsTab').classList.add('active');
        if (!state.thetaData && state.altData && state.altData.theta_data) {
            state.thetaData = state.altData.theta_data;
        }
        renderComponentsScatter();
    } else if (tabName === 'cell') {
        document.getElementById('cellTab').classList.add('active');
        if (!state.thetaData && state.altData && state.altData.theta_data) {
            state.thetaData = state.altData.theta_data;
        }
        // If no cell selected yet, default to the first entry with components
        if (!state.selectedCellNum && state.thetaData && state.thetaData.length > 0) {
            const first = state.thetaData.find(c => typeof c.shape_user === 'number' && typeof c.shape_data === 'number');
            if (first) {
                state.selectedCellNum = first.cell_num || null;
                const input = document.getElementById('cellNumInput');
                if (input && state.selectedCellNum != null) input.value = state.selectedCellNum;
            }
        }
        renderCellComponents();
    } else if (tabName === 'heatmap') {
        document.getElementById('heatmapTab').classList.add('active');
        // Defer rendering until after layout/paint so container has dimensions
        const run = async () => {
            await ensureHeatmapPayloadLoaded();
            renderDGCA1HeatmapFromPayload();
        };
        if (window.requestAnimationFrame) requestAnimationFrame(run); else setTimeout(run, 0);
    } else if (tabName === 'gene-scatter') {
        document.getElementById('geneScatterTab').classList.add('active');

        if (!state.geneScatterData) {
            loadGeneScatterData().then(() => {
                populateGeneScatterCellDropdown();
                renderGeneScatterPlot();
            });
        } else {
            populateGeneScatterCellDropdown();
            renderGeneScatterPlot();
        }
    }
}

// Update all charts
function updateCharts() {
    if (!state.baseData || !state.altData) return;

    renderSankeyChart();
    renderCountsCharts();
}

// Ensure payload is loaded for the current region
async function ensureHeatmapPayloadLoaded() {
    const region = state.heatmapRegion;

    // Check if already cached
    if (state.heatmapPayloadCache[region]) return;

    try {
        const resp = await fetch(`data/heatmap_payloads_${region}.json`, { cache: 'no-store' });
        if (!resp.ok) {
            console.error(`Failed to load heatmap payload for ${region}`);
            return;
        }
        state.heatmapPayloadCache[region] = await resp.json();

        // Populate Class dropdown with actual class names from payload (only once, they're the same for all regions)
        if (Object.keys(state.heatmapPayloadCache).length === 1) {
            populateClassDropdown();
        }
    } catch (e) {
        console.error(`Failed to load heatmap payloads for ${region}:`, e);
    }
}

// Populate Class dropdowns with actual class names
function populateClassDropdown() {
    const predictedClassSel = document.getElementById('heatmapPredictedClassSelect');
    const desiredClassSel = document.getElementById('heatmapDesiredClassSelect');

    // Get class names from any cached region (they're all the same)
    const firstRegion = Object.keys(state.heatmapPayloadCache)[0];
    if (!predictedClassSel || !desiredClassSel || !firstRegion) return;

    const payload = state.heatmapPayloadCache[firstRegion];
    if (!payload) return;

    // Populate Predicted Class with ALL classes
    const allClassNames = payload.all_class_names || [];
    if (allClassNames.length > 0) {
        const allOptions = allClassNames.map(name => `<option value="${name}">${name}</option>`).join('');
        predictedClassSel.innerHTML = allOptions;

        // Default predicted classes to both DG variants if available
        const dgClasses = allClassNames.filter(name => name.startsWith('037 DG Glut') || name.startsWith('038 DG-PIR'));
        state.heatmapPredictedClasses = dgClasses.length > 0 ? dgClasses : [allClassNames[0]];

        // Select the default options in the multi-select
        Array.from(predictedClassSel.options).forEach(option => {
            option.selected = state.heatmapPredictedClasses.includes(option.value);
        });
    }

    // Populate Desired Class with only curated comparison classes
    const comparisonClasses = payload.comparison_classes || [];
    if (comparisonClasses.length > 0) {
        const compOptions = comparisonClasses.map(name => `<option value="${name}">${name}</option>`).join('');
        desiredClassSel.innerHTML = compOptions;

        // Default desired class to CA1 if available, otherwise first class
        const ca1Class = comparisonClasses.find(name => name.startsWith('016 CA1'));
        state.heatmapDesiredClass = ca1Class || comparisonClasses[0];
        desiredClassSel.value = state.heatmapDesiredClass;
    }
}

// Render side-by-side bar charts
function renderCountsCharts() {
    const region = state.currentRegion;
    const filterKey = state.currentFilter === 'high_gene' ? 'high_gene_count' : '';

    // Update titles
    document.getElementById('baseChartTitle').textContent =
        `WITHOUT Theta - Distribution in ${REGION_NAMES[region]}`;
    document.getElementById('altChartTitle').textContent =
        `WITH Theta - Distribution in ${REGION_NAMES[region]}`;

    // Get data
    const baseRegion = state.baseData.regions[region];
    const altRegion = state.altData.regions[region];

    const baseCounts = filterKey ? baseRegion[filterKey].cell_type_counts : baseRegion.cell_type_counts;
    const altCounts = filterKey ? altRegion[filterKey].cell_type_counts : altRegion.cell_type_counts;

    // Render charts
    renderBarChart('baseCountsChart', baseCounts, 'WITHOUT Theta');
    renderBarChart('altCountsChart', altCounts, 'WITH Theta');
}

// Render a single bar chart
function renderBarChart(elementId, counts, title) {
    // Sort by count descending
    const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);  // Top 15

    const labels = sorted.map(([label, _]) => label);
    const values = sorted.map(([_, count]) => count);

    // Get colors for each cell type
    const colors = labels.map(label => getCellColor(label));

    const trace = {
        x: labels,
        y: values,
        type: 'bar',
        marker: {
            color: colors
        }
    };

    const layout = {
        xaxis: {
            tickangle: -45,
            automargin: true
        },
        yaxis: {
            title: 'Cell Count',
            automargin: true
        },
        height: 450,
        margin: { l: 60, r: 20, t: 20, b: 120 }
    };

    Plotly.newPlot(elementId, [trace], layout, {responsive: true});
}

// Get color for a cell type
function getCellColor(cellType) {
    // Special cases
    if (cellType === 'Zero') return '#000000';
    if (cellType === 'Other') return '#7f7f7f';

    // Try to get from color scheme
    if (state.cellColors && state.cellColors[cellType]) {
        return state.cellColors[cellType];
    }

    // Fallback to simplified class colors
    const simplified = simplifyClassLabel(cellType);
    return SIMPLE_CLASS_COLORS[simplified] || '#1f77b4';
}

// Render Sankey diagram
function renderSankeyChart() {
    const region = state.currentRegion;
    const filterKey = state.currentFilter === 'high_gene' ? 'high_gene' : 'all';

    // Get transition data
    const transitions = state.altData.transitions[region][filterKey];

    // Fixed simplified class order
    const SIMPLIFIED_CLASSES = ['Astro', 'CA1', 'CA2', 'CA3', 'DG', 'L5', 'L6', 'Oligo', 'Other', 'Zero'];

    // Node labels
    const nodeLabels = [
        ...SIMPLIFIED_CLASSES.map(c => `${c} (Without)`),
        ...SIMPLIFIED_CLASSES.map(c => `${c} (With)`)
    ];

    // Index maps
    const classToBeforeIdx = {};
    const classToAfterIdx = {};
    SIMPLIFIED_CLASSES.forEach((c, i) => {
        classToBeforeIdx[c] = i;
        classToAfterIdx[c] = i + SIMPLIFIED_CLASSES.length;
    });

    // Build links from transitions
    const sources = [];
    const targets = [];
    const values = [];
    transitions.forEach(t => {
        if (classToBeforeIdx[t.from] != null && classToAfterIdx[t.to] != null) {
            sources.push(classToBeforeIdx[t.from]);
            targets.push(classToAfterIdx[t.to]);
            values.push(t.count);
        }
    });

    // Node colors
    const nodeColors = new Array(SIMPLIFIED_CLASSES.length * 2).fill('#FFFFFF');
    SIMPLIFIED_CLASSES.forEach((cls, i) => {
        const color = SIMPLE_CLASS_COLORS[cls] || '#1f77b4';
        nodeColors[i] = color; // Base
        nodeColors[i + SIMPLIFIED_CLASSES.length] = color; // Alt
    });

    const data = [{
        type: 'sankey',
        valueformat: ',.0f',
        valuesuffix: ' cells',
        node: {
            label: nodeLabels,
            color: nodeColors,
            pad: 15,
            thickness: 20,
            line: { color: 'black', width: 0.5 },
            hovertemplate: '%{label}<br>%{value:,.0f} cells<extra></extra>'
        },
        link: {
            source: sources,
            target: targets,
            value: values,
            color: new Array(values.length).fill('rgba(0,0,0,0.2)'),
            hovertemplate: '%{source.label} → %{target.label}<br>%{value:,.0f} cells<extra></extra>'
        }
    }];

    const layout = {
        height: 550,
        font: { size: 11 },
        margin: { l: 10, r: 10, t: 10, b: 10 }
    };

    Plotly.newPlot('sankeyChart', data, layout, {responsive: true});
}

// Simplify full class labels to Sankey categories
function simplifyClassLabel(label) {
    if (!label || typeof label !== 'string') return 'Other';
    if (label.startsWith('016 CA1')) return 'CA1';
    if (label.startsWith('025 CA2')) return 'CA2';
    if (label.startsWith('017 CA3')) return 'CA3';
    if (label.startsWith('037 DG Glut') || label.startsWith('038 DG-PIR')) return 'DG';
    if (label.startsWith('319 Astro')) return 'Astro';
    if (label.startsWith('327 Oligo')) return 'Oligo';
    if (label.startsWith('005 L5 IT') || label.startsWith('022 L5 ET') || label.startsWith('032 L5 NP')) return 'L5';
    if (label.startsWith('030 L6 CT') || label.startsWith('004 L6 IT') || label.startsWith('029 L6b CTX')) return 'L6';
    if (label.startsWith('Zero')) return 'Zero';
    return 'Other';
}

// Kernel Density Estimation
function kernelDensityEstimate(data, numPoints = 100) {
    // Gaussian kernel
    function gaussianKernel(u) {
        return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    }

    // Compute bandwidth using Silverman's rule of thumb
    const n = data.length;
    const std = Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / n - Math.pow(data.reduce((sum, x) => sum + x, 0) / n, 2));
    const bandwidth = 1.06 * std * Math.pow(n, -0.2);

    // Create evaluation points
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const step = range / (numPoints - 1);

    const x = [];
    const y = [];

    for (let i = 0; i < numPoints; i++) {
        const xi = min + i * step;
        x.push(xi);

        // Compute density at xi
        let density = 0;
        for (let j = 0; j < n; j++) {
            const u = (xi - data[j]) / bandwidth;
            density += gaussianKernel(u);
        }
        density /= (n * bandwidth);
        y.push(density);
    }

    return { x, y };
}

/**
 * Build histogram panel configurations for the theta distribution grid.
 * @param {string} region - Region name (ca1, ca2, ca3, dg)
 * @returns {Array} Array of panel configurations with title and filter function
 */
function buildThetaPanelConfigs(region) {
    const regionKey = `in_${region}`;
    const correctKey = `is_${region}`;
    const regionName = REGION_NAMES[region];

    return [
        { title: `${regionName} in ${regionName}`, filter: cell => cell[regionKey] && cell[correctKey] },
        { title: `CA2 in ${regionName}`, filter: cell => cell[regionKey] && cell.is_ca2 },
        { title: `CA3 in ${regionName}`, filter: cell => cell[regionKey] && cell.is_ca3 },
        { title: `DG in ${regionName}`, filter: cell => cell[regionKey] && cell.is_dg },
        { title: `L2/3 in ${regionName}`, filter: cell => cell[regionKey] && cell.is_L23 },
        { title: `L4/5 in ${regionName}`, filter: cell => cell[regionKey] && cell.is_L45 },
        { title: `L6 in ${regionName}`, filter: cell => cell[regionKey] && cell.is_L6 },
        { title: `non-${regionName} in ${regionName}`, filter: cell => cell[regionKey] && !cell[correctKey] && !cell.is_zero },
        { title: `Zero in ${regionName}`, filter: cell => cell[regionKey] && cell.is_zero }
    ];
}

/**
 * Create density plot traces (KDE curve + mean line).
 * @param {Array} thetaValues - Array of theta values
 * @param {number} mean - Mean theta value
 * @returns {Object} Object with traces and layout for Plotly
 */
function createDensityPlot(thetaValues, mean, title) {
    const kde = kernelDensityEstimate(thetaValues, 100);

    const densityTrace = {
        x: kde.x,
        y: kde.y,
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        fillcolor: 'rgba(102, 126, 234, 0.3)',
        line: { color: '#4c51bf', width: 2 },
        name: 'Density',
        showlegend: false
    };

    const meanTrace = {
        x: [mean, mean],
        y: [0, Math.max(...kde.y)],
        type: 'scatter',
        mode: 'lines',
        line: { color: '#e74c3c', width: 2, dash: 'dash' },
        name: `Mean: ${mean.toFixed(3)}`,
        showlegend: false,
        hovertemplate: `Mean: ${mean.toFixed(3)}<extra></extra>`
    };

    const layout = {
        title: { text: `${title} (N=${thetaValues.length}, mean=${mean.toFixed(3)})`, font: { size: 12 } },
        xaxis: { title: 'theta' },
        yaxis: { title: 'Density' },
        showlegend: false,
        height: 300,
        margin: { l: 50, r: 20, t: 40, b: 50 }
    };

    return { traces: [densityTrace, meanTrace], layout };
}

/**
 * Create histogram plot traces (bar chart + mean line annotation).
 * @param {Array} thetaValues - Array of theta values
 * @param {number} mean - Mean theta value
 * @returns {Object} Object with traces and layout for Plotly
 */
function createHistogramPlot(thetaValues, mean, title) {
    const histogramTrace = {
        x: thetaValues,
        type: 'histogram',
        nbinsx: 30,
        marker: { color: '#667eea', line: { color: '#4c51bf', width: 1 } },
        name: 'Frequency',
        showlegend: false
    };

    const layout = {
        title: { text: `${title} (N=${thetaValues.length}, mean=${mean.toFixed(3)})`, font: { size: 12 } },
        xaxis: { title: 'theta' },
        yaxis: { title: 'Count' },
        showlegend: false,
        height: 300,
        margin: { l: 50, r: 20, t: 40, b: 50 },
        shapes: [{
            type: 'line',
            x0: mean, x1: mean,
            y0: 0, y1: 1,
            yref: 'paper',
            line: { color: '#e74c3c', width: 2, dash: 'dash' }
        }],
        annotations: [{
            x: mean, y: 1,
            yref: 'paper',
            text: `mean=${mean.toFixed(3)}`,
            showarrow: false,
            yanchor: 'bottom',
            font: { color: '#e74c3c', size: 10 }
        }]
    };

    return { traces: [histogramTrace], layout };
}

/**
 * Render a single theta histogram panel.
 * @param {Object} panel - Panel configuration with title and filter
 * @param {number} index - Panel index for DOM element ID
 */
function renderSingleThetaHistogram(panel, index) {
    const elementId = `histogram-${index}`;
    const item = document.getElementById(elementId);
    if (!item) return;

    // Filter and extract theta values
    const filteredCells = state.thetaData.filter(panel.filter);
    const thetaValues = filteredCells.map(cell => cell.theta);

    // Handle empty case
    if (thetaValues.length === 0) {
        item.innerHTML = `<h3>${panel.title}</h3><div class="histogram-plot" style="display:flex;align-items:center;justify-content:center;color:#9ca3af;">No cells (N=0)</div>`;
        return;
    }

    // Calculate mean
    const mean = thetaValues.reduce((sum, val) => sum + val, 0) / thetaValues.length;

    // Create plot (density or histogram based on state)
    const plot = state.useDensityPlot
        ? createDensityPlot(thetaValues, mean, panel.title)
        : createHistogramPlot(thetaValues, mean, panel.title);

    // Render with Plotly
    Plotly.newPlot(elementId, plot.traces, plot.layout, {responsive: true});
}

/**
 * Render theta histograms for selected region in a 3x3 grid.
 */
function renderThetaHistograms() {
    if (!state.thetaData) return;

    // Build panel configurations
    const panels = buildThetaPanelConfigs(state.thetaRegion);

    // Create grid container with DOM elements
    const gridContainer = document.getElementById('thetaHistograms');
    gridContainer.innerHTML = '';
    panels.forEach((_, index) => {
        const item = document.createElement('div');
        item.className = 'histogram-item';
        item.id = `histogram-${index}`;
        gridContainer.appendChild(item);
    });

    // Render each panel
    panels.forEach((panel, index) => renderSingleThetaHistogram(panel, index));
}

// Render 3x3 scatter grids comparing user-defined vs data-driven components
function renderComponentsScatter() {
    if (!state.thetaData) return;

    const region = state.componentsRegion;
    const regionKey = `in_${region}`;
    const correctKey = `is_${region}`;
    const isShape = state.componentsMode === 'shape';
    const xKey = isShape ? 'shape_user' : 'rate_user';
    const yKey = isShape ? 'shape_data' : 'rate_data';

    // Define the 3x3 grid layout (same subsets as theta tab)
    const panels = [
        { title: `${REGION_NAMES[region]} in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c[correctKey] },
        { title: `CA2 in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_ca2 },
        { title: `CA3 in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_ca3 },
        { title: `DG in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_dg },
        { title: `L2/3 in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_L23 },
        { title: `L4/5 in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_L45 },
        { title: `L6 in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_L6 },
        { title: `non-${REGION_NAMES[region]} in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && !c[correctKey] && !c.is_zero },
        { title: `Zero in ${REGION_NAMES[region]}`, filter: c => c[regionKey] && c.is_zero }
    ];

    const grid = document.getElementById('componentsGrid');
    grid.innerHTML = '';

    panels.forEach((panel, idx) => {
        const item = document.createElement('div');
        item.className = 'histogram-item';
        const plotId = `components-${idx}`;
        item.innerHTML = `<h3>${panel.title}</h3><div id="${plotId}" class="histogram-plot"></div>`;
        grid.appendChild(item);

        const cells = state.thetaData.filter(panel.filter);

        // Build paired points only when both x and y are present and finite
        const x = [];
        const y = [];
        const cellNums = [];
        const thetas = [];
        for (const c of cells) {
            const xv = c[xKey];
            const yv = c[yKey];
            if (typeof xv === 'number' && isFinite(xv) && typeof yv === 'number' && isFinite(yv)) {
                x.push(xv);
                y.push(yv);
                cellNums.push(c.cell_num ?? null);
                thetas.push(typeof c.theta === 'number' ? c.theta : null);
            }
        }

        if (x.length === 0) {
            document.getElementById(plotId).innerHTML = '<div style="display:flex;align-items:center;justify-content:center;color:#9ca3af;height:100%">No cells (N=0)</div>';
            return;
        }
        const n = x.length;

        const maxVal = Math.max(
            Math.max(...x),
            Math.max(...y)
        );
        const pad = maxVal * 0.05;

        const trace = {
            x,
            y,
            type: 'scatter',
            mode: 'markers',
            marker: { size: 5, color: '#4c51bf', opacity: 0.7 },
            customdata: x.map((_, i) => [cellNums[i], thetas[i]]),
            hovertemplate: 'Cell_Num: %{customdata[0]}<br>theta_bar: %{customdata[1]:.4f}<br>' +
                           'user: %{x:.3f}<br>data: %{y:.3f}<extra></extra>'
        };

        const layout = {
            title: { text: `${panel.title} (N=${n})`, font: { size: 12 } },
            xaxis: { title: `${isShape ? 'Shape' : 'Rate'}: user-defined component`, rangemode: 'tozero' },
            yaxis: { title: `${isShape ? 'Shape' : 'Rate'}: data-driven component`, scaleanchor: 'x', scaleratio: 1, rangemode: 'tozero' },
            height: 300,
            margin: { l: 50, r: 20, t: 40, b: 50 },
            shapes: [{
                type: 'line',
                x0: 0,
                y0: 0,
                x1: maxVal + pad,
                y1: maxVal + pad,
                line: { color: '#e74c3c', width: 2, dash: 'dash' }
            }]
        };

        Plotly.newPlot(plotId, [trace], layout, { responsive: true });
    });
}

// Render stacked bars for a single cell's components (shape and rate)
function renderCellComponents() {
    const shapeTitle = document.getElementById('cellShapeTitle');
    const rateTitle = document.getElementById('cellRateTitle');
    const shapeEl = document.getElementById('cellShapeChart');
    const rateEl = document.getElementById('cellRateChart');
    if (!shapeEl || !rateEl) return;

    if (!state.thetaData || state.thetaData.length === 0) {
        shapeEl.innerHTML = 'No theta data available.';
        rateEl.innerHTML = 'No theta data available.';
        return;
    }

    // Find by Cell_Num
    const cellNum = state.selectedCellNum;
    const cell = state.thetaData.find(c => c.cell_num === cellNum);
    if (!cell) {
        shapeEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af">Cell not found</div>';
        rateEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af">Cell not found</div>';
        if (shapeTitle) shapeTitle.textContent = 'Shape Components';
        if (rateTitle) rateTitle.textContent = 'Rate Components';
        return;
    }

    const su = cell.shape_user;
    const sd = cell.shape_data;
    const ru = cell.rate_user;
    const rd = cell.rate_data;
    const theta = cell.theta;

    // Validate numeric components
    const hasShape = typeof su === 'number' && isFinite(su) && typeof sd === 'number' && isFinite(sd);
    const hasRate = typeof ru === 'number' && isFinite(ru) && typeof rd === 'number' && isFinite(rd);

    // Titles
    if (shapeTitle) shapeTitle.innerHTML = hasShape
        ? `Shape Components<br>Cell_Num ${cellNum}: total=${(su+sd).toFixed(3)}`
        : `Shape Components<br>Cell_Num ${cellNum}`;
    if (rateTitle) rateTitle.innerHTML = hasRate
        ? `Rate Components<br>Cell_Num ${cellNum}: total=${(ru+rd).toFixed(3)}, θ=${(theta).toFixed(4)}`
        : `Rate Components<br>Cell_Num ${cellNum}`;

    // Render shape stacked bar
    if (hasShape) {
        const traceUser = { x: ['shape'], y: [su], name: 'User-defined', type: 'bar', marker: { color: '#6366f1' }, hovertemplate: 'User-defined: %{y:.4f}<extra></extra>' };
        const traceData = { x: ['shape'], y: [sd], name: 'Data-driven', type: 'bar', marker: { color: '#10b981' }, hovertemplate: 'Data-driven: %{y:.4f}<extra></extra>' };
        const layout = { barmode: 'stack', yaxis: { title: 'Shape value' }, xaxis: { title: '' }, height: 400, margin: { l: 60, r: 20, t: 30, b: 40 } };
        Plotly.newPlot('cellShapeChart', [traceUser, traceData], layout, { responsive: true });
    } else {
        shapeEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af">No shape components for this cell</div>';
    }

    // Render rate stacked bar
    if (hasRate) {
        const traceUser = { x: ['rate'], y: [ru], name: 'User-defined', type: 'bar', marker: { color: '#6366f1' }, hovertemplate: 'User-defined: %{y:.4f}<extra></extra>' };
        const traceData = { x: ['rate'], y: [rd], name: 'Data-driven', type: 'bar', marker: { color: '#10b981' }, hovertemplate: 'Data-driven: %{y:.4f}<extra></extra>' };
        const layout = { barmode: 'stack', yaxis: { title: 'Rate value' }, xaxis: { title: '' }, height: 400, margin: { l: 60, r: 20, t: 30, b: 40 } };
        Plotly.newPlot('cellRateChart', [traceUser, traceData], layout, { responsive: true });
    } else {
        rateEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af">No rate components for this cell</div>';
    }
}

// Show/hide loading indicator
function showLoading(show) {
    const indicator = document.getElementById('loadingIndicator');
    const content = document.getElementById('mainContent');

    if (show) {
        indicator.classList.remove('hidden');
        content.style.opacity = '0.3';
    } else {
        indicator.classList.add('hidden');
        content.style.opacity = '1';
    }
}

// Show error message
function showError() {
    const errorMsg = document.getElementById('errorMessage');
    const loading = document.getElementById('loadingIndicator');
    const content = document.getElementById('mainContent');

    loading.classList.add('hidden');
    content.classList.add('hidden');
    errorMsg.classList.remove('hidden');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Load and render the exact Plotly figure JSON generated by Python
async function renderDGCA1HeatmapFromJSON() {
    const el = document.getElementById('dgca1Heatmap');
    if (!el) return;
    try {
        const resp = await fetch('data/dg_ca1_contrib_heatmap.json', { cache: 'no-store' });
        if (!resp.ok) {
            el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">Heatmap JSON not found. Regenerate dashboard data.</div>';
            return;
        }
        const fig = await resp.json();

        // Decode any ndarray-like objects (dtype/bdata/shape) into nested arrays
        const decodeNdarray = (obj) => {
            if (!obj || Array.isArray(obj) || typeof obj !== 'object') return obj;
            if (!obj.dtype || !obj.bdata || !obj.shape) return obj;
            const b64 = obj.bdata;
            const binStr = atob(b64);
            const len = binStr.length;
            const buf = new ArrayBuffer(len);
            const bytes = new Uint8Array(buf);
            for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);

            let arr;
            if (obj.dtype === 'f8') {
                arr = new Float64Array(buf);
            } else if (obj.dtype === 'f4') {
                arr = new Float32Array(buf);
            } else if (obj.dtype === 'i4') {
                arr = new Int32Array(buf);
            } else if (obj.dtype === 'u4') {
                arr = new Uint32Array(buf);
            } else if (obj.dtype === 'i2') {
                arr = new Int16Array(buf);
            } else if (obj.dtype === 'u2') {
                arr = new Uint16Array(buf);
            } else if (obj.dtype === 'i1') {
                arr = new Int8Array(buf);
            } else if (obj.dtype === 'u1') {
                arr = new Uint8Array(buf);
            } else {
                // Unknown dtype; fallback to byte array
                arr = new Uint8Array(buf);
            }

            const shape = String(obj.shape).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (shape.length === 2) {
                const [rows, cols] = shape;
                const out = new Array(rows);
                for (let r = 0; r < rows; r++) {
                    const start = r * cols;
                    const end = start + cols;
                    out[r] = Array.from(arr.slice(start, end));
                }
                return out;
            }
            // 1D fallback
            return Array.from(arr);
        };

        if (Array.isArray(fig.data)) {
            fig.data.forEach(t => {
                if (t && t.z && !Array.isArray(t.z)) {
                    t.z = decodeNdarray(t.z);
                }
            });
        }
        // Render with the exact data/layout from Python
        await Plotly.newPlot('dgca1Heatmap', fig.data || [], fig.layout || {}, { responsive: true });
        if (Plotly && Plotly.Plots && Plotly.Plots.resize) {
            setTimeout(() => Plotly.Plots.resize(el), 0);
        }
    } catch (e) {
        console.error('Failed to render DG-CA1 heatmap:', e);
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#ef4444">Failed to render heatmap.</div>';
    }
}

// Render from payload for selected region/predicted class/desired class
function renderDGCA1HeatmapFromPayload() {
    const el = document.getElementById('dgca1Heatmap');
    if (!el) return;

    // Get payload for current region from cache
    const payload = state.heatmapPayloadCache[state.heatmapRegion];
    if (!payload) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">Heatmap data not loaded.</div>';
        return;
    }

    // Ensure we have both predicted and desired class selected
    if (!state.heatmapPredictedClasses || state.heatmapPredictedClasses.length === 0 || !state.heatmapDesiredClass) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">Please select at least one predicted class and a desired class.</div>';
        return;
    }

    // Build key using desired_class|top_n (no region prefix since each file is region-specific)
    const key = `${state.heatmapDesiredClass}|${state.heatmapTopN}`;
    const sel = (payload.selections || {})[key];
    const genes = payload.genes || [];

    if (!sel || !sel.rows) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">No data for this selection.</div>';
        return;
    }

    // Filter rows to only include cells matching ANY of the selected predicted classes
    const filteredRows = sel.rows.filter(r => state.heatmapPredictedClasses.includes(r.predicted_class));

    // Update dynamic title and subtitle
    const selectedClasses = Array.from(document.getElementById('heatmapPredictedClassSelect').selectedOptions).map(opt => opt.text);
    const predictedClassLabel = selectedClasses.length === 1 ? selectedClasses[0] :
                                selectedClasses.length <= 3 ? selectedClasses.join(', ') :
                                `${selectedClasses.length} classes`;
    const desiredClassLabel = document.getElementById('heatmapDesiredClassSelect')?.selectedOptions[0]?.text || state.heatmapDesiredClass;
    const regionLabel = REGION_NAMES[state.heatmapRegion] || state.heatmapRegion.toUpperCase();
    const topN = state.heatmapTopN;

    const titleEl = document.getElementById('heatmapTitle');
    const subtitleEl = document.getElementById('heatmapSubtitle');
    if (titleEl) {
        titleEl.textContent = `${predictedClassLabel} Cells in ${regionLabel}: Gene Contributions`;
    }
    if (subtitleEl) {
        const geneText = topN === 1 ? 'gene' : `${topN} genes`;
        subtitleEl.textContent = `For each cell, showing the top ${geneText} with highest contribution difference (predicted class − ${desiredClassLabel})`;
    }

    if (!genes.length || !filteredRows.length) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">No cells matching this selection (N=0).</div>';
        return;
    }

    // Build heatmap data from filtered rows
    const z = new Array(filteredRows.length);
    const yLabels = new Array(filteredRows.length);
    const classNames = new Array(filteredRows.length);
    for (let i = 0; i < filteredRows.length; i++) {
        const r = filteredRows[i];
        const arr = new Array(genes.length).fill(0);
        (r.tops || []).forEach(([idx, val]) => { if (idx >= 0 && idx < arr.length) arr[idx] = val; });
        z[i] = arr;
        yLabels[i] = `${r.cell_num} (${r.predicted_class || ''})`;
        classNames[i] = r.predicted_class || '';
    }

    // Build customdata: [class, cell_label]
    const nRows = z.length, nCols = genes.length;
    const customdata = new Array(nRows);
    for (let i = 0; i < nRows; i++) {
        const row = new Array(nCols);
        for (let j = 0; j < nCols; j++) row[j] = [classNames[i], yLabels[i]];
        customdata[i] = row;
    }

    // Rotate ticks and thin labels (~60 labels max)
    const maxLabels = 60;
    const step = Math.max(1, Math.ceil(genes.length / maxLabels));
    const tickvals = genes.filter((_, idx) => idx % step === 0);

    const trace = {
        type: 'heatmap', z, x: genes, y: yLabels, customdata,
        hoverongaps: false,
        hovertemplate: 'Cell: %{customdata[1]}<br>' +
                       'Predicted class: %{customdata[0]}<br>' +
                       'Gene: %{x}<br>' +
                       'Value: %{z:.3f}<extra></extra>'
    };
    const layout = {
        xaxis: { tickangle: -45, automargin: true, tickfont: { size: 12 }, tickmode: 'array', tickvals },
        yaxis: { automargin: true, tickfont: { size: 11 } },
        autosize: true, height: 700,
        margin: { l: 140, r: 20, t: 30, b: 120 }, font: { size: 12 }
    };

    Plotly.newPlot('dgca1Heatmap', [trace], layout, { responsive: true }).then(() => {
        if (Plotly && Plotly.Plots && Plotly.Plots.resize) setTimeout(() => Plotly.Plots.resize(el), 0);
    }).catch(e => console.error('Failed to render heatmap from payload:', e));
}

// Render from open data payload (genes + rows)
async function renderDGCA1HeatmapFromData() {
    const el = document.getElementById('dgca1Heatmap');
    if (!el) return false;
    try {
        const resp = await fetch('data/dg_ca1_heatmap_data.json', { cache: 'no-store' });
        if (!resp.ok) return false;
        const payload = await resp.json();
        const genes = payload.genes || [];
        const rows = payload.rows || [];
        if (!genes.length || !rows.length) return false;

        // Build z matrix and labels
        const z = [];
        const yLabels = [];
        const classNames = [];
        rows.forEach(r => {
            z.push(r.values || new Array(genes.length).fill(0));
            yLabels.push(`${r.cell_num} (${r.predicted_class || ''})`);
            classNames.push(r.predicted_class || '');
        });

        // Build customdata: [class, cell_label]
        const nRows = z.length;
        const nCols = genes.length;
        const customdata = new Array(nRows);
        for (let i = 0; i < nRows; i++) {
            const row = new Array(nCols);
            for (let j = 0; j < nCols; j++) row[j] = [classNames[i], yLabels[i]];
            customdata[i] = row;
        }

        // Trace with identical hovertemplate
        const trace = {
            type: 'heatmap',
            z,
            x: genes,
            y: yLabels,
            customdata,
            hoverongaps: false,
            hovertemplate: 'Cell: %{customdata[1]}<br>' +
                           'Predicted class: %{customdata[0]}<br>' +
                           'Gene: %{x}<br>' +
                           'Value: %{z:.3f}<extra></extra>'
        };

        // Aesthetics matching Python builder
        // Rotate ticks and thin labels (~60 labels max)
        const maxLabels = 60;
        const step = Math.max(1, Math.ceil(genes.length / maxLabels));
        const tickvals = genes.filter((_, idx) => idx % step === 0);

        const layout = {
            title: {
                text: 'DG-in-CA1: Top-N Gene Contribution Differences\n(predicted class − CA1 family)',
                font: { size: 16 }
            },
            xaxis: { tickangle: -45, automargin: true, tickfont: { size: 12 }, tickmode: 'array', tickvals },
            yaxis: { automargin: true, tickfont: { size: 11 } },
            autosize: true,
            height: 700,
            margin: { l: 140, r: 20, t: 50, b: 120 },
            font: { size: 12 }
        };

        await Plotly.newPlot('dgca1Heatmap', [trace], layout, { responsive: true });
        if (Plotly && Plotly.Plots && Plotly.Plots.resize) setTimeout(() => Plotly.Plots.resize(el), 0);
        return true;
    } catch (e) {
        console.error('Failed to render heatmap from data payload:', e);
        return false;
    }
}

// Load gene scatter data
async function loadGeneScatterData() {
    try {
        const resp = await fetch('data/gene_scatter_data.json', { cache: 'no-store' });
        if (!resp.ok) {
            console.error('Failed to load gene scatter data');
            return;
        }
        state.geneScatterData = await resp.json();
        console.log('Loaded gene scatter data:', state.geneScatterData);
    } catch (e) {
        console.error('Failed to load gene scatter data:', e);
        state.geneScatterData = null;
    }
}

// Populate cell dropdown for selected group (gene scatter)
function populateGeneScatterCellDropdown() {
    const cellSelect = document.getElementById('geneScatterCellSelect');
    if (!cellSelect || !state.geneScatterData) return;

    const group = state.geneScatterData.groups[state.geneScatterGroup];
    if (!group || !group.cells || group.cells.length === 0) {
        cellSelect.innerHTML = '<option value="">No cells available</option>';
        state.geneScatterCell = null;
        return;
    }

    // Build options
    const options = group.cells.map((cell, idx) => {
        const label = `Cell ${cell.cell_num} (${cell.primary_class})`;
        return `<option value="${idx}">${label}</option>`;
    });

    cellSelect.innerHTML = options.join('');

    // Select first cell by default
    if (state.geneScatterCell === null || state.geneScatterCell >= group.cells.length) {
        state.geneScatterCell = 0;
    }
    cellSelect.value = state.geneScatterCell;
}

// Render gene scatter plot (expression vs counts)
function renderGeneScatterPlot() {
    const el = document.getElementById('geneScatterChart');
    if (!el) return;

    if (!state.geneScatterData) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">Loading...</div>';
        return;
    }

    // Ensure state.geneScatterGroup matches the dropdown
    const groupSelect = document.getElementById('geneScatterGroupSelect');
    if (groupSelect && groupSelect.value !== state.geneScatterGroup) {
        state.geneScatterGroup = groupSelect.value;
    }

    console.log('Rendering gene scatter for group:', state.geneScatterGroup);
    console.log('Available groups:', Object.keys(state.geneScatterData.groups));

    const group = state.geneScatterData.groups[state.geneScatterGroup];
    if (!group || !group.cells || group.cells.length === 0) {
        console.error('No group data found for:', state.geneScatterGroup);
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">No cells in this group</div>';
        return;
    }

    console.log(`Group ${state.geneScatterGroup} has ${group.cells.length} cells`);

    const genes = state.geneScatterData.genes;

    // Check if a cell is selected
    if (state.geneScatterCell === null || state.geneScatterCell >= group.cells.length) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">Please select a cell</div>';
        return;
    }

    const cell = group.cells[state.geneScatterCell];

    if (!cell.exp_with_theta || !cell.exp_without_theta || !cell.counts ||
        cell.exp_with_theta.length !== genes.length ||
        cell.exp_without_theta.length !== genes.length ||
        cell.counts.length !== genes.length) {
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:400px;color:#9ca3af">Invalid cell data</div>';
        return;
    }

    const traces = [];
    let maxX = 0;
    let maxY = 0;

    // Blue trace: with theta (exp_with_theta vs counts)
    const withThetaTrace = {
        x: cell.exp_with_theta,
        y: cell.counts,
        type: 'scatter',
        mode: 'markers',
        marker: { size: 6, color: '#1f77b4', opacity: 0.6 },
        customdata: genes,
        hovertemplate: 'Gene: %{customdata}<br>' +
                       'Scaled Exp (with theta): %{x:.4f}<br>' +
                       'Counts: %{y}<extra></extra>',
        name: 'With theta',
        showlegend: true
    };
    traces.push(withThetaTrace);

    // Orange trace: without theta (exp_without_theta vs counts)
    const withoutThetaTrace = {
        x: cell.exp_without_theta,
        y: cell.counts,
        type: 'scatter',
        mode: 'markers',
        marker: { size: 6, color: '#ff7f0e', opacity: 0.6 },
        customdata: genes,
        hovertemplate: 'Gene: %{customdata}<br>' +
                       'Scaled Exp (without theta): %{x:.4f}<br>' +
                       'Counts: %{y}<extra></extra>',
        name: 'Without theta',
        showlegend: true
    };
    traces.push(withoutThetaTrace);

    // Calculate max values for axes
    maxX = Math.max(
        Math.max(...cell.exp_with_theta.filter(v => isFinite(v))),
        Math.max(...cell.exp_without_theta.filter(v => isFinite(v)))
    );
    maxY = Math.max(...cell.counts.filter(v => isFinite(v)));

    const padX = maxX * 0.05;
    const padY = maxY * 0.05;

    // Add diagonal line (y=x)
    const maxVal = Math.max(maxX, maxY);
    const diagonalTrace = {
        x: [0, maxVal + Math.max(padX, padY)],
        y: [0, maxVal + Math.max(padX, padY)],
        type: 'scatter',
        mode: 'lines',
        line: { color: '#e74c3c', width: 2, dash: 'dash' },
        name: 'y=x',
        hoverinfo: 'skip',
        showlegend: true
    };
    traces.push(diagonalTrace);

    const layout = {
        title: {
            text: `Cell ${cell.cell_num}: ${cell.primary_class}`,
            font: { size: 14 }
        },
        xaxis: {
            title: 'Scaled Expression',
            range: [0, maxVal + Math.max(padX, padY)],
            autorange: false
        },
        yaxis: {
            title: 'Gene Counts',
            range: [0, maxVal + Math.max(padX, padY)],
            autorange: false
        },
        height: 600,
        margin: { l: 80, r: 20, t: 80, b: 60 },
        showlegend: true,
        legend: { x: 1.02, y: 1, xanchor: 'left' }
    };

    Plotly.newPlot('geneScatterChart', traces, layout, { responsive: true });
}
