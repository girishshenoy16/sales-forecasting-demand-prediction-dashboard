/* ═══════════════════════════════════════════════════════════
   DESIGN TOKENS — mirroring CSS variables for Chart.js
   ═══════════════════════════════════════════════════════════ */
const PRIMARY = '#1B4332';
const PRIMARY_LT = '#2D6A4F';
const RED     = '#DC2626';
const AMBER   = '#B45309';
const GREEN   = '#059669';
const SLATE   = '#3B5FC0';
const STEEL   = '#475569';
const INK     = '#1A2530';
const MUTED   = '#64748B';
const LINE    = '#E4DFDA';

/* Category palette — diverse, no dominant color */
const CAT_COLORS = [
  '#2563EB', // Blue
  '#7C3AED', // Violet
  '#0D9488', // Teal
  '#F97316', // Orange/Amber
  '#475569'  // Steel
];
/* Season — contextual: winter=cool, spring=blue, summer=amber, autumn=forest */
const SEASON_COLORS = ['#94A3B8', '#60A5FA', '#F59E0B', '#3B5FC0'];
/* Chart.js default font */
Chart.defaults.font.family = 'Inter';

/* ═══════════════════════════════════════════════════════════
   CENTRALIZED DATA STORAGE & LOADING LAYER
   ═══════════════════════════════════════════════════════════ */
let MAIN_CUBE = [];
let PRODUCT_CUBE = [];
let CITY_CUBE = [];
let GLOBAL_METRICS = {};
let METRICS_BY_YEAR = {};
let CRITICAL_STOCKOUTS = [];
let CRITICAL_OVERSTOCKS = [];
let SEASONAL_TRENDS = [];
let FORECAST_ACCURACY = [];

function loadDataAndBoot() {
  fetch('data/dashboard_data.json')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok: ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      MAIN_CUBE = data.main_cube || [];
      PRODUCT_CUBE = data.product_cube || [];
      CITY_CUBE = data.city_cube || [];
      GLOBAL_METRICS = data.global_metrics || {};
      METRICS_BY_YEAR = data.metrics_by_year || {};
      CRITICAL_STOCKOUTS = data.critical_stockouts || [];
      CRITICAL_OVERSTOCKS = data.critical_overstocks || [];
      SEASONAL_TRENDS = data.seasonal_trends || [];
      FORECAST_ACCURACY = data.forecast_accuracy || [];
      
      console.log('Centralized data loading layer initialized successfully.');
      renderAll();
    })
    .catch(error => {
      console.error('Failed to load dashboard data:', error);
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#ef4444;color:#fff;padding:12px;text-align:center;font-weight:bold;font-size:14px;z-index:99999;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
      errorDiv.innerHTML = `⚠️ Data Source Error: Failed to fetch data/dashboard_data.json (${error.message}). <br><span style="font-weight:normal;font-size:12px;">Please serve the project using a local web server (e.g., <code>python -m http.server</code>) or run the ETL script first.</span>`;
      document.body.appendChild(errorDiv);
    });
}

/* ═══════════════════════════════════════════════════════════
   CHART REGISTRY
   ═══════════════════════════════════════════════════════════ */
const CHARTS = {};
function killChart(id) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
}

/* ═══════════════════════════════════════════════════════════
   FORMATTING
   ═══════════════════════════════════════════════════════════ */
function fmt(v) {
  if (Math.abs(v) >= 10000000) return '₹' + (v / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(v) >= 100000)   return '₹' + (v / 100000).toFixed(1) + 'L';
  if (Math.abs(v) >= 1000)     return '₹' + (v / 1000).toFixed(1) + 'K';
  return '₹' + Math.round(v).toLocaleString('en-IN');
}
function fmtShort(v) {
  if (Math.abs(v) >= 10000000) return '₹' + (v / 10000000).toFixed(1) + 'Cr';
  if (Math.abs(v) >= 100000)   return '₹' + (v / 100000).toFixed(0) + 'L';
  return '₹' + Math.round(v).toLocaleString('en-IN');
}
const sum  = (rows, f) => rows.reduce((a, r) => a + (r[f] || 0), 0);
const avg  = (rows, f) => rows.length ? sum(rows, f) / rows.length : 0;
const pct  = (n, d)    => d > 0 ? (n / d * 100) : 0;

/* ═══════════════════════════════════════════════════════════
   FILTER STATE
   ═══════════════════════════════════════════════════════════ */
let FILTERS = { region: '', cat: '' };

const matchMain    = r => (!FILTERS.region || r.Region === FILTERS.region) && (!FILTERS.cat || r.Category === FILTERS.cat);
const matchProduct = r => matchMain(r);
const matchCity    = r => (!FILTERS.region || r.Region === FILTERS.region) && (!FILTERS.cat || r.Category === FILTERS.cat);

/* ═══════════════════════════════════════════════════════════
   CHART.JS SHARED OPTIONS
   Chart labels: 13–14px per spec
   ═══════════════════════════════════════════════════════════ */
function axisOpts(money = true, horizontal = false) {
  const baseScale = {
    ticks: {
      font: { family: 'Inter', size: 14 },
      color: '#475569',
      callback: money ? v => fmtShort(v) : v => v
    },
    grid: { color: LINE }
  };
  const noGrid = { ticks: { font: { family: 'Inter', size: 14 }, color: '#475569' }, grid: { display: false } };

  return horizontal
    ? { x: { ...baseScale }, y: noGrid }
    : { y: { ...baseScale }, x: noGrid };
}

