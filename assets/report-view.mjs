const sections = [
  { id: 'overview', title: '经营概览' },
  { id: 'brands', title: '品牌表现' },
  { id: 'channels', title: '达播与自营' },
  { id: 'intelligence', title: '行业与 AI 情报' },
];

const refreshStageLabels = {
  CHECKING_HUE: '检查 Hue',
  READING: '读取中',
  CALCULATING: '计算中',
  VALIDATING: '复核中',
  PUBLISHING: '发布中',
  VERIFYING_ONLINE: '线上复核中',
  COMPLETED: '完成',
};

const refreshBindings = new WeakMap();
const latestPublishedReportUrl = 'https://chulanzhang659-spec.github.io/korea-business-daily-report-pages/daily/latest/';

export function reportViewModel(report) {
  return {
    sections,
    units: [...(report.business_units ?? []), report.overall].filter(Boolean),
    brands: [...(report.brands ?? [])],
    stores: [...(report.stores ?? [])],
    news: [...(report.news ?? [])],
    metricStatuses: [...(report.metric_statuses ?? [])],
  };
}

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.id) node.id = options.id;
  return node;
}

function money(value) {
  if (value === null || value === undefined) return '暂无';
  return `${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) / 10000)}万`;
}

function percent(value) {
  if (value === null || value === undefined) return '暂无';
  return new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 }).format(Number(value));
}

function percentagePoints(value) {
  if (value === null || value === undefined) return '暂无';
  const formatted = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(Number(value) * 100);
  return `${Number(value) >= 0 ? '+' : ''}${formatted}个百分点`;
}

const stateLabels = {
  READY: '可用',
  NEEDS_DATA: '待补数据',
  NOT_COMPARABLE: '不可比',
  NO_TARGET: '无独立目标',
  WORKDAY_ONLY: '仅工作日',
};

function metricView(result, formatter = percent) {
  if (result?.status === 'READY' && result.value !== null && result.value !== undefined) {
    return element('span', { text: formatter(result.value) });
  }
  const link = element('span', {
    text: stateLabels[result?.status] ?? '待补数据',
    className: 'metric-link',
  });
  link.title = result?.detail ?? '指标暂不可用';
  return link;
}

function addText(parent, tag, text, className) {
  const child = element(tag, { text, className });
  parent.append(child);
  return child;
}

function setRefreshState(button, status, { message, state, active }) {
  button.disabled = Boolean(active);
  button.setAttribute('aria-busy', active ? 'true' : 'false');
  status.setAttribute('aria-busy', active ? 'true' : 'false');
  status.dataset.state = state;
  status.textContent = message;
}

