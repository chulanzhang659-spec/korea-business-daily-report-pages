const sections = [
  { id: 'overview', title: '经营概览' },
  { id: 'brands', title: '品牌与大店表现' },
  { id: 'data-status', title: '数据状态' },
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
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(Number(value) / 10000)}万`;
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
  const link = element('a', {
    text: stateLabels[result?.status] ?? '待补数据',
    className: 'metric-link',
  });
  link.href = '#data-status';
  link.title = result?.detail ?? '查看数据状态';
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
  if (!button || !status || !eventTarget) return () => {};

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

export function renderReport(root, report, options = {}) {
  const model = reportViewModel(report);
  const reportDate = new Date(`${report.report_date}T00:00:00`);
  const days = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0).getDate();
  const day = Number(report.report_date.slice(-2));
  const progress = report.time_progress == null ? null : Number(report.time_progress);
  const page = element('div', { className: 'page' });
  const header = element('header', { className: 'head' });
  const heading = element('div');
  addText(heading, 'div', 'KOREA BUSINESS DAILY REPORT', 'eyebrow');
  addText(heading, 'h1', '韩国事业部日报');
  addText(heading, 'div', `数据截至 ${report.report_date} 23:59`, 'meta');
  const headActions = element('div', { className: 'head-actions' });
  addText(headActions, 'div', `今日 ${day} / ${days}`, 'date');
  const refreshPanel = element('div', { className: 'refresh-panel' });
  const refreshButton = element('button', {
    id: 'overall-refresh',
    text: '整体刷新',
    className: 'refresh-button',
  });
  refreshButton.type = 'button';
  refreshButton.disabled = true;
  refreshButton.dataset.koreaRefresh = 'start';
  refreshButton.setAttribute('aria-describedby', 'refresh-status');
  const refreshStatus = element('div', {
    id: 'refresh-status',
    text: '本机刷新组件未连接，当前页面仍可查看',
    className: 'refresh-status',
  });
  refreshStatus.dataset.koreaRefreshStatus = '';
  refreshStatus.dataset.state = 'warning';
  refreshStatus.setAttribute('aria-live', 'polite');
  refreshStatus.setAttribute('aria-atomic', 'true');
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
  addSectionHeader(brandsSection, '品牌与大店表现', '按本月累计净销售额降序', '▦');
  const filters = element('div', { className: 'filters' });
  const brandCard = element('div', { className: 'card table-card' });
  addText(brandCard, 'div', '品牌表现对比', 'table-head');
  const brandTable = createTable(['排名', '品牌', '当日净销售额', '月累计净销售额', '本周工作日净销售', '本周周末净销售', '派样销售额', '退货率', '月目标达成率', '目标进度差', '同比', '环比']);
  brandCard.append(brandTable.wrap);
  const storeCard = element('div', { className: 'card table-card' });
  storeCard.style.marginTop = '14px';
  const storeHead = element('div', { className: 'table-head' });
  addText(storeHead, 'strong', '今日大店');
  const storeCount = addText(storeHead, 'span', '', 'count');
  storeCard.append(storeHead);
  const storeTable = createTable(['排名', '大店名称', '所属品牌', '当日净销售额', '月累计净销售额', '本周工作日净销售', '本周周末净销售', '派样销售额', '退货率', '月目标达成率', '目标进度差', '同比', '环比']);
  storeCard.append(storeTable.wrap);
  const applyFilter = (brand) => {
    const visibleBrands = brand === 'all' ? model.brands : model.brands.filter((item) => item.brand === brand);
    const visibleStores = brand === 'all' ? model.stores : model.stores.filter((item) => item.brand === brand);
    fillBrandRows(brandTable.body, visibleBrands, progress);
    fillStoreRows(storeTable.body, visibleStores, progress);
    storeCount.textContent = `${visibleStores.length}家`;
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
  brandsSection.append(filters, brandCard, storeCard);
  applyFilter('all');
  page.append(brandsSection);

  const statusSection = element('section', { className: 'section', id: 'data-status' });
  addSectionHeader(statusSection, '数据状态与口径', '缺数不补零，不可比不显示 0%', '≡');
  const statusCard = element('div', { className: 'card status-card' });
  const statusSummary = element('div', { className: 'status-summary' });
  const periodMode = report.period_mode === 'calendar_days'
    ? '自然日（周末数据齐全）'
    : '工作日（周末数据不完整）';
  addText(statusSummary, 'strong', `当前周期：${periodMode}`);
  addText(statusSummary, 'span', `周起始：${report.week_start ?? '暂无'}`);
  addText(statusSummary, 'span', `时间进度：${percent(report.time_progress)}`);
  addText(statusSummary, 'span', `源文件：${(report.source_files ?? []).length} 个`);
  const refreshMetadata = report.refresh_metadata;
  if (refreshMetadata) {
    addText(statusSummary, 'span', `采集时间：${refreshMetadata.collected_at ?? '暂无'}`);
    addText(statusSummary, 'span', `最新 ETL：${refreshMetadata.latest_etl_time ?? '暂无'}`);
    addText(statusSummary, 'span', `复核状态：${refreshMetadata.validation_state ?? '暂无'}`);
    addText(statusSummary, 'span', `发布版本：${refreshMetadata.release_id ?? '暂无'}`);
  } else {
    addText(statusSummary, 'span', '本报告尚未通过一键刷新链路生成', 'refresh-legacy');
  }
  statusCard.append(statusSummary);
  const statusList = element('div', { className: 'status-list' });
  if (!model.metricStatuses.length) {
    addText(statusList, 'div', '当前快照没有指标状态清单，请重新执行日报生成流程。', 'status-empty');
  } else {
    model.metricStatuses.forEach((item) => {
      const row = element('div', { className: 'status-row' });
      addText(row, 'div', item.label, 'status-name');
      const stateWrap = element('div');
      const state = element('span', { text: stateLabels[item.status] ?? item.status, className: 'state' });
      state.dataset.state = item.status;
      stateWrap.append(state);
      row.append(stateWrap);
      addText(row, 'div', item.detail, 'status-detail');
      addText(row, 'div', `所需数据：${item.required_input || '已发布快照'}`, 'status-input');
      statusList.append(row);
    });
  }
  statusCard.append(statusList);
  statusSection.append(statusCard);
  page.append(statusSection);

  const intelligence = element('section', { className: 'section', id: 'intelligence' });
  addSectionHeader(intelligence, '行业与 AI 情报', '自动聚类与独立信源验证', '◎');
  const featured = model.news.find((item) => item.section === 'featured');
  if (featured) {
    const card = renderNewsCard(featured);
    card.classList.add('card', 'feature');
    intelligence.append(card);
  }
  const columns = element('div', { className: 'news-columns' });
  for (const [sectionName, title] of [['beauty', '美妆行业变化'], ['ai', 'AI 变化']]) {
    const column = element('section', { className: 'card news-column' });
    addText(column, 'h3', title);
    const list = element('div', { className: 'news-list' });
    model.news.filter((item) => item.section === sectionName).slice(0, 2).forEach((item) => list.append(renderNewsCard(item)));
    if (!list.childElementCount) addText(list, 'div', '新闻数据不完整', 'empty');
    column.append(list);
    columns.append(column);
  }
  intelligence.append(columns);
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