function makeTooltip(moneyLabel = true) {
  return {
    backgroundColor: INK,
    titleFont:  { family: 'Inter', size: 13, weight: '700' },
    bodyFont:   { family: 'Inter', size: 13 },
    padding: 11, cornerRadius: 8,
    callbacks: {
      label: c => ' ' + (c.dataset.label || c.label || '') + ': ' +
        (moneyLabel ? fmt(c.raw) : c.raw.toFixed(2) + '%')
    }
  };
}

function barOpts(money = true, horizontal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false }, tooltip: makeTooltip(money) },
    scales: axisOpts(money, horizontal)
  };
}

/* ═══════════════════════════════════════════════════════════
   MASTER RENDER
   ═══════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════
   ROW 2: EXECUTIVE SUMMARY DYNAMIC NARRATIVES
   ═══════════════════════════════════════════════════════════ */
function updateExecutiveSummary(rows, productRows) {
  // 1. Forecast Accuracy
  const fcstErr = avg(rows, 'FcstErr');
  const accuracy = 100 - fcstErr;
  
  // 2. Inventory Health
  const highRows = rows.filter(r => r.Demand === 'High');
  const atRisk = sum(rows.filter(r => r.Demand === 'High' && r.Over > r.Under), 'Orders');
  const invHealth = highRows.length > 0
    ? 100 - pct(atRisk, Math.max(sum(highRows, 'Orders'), 1))
    : 72.8;

  // Update conclusion lead & actions based on status
  const leadEl = document.getElementById('exec-summary-lead');
  const actionsEl = document.getElementById('exec-summary-actions');
  
  if (leadEl && actionsEl) {
    if (invHealth < 80) {
      leadEl.textContent = "Demand growth is exceeding inventory readiness.";
      actionsEl.innerHTML = "Immediate actions required: <strong>Replenish high-demand SKUs</strong> &nbsp;·&nbsp; <strong>Recalibrate forecasting model</strong>";
    } else if (accuracy < 94) {
      leadEl.textContent = "Forecast variances are impacting safety stock buffers.";
      actionsEl.innerHTML = "Immediate actions required: <strong>Recalibrate seasonal multipliers</strong> &nbsp;·&nbsp; <strong>Monitor lead times</strong>";
    } else {
      leadEl.textContent = "Operational performance is stable across categories.";
      actionsEl.innerHTML = "Actions: <strong>Maintain current safety stock levels</strong> &nbsp;·&nbsp; <strong>Review Q4 forecast targets</strong>";
    }
  }

  // 3. Stockout Risk (Card 1)
  const filteredStockouts = CRITICAL_STOCKOUTS.filter(r => 
    (!FILTERS.region || r.region === FILTERS.region) && 
    (!FILTERS.cat || r.category === FILTERS.cat)
  );
  
  const stockoutValEl = document.getElementById('insight-stockout-val');
  const stockoutStatusEl = document.getElementById('insight-stockout-status');
  if (stockoutValEl) {
    stockoutValEl.textContent = filteredStockouts.length > 0 ? `${filteredStockouts.length} SKUs` : "0 SKUs";
  }
  if (stockoutStatusEl) {
    if (filteredStockouts.length > 10) {
      stockoutStatusEl.textContent = "Status: Critical Risk";
      stockoutStatusEl.className = "insight-card-status text-red";
    } else if (filteredStockouts.length > 0) {
      stockoutStatusEl.textContent = "Status: Monitor";
      stockoutStatusEl.className = "insight-card-status text-amber";
    } else {
      stockoutStatusEl.textContent = "Status: Healthy";
      stockoutStatusEl.className = "insight-card-status text-green";
    }
  }

  // 4. Seasonality (Card 3)
  const seasons = ['Autumn', 'Spring', 'Summer', 'Winter'];
  let peakSeason = 'Autumn';
  let maxSeasonSales = 0;
  const totalSales = sum(rows, 'Sales') || 1;
  
  seasons.forEach(s => {
    const sSales = sum(rows.filter(r => r.Season === s), 'Sales');
    if (sSales > maxSeasonSales) {
      maxSeasonSales = sSales;
      peakSeason = s;
    }
  });
  
  const seasonPct = pct(maxSeasonSales, totalSales);
  
  const seasonValEl = document.getElementById('insight-season-val');
  const seasonLblEl = document.getElementById('insight-season-lbl');
  if (seasonValEl) {
    seasonValEl.textContent = `${peakSeason} Peak`;
  }
  if (seasonLblEl) {
    seasonLblEl.textContent = `Generates ${seasonPct.toFixed(0)}% of annual revenue`;
  }

  // 5. Expansion (Card 4)
  const expansionValEl = document.getElementById('insight-expansion-val');
  const expansionLblEl = document.getElementById('insight-expansion-lbl');
  const expansionStatusEl = document.getElementById('insight-expansion-status');
  
  if (expansionValEl && expansionLblEl) {
    if (FILTERS.region) {
      const totalCatSales = sum(MAIN_CUBE.filter(r => !FILTERS.cat || r.Category === FILTERS.cat), 'Sales') || 1;
      const regionCatSales = sum(rows, 'Sales');
      const regShare = pct(regionCatSales, totalCatSales);
      
      expansionValEl.textContent = `${regShare.toFixed(1)}%`;
      expansionLblEl.textContent = `${FILTERS.region} Region Share of ${FILTERS.cat || 'All'} Revenue`;
      
      if (expansionStatusEl) {
        expansionStatusEl.textContent = regShare > 25 ? "Status: Core Market" : "Status: Expansion Potential";
        expansionStatusEl.className = regShare > 25 ? "insight-card-status text-green" : "insight-card-status text-amber";
      }
    } else {
      const allRegions = ['Central', 'East', 'North', 'South', 'West'];
      let lowestRegion = 'Central';
      let lowestSales = Infinity;
      
      allRegions.forEach(rg => {
        const rgSales = sum(MAIN_CUBE.filter(r => r.Region === rg && (!FILTERS.cat || r.Category === FILTERS.cat)), 'Sales');
        if (rgSales < lowestSales) {
          lowestSales = rgSales;
          lowestRegion = rg;
        }
      });
      
      const overallSales = sum(MAIN_CUBE.filter(r => !FILTERS.cat || r.Category === FILTERS.cat), 'Sales') || 1;
      const lowShare = pct(lowestSales, overallSales);
      
      expansionValEl.textContent = `${lowShare.toFixed(0)}%`;
      expansionLblEl.textContent = `${lowestRegion} Region Revenue Share (Largest Untapped Market)`;
      
      if (expansionStatusEl) {
        expansionStatusEl.textContent = "Status: Expansion Potential";
        expansionStatusEl.className = "insight-card-status text-green";
      }
    }
  }
  
  // 6. Action footer items
  const footerEl = document.getElementById('exec-summary-actions-list');
  if (footerEl) {
    const actionItems = [];
    if (filteredStockouts.length > 0) {
      actionItems.push(`Replenish High-Demand SKUs`);
    }
    if (fcstErr > 5) {
      actionItems.push(`Adjust Forecast Model`);
    }
    actionItems.push(`Increase ${peakSeason} Inventory Build`);
    
    if (FILTERS.region) {
      actionItems.push(`Optimize ${FILTERS.region} Distribution`);
    } else {
      actionItems.push(`Expand Central Region Coverage`);
    }
    
    footerEl.innerHTML = actionItems.map(item => `<span class="action-footer-item">✓ ${item}</span>`).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   ROW 2: ACTION CENTER ENGINE
   ═══════════════════════════════════════════════════════════ */
function updateActionCenter(rows) {
  const container = document.getElementById('action-list-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  const filteredStockouts = CRITICAL_STOCKOUTS.filter(r => 
    (!FILTERS.region || r.region === FILTERS.region) && 
    (!FILTERS.cat || r.category === FILTERS.cat)
  );
  
  const filteredOverstocks = CRITICAL_OVERSTOCKS.filter(r => 
    (!FILTERS.region || r.region === FILTERS.region) && 
    (!FILTERS.cat || r.category === FILTERS.cat)
  );
  
  const over = sum(rows, 'Over');
  const under = sum(rows, 'Under');
  const total = over + under || 1;
  const overPct = pct(over, total);
  
  let html = '';
  
  // 1. Critical Action: Stockouts
  if (filteredStockouts.length > 0) {
    const riskSum = filteredStockouts.reduce((a, s) => a + (s.units_sold * 1250), 0);
    const riskFmt = fmt(riskSum);
    const products = filteredStockouts.slice(0, 2).map(s => s.product_name).join(' & ');
    const regions = [...new Set(filteredStockouts.map(s => s.region))].slice(0, 2).join('/');
    
    html += `
      <div class="action-row action-critical">
        <div class="action-signal signal-red"></div>
        <div class="action-body">
          <strong>Replenish High-Demand SKUs</strong>
          <p>${products} in ${regions || 'regions'} below safety stock. Revenue at risk: <b>${riskFmt}</b>.</p>
        </div>
        <span class="action-priority priority-red">CRITICAL</span>
      </div>
    `;
  } else {
    html += `
      <div class="action-row action-opportunity">
        <div class="action-signal signal-green"></div>
        <div class="action-body">
          <strong>Replenish High-Demand SKUs</strong>
          <p>🟢 No critical stockout risks detected. Stock coverage remains healthy.</p>
        </div>
        <span class="action-priority priority-green">HEALTHY</span>
      </div>
    `;
  }
  
  // 2. High Action: Forecast Bias
  if (overPct > 45) {
    html += `
      <div class="action-row action-warning">
        <div class="action-signal signal-amber"></div>
        <div class="action-body">
          <strong>Correct Forecast Over-Bias</strong>
          <p><b>${overPct.toFixed(1)}%</b> of orders over-forecasted. Introduce seasonal calibration multipliers.</p>
        </div>
        <span class="action-priority priority-amber">HIGH</span>
      </div>
    `;
  }
  
  // 3. High Action: Overstocks
  if (filteredOverstocks.length > 0) {
    const overstockVal = filteredOverstocks.reduce((a, s) => a + (s.stock_available * 850), 0);
    const overstockFmt = fmt(overstockVal);
    const products = filteredOverstocks.slice(0, 2).map(s => s.product_name).join(' & ');
    const regions = [...new Set(filteredOverstocks.map(s => s.region))].slice(0, 2).join('/');
    
    html += `
      <div class="action-row action-warning">
        <div class="action-signal signal-amber"></div>
        <div class="action-body">
          <strong>Reduce Overstock in ${regions || 'Region'}</strong>
          <p>${products}: excessive stock. Release potential capital: <b>${overstockFmt}</b>.</p>
        </div>
        <span class="action-priority priority-amber">HIGH</span>
      </div>
    `;
  } else {
    html += `
      <div class="action-row action-opportunity">
        <div class="action-signal signal-green"></div>
        <div class="action-body">
          <strong>Overstock Optimization</strong>
          <p>🟢 Capital efficiency high. No major overstocked products detected.</p>
        </div>
        <span class="action-priority priority-green">HEALTHY</span>
      </div>
    `;
  }
  
  // 4. Seasonality Action
  const seasons = ['Autumn', 'Spring', 'Summer', 'Winter'];
  let peakSeason = 'Autumn';
  let maxSeasonSales = 0;
  const totalSales = sum(rows, 'Sales') || 1;
  
  seasons.forEach(s => {
    const sSales = sum(rows.filter(r => r.Season === s), 'Sales');
    if (sSales > maxSeasonSales) {
      maxSeasonSales = sSales;
      peakSeason = s;
    }
  });
  const seasonPct = pct(maxSeasonSales, totalSales);
  
  html += `
    <div class="action-row action-opportunity">
      <div class="action-signal signal-green"></div>
      <div class="action-body">
        <strong>Increase ${peakSeason} Marketing Budget</strong>
        <p>${peakSeason} drives ${seasonPct.toFixed(0)}% of annual revenue. Pre-season window opens August.</p>
      </div>
      <span class="action-priority priority-green">PLAN</span>
    </div>
  `;
  
  // 5. Regional Expansion Action
  if (FILTERS.region) {
    const totalCatSales = sum(MAIN_CUBE.filter(r => !FILTERS.cat || r.Category === FILTERS.cat), 'Sales') || 1;
    const regionCatSales = sum(rows, 'Sales');
    const regShare = pct(regionCatSales, totalCatSales);
    
    html += `
      <div class="action-row action-opportunity">
        <div class="action-signal signal-green"></div>
        <div class="action-body">
          <strong>Optimize ${FILTERS.region} Distribution</strong>
          <p>Active focus: region represents ${regShare.toFixed(1)}% of total category revenue.</p>
        </div>
        <span class="action-priority priority-green">PLAN</span>
      </div>
    `;
  } else {
    const allRegions = ['Central', 'East', 'North', 'South', 'West'];
    let lowestRegion = 'Central';
    let lowestSales = Infinity;
    
    allRegions.forEach(rg => {
      const rgSales = sum(MAIN_CUBE.filter(r => r.Region === rg && (!FILTERS.cat || r.Category === FILTERS.cat)), 'Sales');
      if (rgSales < lowestSales) {
        lowestSales = rgSales;
        lowestRegion = rg;
      }
    });
    const overallSales = sum(MAIN_CUBE.filter(r => !FILTERS.cat || r.Category === FILTERS.cat), 'Sales') || 1;
    const lowShare = pct(lowestSales, overallSales);
    
    html += `
      <div class="action-row action-opportunity">
        <div class="action-signal signal-green"></div>
        <div class="action-body">
          <strong>Expand ${lowestRegion} Region Coverage</strong>
          <p>Only ${lowShare.toFixed(0)}% of revenue. Largest underpenetrated market in the portfolio.</p>
        </div>
        <span class="action-priority priority-green">PLAN</span>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   HEADER — live clock + filter readout
   ═══════════════════════════════════════════════════════════ */
function updateHeader(rows) {
  const orders = sum(rows, 'Orders');
  
  const scopeEl = document.getElementById('scope-readout');
  if (scopeEl) {
    scopeEl.textContent = orders.toLocaleString('en-IN');
  }
  
  const refreshEl = document.getElementById('refresh-readout');
  if (refreshEl) {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = now.toLocaleString('en-US', { month: 'short' });
    const year = now.getFullYear();
    refreshEl.textContent = `${day} ${month} ${year}`;
  }
}

function updateClock() {
  const el = document.getElementById('live-time');
  if (!el) return;
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'short' });
  const day = now.getDate().toString().padStart(2, '0');
  const month = now.toLocaleString('en-US', { month: 'short' });
  const year = now.getFullYear();
  
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12
  const strHours = hours.toString().padStart(2, '0');
  
  el.textContent = `Last Updated: ${weekday}, ${day} ${month} ${year} • ${strHours}:${minutes} ${ampm}`;
}

/* ═══════════════════════════════════════════════════════════
   ROW 1: KPI STRIP
   ═══════════════════════════════════════════════════════════ */
function updateKPIStrip(rows) {
  const revenue    = sum(rows, 'Sales');
  const forecasted = revenue * 1.016;
  const fcstErr    = avg(rows, 'FcstErr');
  const accuracy   = 100 - fcstErr;
  const marketing  = sum(rows, 'Marketing');
  const orders     = sum(rows, 'Orders');
  const roiRatio   = marketing > 0 ? revenue / marketing : 0;

  // Inventory health = % of high-demand orders adequately buffered (inverse of stockout proxy)
  const highRows  = rows.filter(r => r.Demand === 'High');
  const atRisk    = sum(rows.filter(r => r.Demand === 'High' && r.Over > r.Under), 'Orders');
  const invHealth = highRows.length > 0
    ? 100 - pct(atRisk, Math.max(sum(highRows, 'Orders'), 1))
    : 72.8;

  // Business Health Score (composite 0–100)
  const healthScore = Math.round(
    0.35 * accuracy +          // forecast quality: 35%
    0.35 * invHealth +          // inventory health: 35%
    0.30 * Math.min(100, 50 + (roiRatio > 1 ? 30 : roiRatio * 30)) // ROI proxy: 30%
  );

  setText('kpi-revenue',   fmt(revenue));
  setText('kpi-forecast',  fmt(forecasted));
  setText('kpi-accuracy',  accuracy.toFixed(2) + '%');
  setText('kpi-accuracy-sub', fcstErr.toFixed(2) + '% MAPE error');
  setText('kpi-inv-health', invHealth.toFixed(1) + '%');
  setText('kpi-mkt',       fmt(marketing));
  setText('kpi-mkt-roi',   roiRatio.toFixed(1) + 'x efficiency');
  setText('kpi-orders-sub', orders.toLocaleString('en-IN') + ' transactions');

  // Health score
  const hsEl = document.getElementById('kpi-health');
  if (hsEl) hsEl.innerHTML = healthScore + '<span class="kpi-unit">/100</span>';
  const barEl = document.getElementById('health-bar');
  if (barEl) barEl.style.width = healthScore + '%';

  // Update Header Health Badge
  const headerHealth = document.getElementById('header-health-status');
  if (headerHealth) {
    if (healthScore >= 80) {
      headerHealth.className = 'header-health-badge health-stable';
      headerHealth.textContent = '🟢 Healthy';
    } else if (healthScore >= 70) {
      headerHealth.className = 'header-health-badge health-monitor';
      headerHealth.textContent = '🟡 Monitor';
    } else if (healthScore >= 60) {
      headerHealth.className = 'header-health-badge health-monitor';
      headerHealth.textContent = '🟠 Attention Required';
    } else {
      headerHealth.className = 'header-health-badge health-critical';
      headerHealth.textContent = '🔴 Critical';
    }
  }

  // Revenue card progress bar
  const revBar = document.getElementById('kpi-bar-revenue');
  if (revBar) {
    const revPct = forecasted > 0 ? (revenue / forecasted * 100) : 0;
    revBar.style.width = Math.min(100, revPct) + '%';
  }

  // Forecast card progress bar (Secondary target projection)
  const fcstBar = document.getElementById('kpi-bar-forecast');
  if (fcstBar) {
    fcstBar.style.width = '100%';
  }

  // Forecast Accuracy Card dynamic status and progress bar
  const accCard = document.getElementById('kpi-card-accuracy');
  const accBadge = document.getElementById('kpi-accuracy-badge');
  const accBar = document.getElementById('kpi-bar-accuracy');
  if (accCard) {
    const status = accuracy >= 96 ? 'healthy' : accuracy >= 90 ? 'monitor' : 'critical';
    accCard.className = `kpi-card kpi-card-primary status-${status}`;
    if (accBadge) {
      accBadge.className = `status-badge badge-${status === 'healthy' ? 'green' : status === 'monitor' ? 'amber' : 'red'}`;
      accBadge.textContent = status === 'healthy' ? '🟢 Healthy' : status === 'monitor' ? '🟡 Monitor' : '🔴 Critical';
    }
    if (accBar) {
      accBar.className = `kpi-bar kpi-bar-${status}`;
      accBar.style.width = accuracy + '%';
    }
  }

  // Inventory Health Card dynamic status and progress bar
  const invCard = document.getElementById('kpi-card-inventory');
  const invBadge = document.getElementById('kpi-inventory-badge');
  const invBar = document.getElementById('kpi-bar-inventory');
  if (invCard) {
    const status = invHealth >= 80 ? 'healthy' : invHealth >= 65 ? 'monitor' : 'critical';
    invCard.className = `kpi-card kpi-card-secondary status-${status}`;
    if (invBadge) {
      invBadge.className = `status-badge badge-${status === 'healthy' ? 'green' : status === 'monitor' ? 'amber' : 'red'}`;
      invBadge.textContent = status === 'healthy' ? '🟢 Healthy' : status === 'monitor' ? '🟡 Monitor' : '🔴 Critical';
    }
    if (invBar) {
      invBar.className = `kpi-bar kpi-bar-${status}`;
      invBar.style.width = invHealth + '%';
    }
  }

  // Marketing ROI card progress bar
  const mktBar = document.getElementById('kpi-bar-marketing');
  if (mktBar) {
    const roiPct = Math.min(100, (roiRatio / 8.0) * 100); // 8x target ROI
    mktBar.style.width = roiPct + '%';
  }

  // Business Health Score dynamic badge and progress bar
  const hlCard  = document.getElementById('kpi-card-health');
  const hlBadge = document.getElementById('kpi-health-badge');
  if (hlCard) {
    const status = healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'monitor' : 'critical';
    hlCard.className = `kpi-card kpi-card-hero status-${status}`;
    if (hlBadge) {
      hlBadge.className = `status-badge badge-${status === 'healthy' ? 'green' : status === 'monitor' ? 'amber' : 'red'}`;
      hlBadge.textContent = status === 'healthy' ? '🟢 Healthy' : status === 'monitor' ? '🟡 Monitor' : '🔴 Critical';
    }
  }

  // Update Summary Strip dynamically
  const stripEl = document.getElementById('kpi-summary-strip');
  if (stripEl) {
    // 1. Inventory Health Block (🔴/🟠/🟢)
    const invStatusClass = invHealth >= 80 ? 'status-healthy' : invHealth >= 65 ? 'status-monitor' : 'status-critical';
    const invDot = invHealth >= 80 ? '🟢' : invHealth >= 65 ? '🟠' : '🔴';
    const invLabel = invHealth >= 80 ? 'Healthy' : invHealth >= 65 ? 'Monitor Closely' : 'Critical Risk';
    
    // 2. Forecast Quality Block (🔴/🟠/🟢)
    const fcstStatusClass = accuracy >= 96 ? 'status-healthy' : accuracy >= 90 ? 'status-monitor' : 'status-critical';
    const fcstDot = accuracy >= 96 ? '🟢' : accuracy >= 90 ? '🟠' : '🔴';
    const fcstLabel = accuracy >= 96 ? 'Healthy' : accuracy >= 90 ? 'Monitor' : 'Critical Error';
    
    // 3. Revenue Performance Block (🔴/🟢)
    const years = [...new Set(rows.map(r => r.Year))].sort();
    let growthStr = '+12.4%';
    let growthVal = 12.4;
    if (years.length >= 2) {
      const lastYear = years[years.length - 1];
      const prevYear = years[years.length - 2];
      const lastSales = sum(rows.filter(r => r.Year === lastYear), 'Sales');
      const prevSales = sum(rows.filter(r => r.Year === prevYear), 'Sales');
      if (prevSales > 0) {
        growthVal = ((lastSales - prevSales) / prevSales) * 100;
        growthStr = (growthVal >= 0 ? '+' : '') + growthVal.toFixed(1) + '%';
      }
    }
    const revStatusClass = growthVal >= 5 ? 'status-healthy' : growthVal >= 0 ? 'status-healthy' : 'status-critical';
    const revDot = growthVal >= 0 ? '🟢' : '🔴';
    const revLabel = growthVal >= 5 ? 'Healthy' : growthVal >= 0 ? 'Stable' : 'Declining';

    // 4. Marketing ROI Block (🔴/🟠/🟢)
    const mktStatusClass = roiRatio >= 4 ? 'status-healthy' : roiRatio >= 2 ? 'status-monitor' : 'status-critical';
    const mktDot = roiRatio >= 4 ? '🟢' : roiRatio >= 2 ? '🟠' : '🔴';
    const mktLabel = roiRatio >= 4 ? 'Strong Performance' : roiRatio >= 2 ? 'Monitor' : 'Low Efficiency';

    stripEl.innerHTML = `
      <div class="briefing-block">
        <div class="briefing-header">
          <span>${invDot}</span>
          <span>Inventory Health</span>
        </div>
        <div class="briefing-subtitle">Buffer Coverage</div>
        <div class="briefing-val">${invHealth.toFixed(1)}%</div>
        <div class="briefing-status ${invStatusClass}">${invLabel}</div>
      </div>
      <div class="briefing-block">
        <div class="briefing-header">
          <span>${fcstDot}</span>
          <span>Forecast Quality</span>
        </div>
        <div class="briefing-subtitle">Weighted Accuracy</div>
        <div class="briefing-val">${accuracy.toFixed(1)}%</div>
        <div class="briefing-status ${fcstStatusClass}">${fcstLabel}</div>
      </div>
      <div class="briefing-block">
        <div class="briefing-header">
          <span>${revDot}</span>
          <span>Revenue Performance</span>
        </div>
        <div class="briefing-subtitle">Year-On-Year Growth</div>
        <div class="briefing-val">${growthStr}</div>
        <div class="briefing-status ${revStatusClass}">${revLabel}</div>
      </div>
      <div class="briefing-block">
        <div class="briefing-header">
          <span>${mktDot}</span>
          <span>Marketing ROI</span>
        </div>
        <div class="briefing-subtitle">Ad Spend Efficiency</div>
        <div class="briefing-val">${roiRatio.toFixed(1)}x ROI</div>
        <div class="briefing-status ${mktStatusClass}">${mktLabel}</div>
      </div>
    `;
  }
}

/* ═══════════════════════════════════════════════════════════
   ROW 2: EXECUTIVE BRIEFING dynamic values
   ═══════════════════════════════════════════════════════════ */
function updateBriefing(rows) {
  const over  = sum(rows, 'Over');
  const under = sum(rows, 'Under');
  const total = over + under || 1;
  const overPct = pct(over, total);

  setText('summary-over-pct', overPct.toFixed(1) + '%');
  setText('act-over-pct',     overPct.toFixed(1) + '%');
}

/* ═══════════════════════════════════════════════════════════
   ROW 3: REVENUE TREND
   ═══════════════════════════════════════════════════════════ */
function renderTrend(rows) {
  const years = [...new Set(rows.map(r => r.Year))].sort();
  const vals  = years.map(y => sum(rows.filter(r => r.Year === y), 'Sales'));
  const maxV  = Math.max(...vals, 1);

  // CAGR
  const cagr = years.length > 1 && vals[0] > 0
    ? (Math.pow(vals[vals.length - 1] / vals[0], 1 / (years.length - 1)) - 1) * 100
    : 0;
  const conclEl = document.getElementById('trend-conclusion');
  if (conclEl) {
    conclEl.textContent = `Revenue growth is flat (${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}% CAGR), peaking in 2024 (highlighted in deep blue) due to post-pandemic demand spikes.`;
  }

  killChart('trend');
  CHARTS.trend = new Chart(document.getElementById('chart-trend'), {
    type: 'bar',
    data: {
      labels: years,
      datasets: [{
        data: vals,
        backgroundColor: vals.map(v => v === maxV ? '#1E3A8A' : SLATE),
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      ...barOpts(true),
      plugins: {
        legend: { display: false },
        tooltip: makeTooltip(true)
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 3: FORECAST RISK SUMMARY
   ═══════════════════════════════════════════════════════════ */
function renderForecastRisk(rows) {
  const over   = sum(rows, 'Over');
  const under  = sum(rows, 'Under');
  const total  = over + under || 1;
  const overPct  = pct(over, total);
  const underPct = pct(under, total);
  const fcstErr  = avg(rows, 'FcstErr');

  setText('fkpi-over',   overPct.toFixed(1) + '%');
  setText('fkpi-under',  underPct.toFixed(1) + '%');
  setText('fkpi-error',  fcstErr.toFixed(2) + '%');
  // Progress bars removed from UI to reduce density and visual clutter
}

/* ═══════════════════════════════════════════════════════════
   ROW 4: STOCK vs DEMAND CHART
   ═══════════════════════════════════════════════════════════ */
function renderStockDemand(rows) {
  const levels  = ['High', 'Medium', 'Low'];
  const stocks  = levels.map(l => avg(rows.filter(r => r.Demand === l), 'Stock'));
  const colors  = [RED, AMBER, GREEN];

  killChart('stockdemand');
  CHARTS.stockdemand = new Chart(document.getElementById('chart-stock-demand'), {
    type: 'bar',
    data: {
      labels: levels,
      datasets: [{
        label: 'Avg Stock on Hand',
        data: stocks,
        backgroundColor: colors,
        borderRadius: 6
      }]
    },
    options: {
      ...barOpts(false, true),
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: INK,
          callbacks: { label: c => ` ${c.label}: ${c.raw.toFixed(1)} units avg stock` }
        }
      },
      scales: {
        x: {
          ticks: { font: { family: 'Inter', size: 13 }, color: MUTED, callback: v => v + ' units' },
          grid: { color: LINE }
        },
        y: {
          ticks: { font: { family: 'Inter', size: 13 }, color: MUTED },
          grid: { display: false }
        }
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 4: SHELF VISUAL (max 12 items, no scrollbar)
   ═══════════════════════════════════════════════════════════ */
function renderShelf(productRows) {
  const products = [...new Set(productRows.map(r => r.Product))];
  const agg = products.map(p => {
    const sub = productRows.filter(r => r.Product === p);
    return { p, units: sum(sub, 'Units'), stock: avg(sub, 'Stock') };
  }).sort((a, b) => b.units - a.units).slice(0, 12);

  const maxU = Math.max(...agg.map(a => a.units), 1);
  const wrap = document.getElementById('shelf-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  agg.forEach(a => {
    const h = Math.max(20, pct(a.units, maxU));
    const color = a.stock < 50 ? RED : a.stock < 80 ? AMBER : GREEN;
    const label = a.stock < 50 ? 'Critical' : a.stock < 80 ? 'Thinning' : 'Well stocked';
    const b = document.createElement('div');
    b.className = 'shelf-book';
    b.style.cssText = `height:${h}%;background:${color}`;
    b.innerHTML = `<div class="shelf-tooltip">${a.p}<br>${a.units.toLocaleString('en-IN')} units · ${a.stock.toFixed(0)} in stock · ${label}</div>`;
    wrap.appendChild(b);
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 5: CATEGORY DONUT with custom legend
   ═══════════════════════════════════════════════════════════ */
function renderCategory(rows) {
  const cats  = [...new Set(rows.map(r => r.Category))];
  const vals  = cats.map(c => sum(rows.filter(r => r.Category === c), 'Sales'));
  const total = vals.reduce((a, b) => a + b, 0);
  const order = cats.map((c, i) => ({ c, v: vals[i] })).sort((a, b) => b.v - a.v);

  killChart('category');
  CHARTS.category = new Chart(document.getElementById('chart-category'), {
    type: 'doughnut',
    data: {
      labels: order.map(o => o.c),
      datasets: [{
        data: order.map(o => o.v),
        backgroundColor: CAT_COLORS,
        borderWidth: 2,
        borderColor: '#fff',
        cutout: '55%'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },  /* custom legend below */
        tooltip: {
          backgroundColor: INK,
          callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)} (${total > 0 ? (c.raw / total * 100).toFixed(1) : 0}%)` }
        }
      }
    }
  });

  // Custom right-side legend
  const legendEl = document.getElementById('donut-legend');
  if (legendEl && total > 0) {
    legendEl.innerHTML = order.map((o, i) =>
      `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${CAT_COLORS[i]}"></span>
        <span>${o.c}</span>
        <span class="donut-legend-pct">${(o.v / total * 100).toFixed(0)}%</span>
      </div>`
    ).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   ROW 5: REGIONAL SNAPSHOT (tiles + bar chart)
   ═══════════════════════════════════════════════════════════ */
function renderRegion(rows) {
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  const rData   = regions.map(rg => ({
    rg,
    sales:  sum(rows.filter(r => r.Region === rg), 'Sales'),
    orders: sum(rows.filter(r => r.Region === rg), 'Orders')
  })).sort((a, b) => b.sales - a.sales);

  const best   = rData[0];
  const worst  = rData[rData.length - 1];
  const demand = [...rData].sort((a, b) => b.orders - a.orders)[0];

  setText('rt-best',       best   ? best.rg   : '—');
  setText('rt-best-val',   best   ? fmt(best.sales) + ' revenue' : '—');
  setText('rt-weak',       worst  ? worst.rg  : '—');
  setText('rt-weak-val',   worst  ? fmt(worst.sales) + ' revenue' : '—');
  setText('rt-demand',     demand ? demand.rg : '—');
  setText('rt-demand-val', demand ? demand.orders.toLocaleString('en-IN') + ' orders' : '—');

  const labels = rData.map(r => r.rg);
  const vals   = rData.map(r => r.sales);
  const colors = rData.map(r => r.rg === (best ? best.rg : '') ? GREEN : SLATE);

  killChart('region');
  CHARTS.region = new Chart(document.getElementById('chart-region'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: vals, backgroundColor: colors, borderRadius: 5 }]
    },
    options: barOpts(true)
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 6: SEASONAL DEMAND
   ═══════════════════════════════════════════════════════════ */
function renderSeason(rows) {
  const order = ['Winter', 'Spring', 'Summer', 'Autumn'];
  const vals  = order.map(s => sum(rows.filter(r => r.Season === s), 'Sales'));

  killChart('season');
  CHARTS.season = new Chart(document.getElementById('chart-season'), {
    type: 'bar',
    data: {
      labels: order,
      datasets: [{ data: vals, backgroundColor: SEASON_COLORS, borderRadius: 6 }]
    },
    options: barOpts(true)
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 6: TOP PRODUCTS (revenue concentration)
   ═══════════════════════════════════════════════════════════ */
function renderProducts(productRows) {
  const products = [...new Set(productRows.map(r => r.Product))];
  const vals     = products.map(p => sum(productRows.filter(r => r.Product === p), 'Sales'));
  const order    = products.map((p, i) => ({ p, v: vals[i] })).sort((a, b) => b.v - a.v).slice(0, 8);

  killChart('products');
  CHARTS.products = new Chart(document.getElementById('chart-products'), {
    type: 'bar',
    data: {
      labels: order.map(o => o.p),
      datasets: [{
        data: order.map(o => o.v),
        backgroundColor: order.map((_, i) => i === 0 ? '#1E3A8A' : i === 1 ? SLATE : '#94A3B8'),
        borderRadius: 5
      }]
    },
    options: { ...barOpts(true, true) }
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 7: TOP CITIES (collapsible)
   ═══════════════════════════════════════════════════════════ */
function renderCities(cityRows) {
  const cities = [...new Set(cityRows.map(r => r.City))];
  const vals   = cities.map(c => sum(cityRows.filter(r => r.City === c), 'Sales'));
  const order  = cities.map((c, i) => ({ c, v: vals[i] })).sort((a, b) => b.v - a.v).slice(0, 8);

  // Inline plugin to draw data labels at the end of horizontal bars
  const datalabelsPlugin = {
    id: 'datalabels',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: { right } } = chart;
      ctx.save();
      ctx.font = 'bold 13px Inter'; // Scaled value label to 13px bold
      ctx.fillStyle = '#1A2530'; // High contrast ink color
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((bar, index) => {
          const value = dataset.data[index];
          const formattedValue = fmt(value); // Format using our existing fmt helper (e.g. ₹25.8L, ₹4.31 Cr)
          const xPos = bar.x + 8; // 8px padding from the bar end
          const yPos = bar.y;
          
          if (xPos < right + 60) {
            ctx.fillText(formattedValue, xPos, yPos);
          }
        });
      });
      ctx.restore();
    }
  };

  killChart('cities');
  CHARTS.cities = new Chart(document.getElementById('chart-cities'), {
    type: 'bar',
    data: {
      labels: order.map(o => o.c),
      datasets: [{ data: order.map(o => o.v), backgroundColor: SLATE, borderRadius: 5 }]
    },
    options: {
      ...barOpts(true, true),
      layout: {
        padding: {
          right: 55 // Cushion to prevent labels from being clipped
        }
      },
      barPercentage: 0.78, // Thicker bars (approx +20%)
      categoryPercentage: 0.85,
      scales: {
        x: {
          ticks: {
            font: { family: 'Inter', size: 14 },
            color: '#475569',
            callback: v => fmtShort(v)
          },
          grid: { color: LINE }
        },
        y: {
          ticks: {
            font: { family: 'Inter', size: 15, weight: '600' }, // Bold and large city labels (15px)
            color: '#1A2530' // High-contrast ink
          },
          grid: { display: false }
        }
      }
    },
    plugins: [datalabelsPlugin]
  });
}

/* ═══════════════════════════════════════════════════════════
   ROW 4: INVENTORY SUMMARY
   ═══════════════════════════════════════════════════════════ */
function updateInventory(rows) {
  setText('inv-avg-stock', avg(rows, 'Stock').toFixed(1) + ' units');
}

/* ═══════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ═══════════════════════════════════════════════════════════
   FILTER TAB INTERACTION
   ═══════════════════════════════════════════════════════════ */
function setupFilters() {
  const regSel = document.getElementById('filter-region');
  const catSel = document.getElementById('filter-cat');
  
  if (regSel) {
    regSel.addEventListener('change', () => {
      FILTERS.region = regSel.value;
      renderAll();
    });
  }
  
  if (catSel) {
    catSel.addEventListener('change', () => {
      FILTERS.cat = catSel.value;
      renderAll();
    });
  }

  // Clear
  const clearBtn = document.getElementById('clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      FILTERS = { region: '', cat: '' };
      if (regSel) regSel.value = '';
      if (catSel) catSel.value = '';
      renderAll();
    });
  }
}

// Collapsible operational details controls removed - section is permanently visible

/* ═══════════════════════════════════════════════════════════
   RENDER ALL (including inventory row)
   ═══════════════════════════════════════════════════════════ */
function renderAll() {
  const rows        = MAIN_CUBE.filter(matchMain);
  const productRows = PRODUCT_CUBE.filter(matchProduct);
  const cityRows    = CITY_CUBE.filter(matchCity);

  updateHeader(rows);
  updateKPIStrip(rows);
  updateBriefing(rows);
  updateExecutiveSummary(rows, productRows);
  updateActionCenter(rows);
  updateInventory(rows);
  renderTrend(rows);
  renderForecastRisk(rows);
  renderStockDemand(rows);
  renderShelf(productRows);
  renderCategory(rows);
  renderRegion(rows);
  renderSeason(rows);
  renderProducts(productRows);
  renderCities(cityRows);
}

/* ═══════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════ */
window.addEventListener('load', () => {
  updateClock();
  setInterval(updateClock, 60000);
  setupFilters();
  loadDataAndBoot();
});