function verifiedLatestUrl(detail) {
  if (!detail || detail.verified !== true) return null;
  const reportDate = detail.report_date;
  if (typeof reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null;
  const parsedDate = new Date(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== reportDate) return null;
  const compactDate = reportDate.replaceAll('-', '');
  if (typeof detail.release_id !== 'string'
    || !new RegExp(`^${compactDate}-[0-9a-f]{12}$`).test(detail.release_id)) return null;
  if (typeof detail.latest_url !== 'string' || detail.latest_url !== detail.latest_url.trim()) return null;
  const authority = detail.latest_url.match(/^https:\/\/([^/?#]+)(?:[/?#]|$)/)?.[1];
  if (authority !== 'chulanzhang659-spec.github.io') return null;
  let latestUrl;
  try {
    latestUrl = new URL(detail.latest_url);
  } catch {
    return null;
  }
  if (latestUrl.protocol !== 'https:'
    || latestUrl.origin !== 'https://chulanzhang659-spec.github.io'
    || latestUrl.username
    || latestUrl.password
    || latestUrl.port
    || latestUrl.search
    || latestUrl.hash) return null;
  const canonicalPath = '/korea-business-daily-report-pages/daily/latest/';
  if (latestUrl.pathname !== canonicalPath && latestUrl.pathname !== canonicalPath.slice(0, -1)) return null;
  latestUrl.pathname = canonicalPath;
  return latestUrl.href;
}

export function bindRefreshEvents(root, options = {}) {
  const button = root.querySelector('#overall-refresh');
  const status = root.querySelector('#refresh-status');
  const eventTarget = options.eventTarget
    ?? (typeof window === 'undefined' ? null : window);
  const navigate = options.navigate
    ?? ((url) => window.location.assign(url));
  if (!button || !status || !eventTarget || button.dataset.koreaRefresh !== 'start') return () => {};

  refreshBindings.get(root)?.();
  const listeners = {
    'korea-refresh-ready': () => setRefreshState(button, status, {
      message: '刷新组件已就绪，请确认 Hue 已登录后点击“整体刷新”',
      state: 'success',
      active: false,
    }),
    'korea-refresh-progress': (event) => {
      const detail = event.detail ?? {};
      setRefreshState(button, status, {
        message: refreshStageLabels[detail.stage] ?? detail.message ?? '处理中',
        state: 'warning',
        active: true,
      });
    },
    'korea-refresh-failed': (event) => {
      const detail = event.detail ?? {};
      const stage = refreshStageLabels[detail.stage];
      setRefreshState(button, status, {
        message: detail.message ?? (stage ? `${stage}失败，请根据提示重试` : '刷新失败，请根据提示重试'),
        state: 'failure',
        active: false,
      });
    },
    'korea-refresh-complete': (event) => {
      const detail = event.detail ?? {};
      const latestUrl = verifiedLatestUrl(detail);
      if (!latestUrl) {
        setRefreshState(button, status, {
          message: '线上复核结果不完整，未跳转到新版日报',
          state: 'failure',
          active: false,
        });
        return;
      }
      setRefreshState(button, status, {
        message: refreshStageLabels.COMPLETED,
        state: 'success',
        active: false,
      });
      navigate(latestUrl);
    },
  };

  Object.entries(listeners).forEach(([type, listener]) => {
    eventTarget.addEventListener(type, listener);
  });
  const cleanup = () => Object.entries(listeners).forEach(([type, listener]) => {
    eventTarget.removeEventListener(type, listener);
  });
  refreshBindings.set(root, cleanup);
  return cleanup;
}

function addSectionHeader(parent, title, note, iconText) {
  const head = element('div', { className: 'section-head' });
  const titleWrap = element('div', { className: 'title' });
  addText(titleWrap, 'span', iconText, 'section-icon');
  addText(titleWrap, 'h2', title);
  head.append(titleWrap);
  addText(head, 'span', note, 'subtle');
  parent.append(head);
}

function targetView(value, target, timeProgress) {
  const root = element('div', { className: 'target' });
  const line = element('div', { className: 'target-line' });
  const fill = element('span', { className: 'target-fill' });
  fill.style.width = `${Math.min(Math.max(Number(value ?? 0) * 100, 0), 100)}%`;
  line.append(fill);
  if (timeProgress !== null && timeProgress !== undefined) {
    const marker = element('i', { className: 'target-marker' });
    marker.style.left = `${Math.min(Math.max(Number(timeProgress) * 100, 0), 100)}%`;
    line.append(marker);
  }
  const meta = element('div', { className: 'target-meta' });
  addText(meta, 'span', percent(value));
  addText(meta, 'span', target == null ? '无独立目标' : money(target));
  root.append(line, meta);
  return root;
}

function renderUnit(unit, report, day, progress) {
  const card = element('article', { className: 'card unit' });
  addText(card, 'div', unit.brand, 'unit-name');
  const sales = element('div', { className: 'sales' });
  for (const [label, value, note] of [
    ['当日净销售额', unit.daily_net_sales, report.report_date],
    ['本月累计净销售额', unit.month_net_sales, `截至${day}日`],
  ]) {
    const metric = element('div', { className: 'metric' });
    addText(metric, 'div', label, 'label');
    addText(metric, 'div', money(value), 'money');
    addText(metric, 'div', note, 'subtle');
    sales.append(metric);
  }
  const quality = element('div', { className: 'quality' });
  const returns = element('div', { className: 'quality-row' });
  const returnValue = element('div');
  addText(returnValue, 'div', '整体退货率');
  addText(returnValue, 'div', percent(unit.return_rate), 'quality-value');
  addText(returns, 'div', `本月退款金额 ${money(unit.month_refund_amount)}`, 'refund');
  returns.prepend(returnValue);
  const attainment = element('div', { className: 'quality-row' });
  const attainmentValue = element('div');
  addText(attainmentValue, 'div', '月度目标达成率');
  addText(attainmentValue, 'div', percent(unit.target_attainment), 'quality-value');
  const attainmentDetail = element('div');
  attainmentDetail.append(targetView(unit.target_attainment, unit.monthly_target, progress));
  const delta = element('div', { className: 'subtle' });
  addText(delta, 'span', `时间进度 ${percent(progress)} · 目标进度差 `);
  delta.append(metricView(unit.progress_gap, percentagePoints));
  attainmentDetail.append(delta);
  attainment.append(attainmentValue, attainmentDetail);
  quality.append(returns, attainment);
  const comparisons = element('div', { className: 'comparison-strip' });
  for (const [label, result, formatter] of [
    ['同比', unit.year_over_year, percent],
    ['环比', unit.month_over_month, percent],
    ['本周工作日净销售', unit.weekday_net_sales, money],
    ['本周周末净销售', unit.weekend_net_sales, money],
  ]) {
    const item = element('div', { className: 'comparison-item' });
    addText(item, 'div', label, 'comparison-label');
    const value = element('div', { className: 'comparison-value' });
    value.append(metricView(result, formatter));
    item.append(value);
    comparisons.append(item);
  }
  card.append(sales, quality, comparisons);
  return card;
}

function createTable(headers) {
  const wrap = element('div', { className: 'scroll' });
  const table = element('table');
  const thead = element('thead');
  const row = element('tr');
  headers.forEach((header) => addText(row, 'th', header));
  thead.append(row);
  const body = element('tbody');
  table.append(thead, body);
  wrap.append(table);
  return { wrap, body };
}

function addCell(row, text, className) {
  addText(row, 'td', text, className);
}

function addMetricCell(row, result, formatter) {
  const cell = element('td');
  cell.append(metricView(result, formatter));
  row.append(cell);
}

function fillBrandRows(body, brands, progress) {
  body.replaceChildren();
  brands.forEach((brand, index) => {
    const row = element('tr');
    addCell(row, index + 1);
    addCell(row, brand.brand);
    addCell(row, money(brand.daily_net_sales), 'money-cell');
    addCell(row, money(brand.month_net_sales), 'money-cell');
    addMetricCell(row, brand.weekday_net_sales, money);
    addMetricCell(row, brand.weekend_net_sales, money);
    addCell(row, money(brand.sampling_sales), 'money-cell');
    addCell(row, percent(brand.return_rate));
    const targetCell = element('td');
    targetCell.append(targetView(brand.target_attainment, brand.monthly_target, progress));
    row.append(targetCell);
    addMetricCell(row, brand.progress_gap, percentagePoints);
    addMetricCell(row, brand.year_over_year, percent);
    addMetricCell(row, brand.month_over_month, percent);
    body.append(row);
  });
}

function fillStoreRows(body, stores, progress) {
  body.replaceChildren();
  if (!stores.length) {
    const row = element('tr');
    const cell = element('td', { text: '当前筛选范围没有大店', className: 'empty' });
    cell.colSpan = 13;
    row.append(cell);
    body.append(row);
    return;
  }
  stores.forEach((store, index) => {
    const row = element('tr');
    [index + 1, store.store, store.brand, money(store.daily_net_sales), money(store.month_net_sales)].forEach((value, cellIndex) => addCell(row, value, cellIndex >= 3 ? 'money-cell' : undefined));
    addMetricCell(row, store.weekday_net_sales, money);
    addMetricCell(row, store.weekend_net_sales, money);
    addCell(row, money(store.sampling_sales), 'money-cell');
    addCell(row, percent(store.return_rate));
    const targetCell = element('td');
    if (store.target_attainment == null) targetCell.textContent = '无独立目标';
    else targetCell.append(targetView(store.target_attainment, store.monthly_target, progress));
    row.append(targetCell);
    addMetricCell(row, store.progress_gap, percentagePoints);
    addMetricCell(row, store.year_over_year, percent);
    addMetricCell(row, store.month_over_month, percent);
    body.append(row);
  });
}

function platformForChannelRow(row) {
  return ['天猫', '抖音', '快手'].find((platform) => (
    row?.store_or_account === platform || row?.store_or_account?.startsWith(`${platform}-`)
  ));
}

function channelScope(row, platform) {
  return row.store_or_account.replace(`${platform}-`, '') || '汇总';
}

function sumChannelRows(rows, key) {
  if (!rows.length || rows.some((row) => row[key] === null || row[key] === undefined)) return null;
  return rows.reduce((total, row) => total + Number(row[key]), 0);
}

function renderOngredientsChannels(report) {
  const section = element('section', { className: 'section', id: 'channels' });
  addSectionHeader(section, 'Ongredients 达播与自营', '飞书三平台合计 · 展开查看跨境/内贸', '播');
  const card = element('div', { className: 'card channel-card' });
  const channelData = report.ongredients_channels;
  if (!channelData) {
    addText(card, 'div', '飞书源待补数据；Hue 七品牌经营数据仍按独立口径展示。', 'empty');
    section.append(card);
    return section;
  }

  const summary = element('div', { className: 'channel-summary' });
  const lead = element('div', { className: 'channel-lead' });
  addText(lead, 'div', channelData.brand, 'channel-brand');
  addText(lead, 'div', '达人和自营分开展示，不计入七品牌净销售额。', 'channel-note');
  const kpis = element('div', { className: 'channel-kpis' });
  for (const [label, value] of [['达人', channelData.dabo_sales], ['自营', channelData.self_operated_sales]]) {
    const kpi = element('div', { className: 'channel-kpi' });
    addText(kpi, 'div', label, 'channel-kpi-label');
    addText(kpi, 'div', money(value), 'channel-kpi-value primary');
    kpis.append(kpi);
  }
  summary.append(lead, kpis);
  card.append(summary);
  const meta = element('div', { className: 'channel-meta' });
  addText(meta, 'span', `数据日 ${channelData.report_date}`);
  addText(meta, 'span', `工作表 ${channelData.sheet_name}`);
  card.append(meta);

  const rows = (channelData.rows ?? []).filter((row) => platformForChannelRow(row));
  const grid = element('div', { className: 'channel-platform-grid' });
  for (const platform of ['天猫', '抖音', '快手']) {
    const platformRows = rows.filter((row) => platformForChannelRow(row) === platform);
    const details = element('details', { className: 'channel-platform' });
    const summaryNode = element('summary');
    addText(summaryNode, 'span', platform, 'channel-platform-title');
    addText(summaryNode, 'span', '跨境 / 内贸明细', 'channel-platform-hint');
    addText(
      summaryNode,
      'span',
      `达人 ${money(sumChannelRows(platformRows, 'dabo_sales'))} · 自营 ${money(sumChannelRows(platformRows, 'self_operated_sales'))}`,
      'channel-platform-values',
    );
    details.append(summaryNode);
    const { wrap, body } = createTable(['业务线', '达人金额', '自营金额']);
    platformRows.forEach((row) => {
      const tableRow = element('tr');
      addCell(tableRow, channelScope(row, platform));
      addCell(tableRow, money(row.dabo_sales), 'money-cell');
      addCell(tableRow, money(row.self_operated_sales), 'money-cell');
      body.append(tableRow);
    });
    details.append(wrap);
    grid.append(details);
  }
  card.append(grid);
  section.append(card);
  return section;
}

function renderNewsCard(news) {
  const card = element('article', { className: 'news-card' });
  const badges = element('div');
  addText(badges, 'span', news.quality_level ?? '常规更新', 'level-badge');
  addText(badges, 'span', news.category ?? '', 'tag');
  if (news.korea_related) addText(badges, 'span', '韩国事业部相关', 'tag');
  card.append(badges);
  addText(card, 'h3', news.headline ?? '');
  addText(card, 'p', news.summary ?? '');
  addText(card, 'div', '值得关注', 'why');
  addText(card, 'p', news.why_it_matters ?? '');
  const source = element('div', { className: 'source' });
  addText(source, 'span', news.primary_source ?? '');
  addText(source, 'span', `${news.independent_source_count ?? 0}个独立信源`);
  if (news.primary_url) {
    const link = element('a', { text: '查看原文' });
    link.href = news.primary_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    source.append(link);
  }
  card.append(source);
  return card;
}

function renderNewsContents(root, news) {
  const children = [];
  const featured = news.find((item) => item.section === 'featured');
  if (featured) {
    const card = renderNewsCard(featured);
    card.classList.add('card', 'feature');
    children.push(card);
  }
  const columns = element('div', { className: 'news-columns' });
  for (const [sectionName, title] of [['beauty', '美妆行业变化'], ['ai', 'AI 变化']]) {
    const column = element('section', { className: 'card news-column' });
    addText(column, 'h3', title);
    const list = element('div', { className: 'news-list' });
    news.filter((item) => item.section === sectionName).slice(0, 2).forEach((item) => list.append(renderNewsCard(item)));
    if (!list.childElementCount) addText(list, 'div', '新闻数据不完整', 'empty');
    column.append(list);
    columns.append(column);
  }
  children.push(columns);
  root.replaceChildren(...children);
}

function publicNewsUrl(locationHref, filename) {
  const pageUrl = new URL(locationHref);
  const artifactUrl = new URL(`../../news/${filename}`, pageUrl);
  if (pageUrl.protocol !== 'https:' || artifactUrl.origin !== pageUrl.origin) {
    throw new Error('Unexpected public news origin');
  }
  return artifactUrl.href;
}

function validatePublicNews(payload) {
  const items = payload?.items;
  if (!Array.isArray(items) || items.length !== 5) throw new Error('Invalid public news payload');
  const sections = items.map((item) => item?.section);
  if (JSON.stringify(sections) !== JSON.stringify(['featured', 'beauty', 'beauty', 'ai', 'ai'])) {
    throw new Error('Invalid public news layout');
  }
  const urls = new Set();
  for (const item of items) {
    if (!item?.headline || !item?.primary_source || item.evidence_has_primary !== true) {
      throw new Error('Invalid public news item');
    }
    const url = new URL(item.primary_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || urls.has(url.href)) {
      throw new Error('Invalid public news source');
    }
    urls.add(url.href);
  }
  return items;
}

function publicNewsStatus(status) {
  if (status?.status === 'updated' && status.item_count === 5 && typeof status.checked_at === 'string') {
    return '公开网页核查：已更新（已验证 5 条）';
  }
  if (status?.status === 'retained' && typeof status.checked_at === 'string') {
    return '公开网页核查：本次未满足五条要求，保留上一版';
  }
  return '公开网页核查状态暂不可用，保留已发布新闻';
}

export async function refreshPublicNews(root, {
  fetchImpl = fetch,
  locationHref = typeof window === 'undefined' ? '' : window.location.href,
} = {}) {
  const statusNode = root.querySelector('#public-news-status');
  const newsRoot = root.querySelector('#news-root');
  if (!statusNode || !newsRoot) return;
  try {
    const latestUrl = publicNewsUrl(locationHref, 'latest.json');
    const statusUrl = publicNewsUrl(locationHref, 'status.json');
    const [latestResponse, statusResponse] = await Promise.all([
      fetchImpl(latestUrl, { cache: 'no-store', credentials: 'omit' }),
      fetchImpl(statusUrl, { cache: 'no-store', credentials: 'omit' }),
    ]);
    if (!latestResponse?.ok || !statusResponse?.ok) throw new Error('Public news unavailable');
    const [latest, status] = await Promise.all([latestResponse.json(), statusResponse.json()]);
    renderNewsContents(newsRoot, validatePublicNews(latest));
    statusNode.textContent = publicNewsStatus(status);
  } catch {
    statusNode.textContent = '公开网页核查暂不可用，保留已发布新闻';
  }
}

export function renderReport(root, report, options = {}) {
  const model = reportViewModel(report);
  const reportDate = new Date(`${report.report_date}T00:00:00`);
  const day = Number(report.report_date.slice(-2));
  const progress = report.time_progress == null ? null : Number(report.time_progress);
  const now = options.now ?? new Date();
  const beijingParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const currentDay = Number(beijingParts.day);
  const currentMonthDays = new Date(Number(beijingParts.year), Number(beijingParts.month), 0).getDate();
  const page = element('div', { className: 'page' });
  const header = element('header', { className: 'head' });
  const heading = element('div');
  addText(heading, 'div', 'KOREA BUSINESS DAILY REPORT', 'eyebrow');
  addText(heading, 'h1', '韩国事业部日报');
  const collectedAt = report.refresh_metadata?.collected_at;
  addText(
    heading,
    'div',
    `Hue 销售数据日 ${report.report_date}${collectedAt ? ` · 采集 ${collectedAt}` : ''}（北京时间）`,
    'meta',
  );
  const headActions = element('div', { className: 'head-actions' });
  addText(headActions, 'div', `今日 ${currentDay} / ${currentMonthDays}`, 'date');
  const refreshPanel = element('div', { className: 'refresh-panel' });
  const refreshButton = element('button', {
    id: 'overall-refresh',
    text: '刷新至最新已发布日报',
    className: 'refresh-button',
  });
  refreshButton.type = 'button';
  refreshButton.disabled = false;
  refreshButton.setAttribute('aria-describedby', 'refresh-status');
  const refreshStatus = element('div', {
    id: 'refresh-status',
    text: '仅重新加载已审核发布的数据，不读取 Hue',
    className: 'refresh-status',
  });
  refreshStatus.dataset.koreaRefreshStatus = '';
  refreshStatus.dataset.state = 'warning';
  refreshStatus.setAttribute('aria-live', 'polite');
  refreshStatus.setAttribute('aria-atomic', 'true');
  refreshButton.addEventListener('click', () => {
    setRefreshState(refreshButton, refreshStatus, {
      message: '正在加载最新页面',
      state: 'warning',
      active: false,
    });
    const navigate = options.navigate ?? ((url) => window.location.assign(url));
    navigate(latestPublishedReportUrl);
  });
  refreshPanel.append(refreshButton, refreshStatus);
  headActions.append(refreshPanel);
  header.append(heading, headActions);
  page.append(header);
  const nav = element('nav', { className: 'nav' });
  model.sections.forEach(({ id, title }) => {
    const link = element('a', { text: title });
    link.href = `#${id}`;
    nav.append(link);
  });
  page.append(nav);

  const overview = element('section', { className: 'section', id: 'overview' });
  addSectionHeader(overview, '经营概览', '净销售额口径', '◔');
  const unitGrid = element('div', { className: 'unit-grid' });
  model.units.forEach((unit) => unitGrid.append(renderUnit(unit, report, day, progress)));
  overview.append(unitGrid);
  page.append(overview);

  const brandsSection = element('section', { className: 'section', id: 'brands' });
  addSectionHeader(brandsSection, '品牌表现', '按本月累计净销售额降序', '▦');
  const filters = element('div', { className: 'filters' });
  const brandCard = element('div', { className: 'card table-card' });
  addText(brandCard, 'div', '品牌表现对比', 'table-head');
  const brandTable = createTable(['排名', '品牌', '当日净销售额', '月累计净销售额', '本周工作日净销售', '本周周末净销售', '派样销售额', '退货率', '月目标达成率', '目标进度差', '同比', '环比']);
  brandCard.append(brandTable.wrap);
  const applyFilter = (brand) => {
    const visibleBrands = brand === 'all' ? model.brands : model.brands.filter((item) => item.brand === brand);
    fillBrandRows(brandTable.body, visibleBrands, progress);
  };
  ['全部品牌', ...model.brands.map((item) => item.brand)].forEach((label, index) => {
    const button = element('button', { text: label, className: `chip${index === 0 ? ' active' : ''}` });
    button.type = 'button';
    button.addEventListener('click', () => {
      filters.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      applyFilter(index === 0 ? 'all' : label);
    });
    filters.append(button);
  });
  brandsSection.append(filters, brandCard);
  applyFilter('all');
  page.append(brandsSection);

  page.append(renderOngredientsChannels(report));

  const intelligence = element('section', { className: 'section', id: 'intelligence' });
  addSectionHeader(intelligence, '行业与 AI 情报', '自动聚类与独立信源验证', '◎');
  const publicNewsStatus = element('div', {
    id: 'public-news-status',
    text: '公开网页新闻将在本页加载后独立核查',
    className: 'subtle',
  });
  const newsRoot = element('div', { id: 'news-root' });
  renderNewsContents(newsRoot, model.news);
  intelligence.append(publicNewsStatus, newsRoot);
  page.append(intelligence);
  addText(page, 'footer', '页面仅展示已发布快照，同一新闻事件已合并重复转载。');
  root.replaceChildren(page);
  bindRefreshEvents(root, options);
}

function renderPublicationList(root, title, publications) {
  const page = element('div', { className: 'page' });
  addText(page, 'h1', title);
  const list = element('div', { className: 'unit-grid' });
  publications.forEach((publication) => {
    const link = element('a', { className: 'card feature' });
    link.href = publication.path ?? `./daily/${publication.report_date}/`;
    addText(link, 'strong', publication.label ?? publication.report_date);
    list.append(link);
  });
  page.append(list);
  root.replaceChildren(page);
}

export function renderHome(root, payload) {
  const publications = [payload.latest, ...(payload.history ?? [])].filter(Boolean);
  renderPublicationList(root, '韩国事业部日报', publications);
}

export function renderHistory(root, payload) {
  renderPublicationList(root, '历史日报', payload.publications ?? []);
}
