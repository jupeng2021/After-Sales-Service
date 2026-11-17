(() => {
  const people = [
    { name: '陈巨鹏', role: '技术服务部经理' },
    { name: '肖林', role: '技术部工程师 · 公司' },
    { name: '洪凯', role: '技术部工程师 · 北理莫斯科大学驻场' }
  ];
  const types = [
    { name: '上门送货', key: 'delivery' }, { name: '上门维护', key: 'maintain' },
    { name: '远程服务', key: 'remote' }, { name: '驻场服务', key: 'resident' }, { name: '大型项目', key: 'project' }
  ];
  let records = [];
  let institutions = [];
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => localDate(new Date());
  let selectedCalendarDate = today();
  const typeInfo = name => types.find(t => t.name === name) || types[0];

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    if (response.status === 401) { location.href = '/login'; throw new Error('登录状态已失效'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '请求失败');
    return data;
  }
  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }
  function fillOptions(select, values, first) {
    select.innerHTML = (first ? `<option value="">${first}</option>` : '') + values.map(x => `<option>${esc(typeof x === 'string' ? x : x.name)}</option>`).join('');
  }
  fillOptions($('type'), types); fillOptions($('filterType'), types, '全部类型');
  fillOptions($('person'), people); fillOptions($('filterPerson'), people, '全部成员');
  fillOptions($('calendarPerson'), people);

  function setPeriodDates(period) {
    const now = new Date(), end = localDate(now);
    if (period === 'all') { $('rangeStart').value = ''; $('rangeEnd').value = ''; return; }
    const start = period === 'year' ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
    $('rangeStart').value = localDate(start); $('rangeEnd').value = end;
  }
  setPeriodDates('month');
  function periodRecords() {
    const start = $('rangeStart').value, end = $('rangeEnd').value;
    return records.filter(r => (!start || r.date >= start) && (!end || r.date <= end));
  }
  function render() {
    const scope = periodRecords(), complete = scope.filter(r => r.status === '已完成').length;
    const waiting = scope.filter(r => r.status !== '已完成').length;
    const hours = scope.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
    $('stats').innerHTML = [
      ['服务任务', scope.length, '本周期登记总数', '▦'], ['已完成', complete, '已完成任务', '✓'],
      ['待跟进', waiting, '待处理或处理中', '◷'], ['服务用时', hours.toFixed(1), '小时 · 已登记工时', '◴']
    ].map(([label, value, note, icon]) => `<div class="card stat"><div class="stat-head">${label}<span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${note}</small></div>`).join('');
    const max = Math.max(1, ...types.map(t => scope.filter(r => r.type === t.name).length));
    $('typeBars').innerHTML = types.map(t => {
      const count = scope.filter(r => r.type === t.name).length;
      return `<div class="bar-row"><span class="bar-label">${t.name}</span><div class="bar-track"><div class="bar-fill" style="width:${count ? Math.max(4, count / max * 100) : 0}%"></div></div><span class="bar-num">${count}</span></div>`;
    }).join('');
    $('team').innerHTML = people.map(person => {
      const list = scope.filter(r => r.person === person.name);
      const personHours = list.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
      return `<div class="member"><div class="avatar">${person.name.slice(-1)}</div><div class="member-main"><b>${person.name}</b><small>${person.role}</small></div><div class="member-count">${list.length}<small>${personHours.toFixed(1)} 小时</small></div></div>`;
    }).join('');
    $('workloadBody').innerHTML = people.map(person => {
      const list = scope.filter(r => r.person === person.name);
      const counts = types.map(t => list.filter(r => r.type === t.name).length);
      const hoursForPerson = list.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
      return `<tr><td><b>${esc(person.name)}</b></td><td>${list.length}</td>${counts.map(n => `<td>${n}</td>`).join('')}<td>${list.filter(r => r.status === '已完成').length}</td><td>${hoursForPerson.toFixed(1)} 小时</td></tr>`;
    }).join('');
    const startLabel = $('rangeStart').value || '开始不限', endLabel = $('rangeEnd').value || '至今';
    $('workloadCaption').textContent = `统计范围：${startLabel} 至 ${endLabel}；任务按单据中的主处理工程师统计`;
    const query = $('search').value.trim().toLowerCase(), type = $('filterType').value, person = $('filterPerson').value, status = $('filterStatus').value;
    const list = records.filter(r => (!type || r.type === type) && (!person || r.person === person) && (!status || r.status === status) && (!query || [r.customer, r.project, r.description, r.result, r.person, r.location, r.source].join(' ').toLowerCase().includes(query))).sort((a, b) => b.date.localeCompare(a.date));
    $('recordCount').textContent = `共 ${list.length} 条记录`;
    $('empty').hidden = list.length > 0;
    $('tbody').innerHTML = list.map(r => `<tr><td>${esc(r.date)}${r.service_time ? `<div class="muted">${esc(r.service_time)}</div>` : ''}</td><td><span class="type-tag tag-${typeInfo(r.type).key}">${esc(r.type)}</span></td><td><b>${esc(r.customer)}</b><div class="muted">${esc(r.project || '未关联项目')}</div></td><td>${esc(r.person)}</td><td title="${esc(r.description)}">${esc(r.description.length > 34 ? r.description.slice(0, 34) + '…' : r.description)}</td><td>${Number(r.hours || 0) || '—'} 小时</td><td><span class="status ${r.status === '已完成' ? 'done' : r.status === '处理中' ? 'processing' : 'pending'}">${esc(r.status)}</span></td><td><div class="row-actions"><button class="link-btn" data-print="${esc(r.id)}">打印</button><button class="link-btn" data-edit="${esc(r.id)}">编辑</button><button class="link-btn delete" data-delete="${esc(r.id)}">删除</button></div></td></tr>`).join('');
    renderCalendar(); renderInstitutions();
  }
  function renderInstitutions() {
    $('customerSuggestions').innerHTML = institutions.filter(i => i.status === '在用').flatMap(i => [i.name, ...String(i.aliases || '').split(/[、；;,，]/).map(x => x.trim()).filter(Boolean)]).map(name => `<option value="${esc(name)}"></option>`).join('');
    const query = $('institutionSearch').value.trim().toLowerCase(), kind = $('institutionKindFilter').value, status = $('institutionStatusFilter').value;
    const list = institutions.filter(i => (!kind || i.kind === kind) && (!status || i.status === status) && (!query || [i.name, i.aliases, i.district, i.address, i.contact_name, i.contact_phone].join(' ').toLowerCase().includes(query)));
    const universities = institutions.filter(i => i.kind === '高校').length, institutes = institutions.filter(i => i.kind !== '高校').length;
    $('institutionCount').textContent = `共 ${institutions.length} 家单位：高校 ${universities} 家，科研院所及平台 ${institutes} 家`;
    $('institutionEmpty').hidden = list.length > 0;
    $('institutionBody').innerHTML = list.map(i => `<tr><td><b>${esc(i.name)}</b><div class="muted">${esc(i.aliases || i.contact_name || '暂无联系人')}</div></td><td>${esc(i.kind)}</td><td>${esc(i.district || '—')}</td><td>${i.service_count || 0}</td><td>${esc(i.last_service_date || '—')}</td><td><span class="status ${i.status === '在用' ? 'done' : 'pending'}">${esc(i.status)}</span></td><td><button class="link-btn" data-institution="${i.id}">打开档案</button></td></tr>`).join('');
  }
  async function reloadInstitutions() { institutions = await request('/api/institutions'); renderInstitutions(); }
  function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function renderCalendar() {
    const person = $('calendarPerson').value || people[0].name, year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
    $('monthLabel').textContent = `${year}年${month + 1}月`;
    const monthRecords = records.filter(r => r.person === person && r.date?.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`));
    const profile = people.find(p => p.name === person) || people[0];
    $('calendarProfile').innerHTML = `<div class="avatar">${profile.name.slice(-1)}</div><div class="profile-info"><b>${esc(profile.name)}</b><small>${esc(profile.role)} · 日历档案</small></div><div class="profile-stats"><span>${monthRecords.length}<small>本月服务</small></span><span>${monthRecords.reduce((s,r)=>s+(Number(r.hours)||0),0).toFixed(1)}<small>登记工时</small></span></div>`;
    const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay()), todayText = today();
    const heads = ['日','一','二','三','四','五','六'].map(d => `<div class="cal-head">周${d}</div>`).join('');
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const iso = localDate(date), count = records.filter(r => r.person === person && r.date === iso).length;
      const cls = ['cal-day', date.getMonth() !== month ? 'outside' : '', iso === todayText ? 'today' : '', iso === selectedCalendarDate ? 'selected' : ''].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-calendar-date="${iso}"><span class="cal-num">${date.getDate()}</span>${count ? `<br><span class="cal-count">${count} 项</span>` : ''}</button>`;
    }
    $('calendarGrid').innerHTML = heads + cells;
    $('selectedDateTitle').textContent = `${selectedCalendarDate} · ${person}`;
    const items = records.filter(r => r.person === person && r.date === selectedCalendarDate);
    const serviceHtml = items.map(r => `<div class="cal-item"><span class="type-tag tag-${typeInfo(r.type).key}">${esc(r.type)}</span><div><b>${esc(r.customer)}${r.project ? ` · ${esc(r.project)}` : ''}</b><small>${esc(r.description)}${r.hours ? ` · ${esc(r.hours)} 小时` : ''}</small></div></div>`);
    $('selectedDateItems').innerHTML = serviceHtml.join('') || '<div class="cal-empty">当天没有已登记服务。</div>';
  }
  function openModal(id) {
    $('recordForm').reset(); $('recordId').value = ''; $('date').value = today(); $('status').value = '待处理';
    $('modalTitle').textContent = id ? '编辑上门服务单' : '新建上门服务单';
    if (id) {
      const record = records.find(r => r.id === id); if (!record) return;
      for (const key of ['date', 'type', 'person', 'source', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result', 'contact_name', 'contact_phone', 'service_time', 'problem', 'parts', 'follow_up']) $(key).value = record[key] ?? '';
      $('channel').dataset.saved = record.channel || '';
      $('recordId').value = id;
    } else { $('channel').dataset.saved = ''; $('channel').value = ''; }
    updateServiceFields();
    $('modalBack').classList.add('open');
  }
  function updateServiceFields() {
    const type = $('type').value, delivery = type === '上门送货', maintenance = type === '上门维护';
    const remote = type === '远程服务', resident = type === '驻场服务', onsite = delivery || maintenance;
    const labels = { '上门送货': '新建上门送货单', '上门维护': '新建上门维护单', '远程服务': '新建远程服务单', '驻场服务': '新建驻场任务单', '大型项目': '新建项目服务记录' };
    $('modalTitle').textContent = `${$('recordId').value ? '编辑' : '新建'}${(labels[type] || '服务单').replace(/^新建/, '')}`;
    $('problemField').hidden = delivery;
    $('parts').closest('label').hidden = !maintenance;
    $('problem').required = maintenance || remote || resident || type === '大型项目';
    $('equipmentField').hidden = !delivery;
    $('quantityField').hidden = !delivery;
    $('equipment').required = delivery;
    $('quantity').required = delivery;
    $('location').required = onsite;
    $('locationField').hidden = !(onsite || resident || type === '大型项目');
    $('contactNameField').hidden = !onsite;
    $('contactPhoneField').hidden = !onsite;
    $('service_time').required = onsite;
    $('serviceTimeLabel').textContent = delivery ? '送达时间' : maintenance ? '到访时间' : remote ? '处理时间' : resident ? '任务时间' : '服务时间';
    $('locationField').firstChild.textContent = delivery ? '送达地址' : resident ? '驻场地点' : '上门地点';
    $('problemLabel').textContent = maintenance ? '故障现象 / 用户需求' : remote ? '远程问题 / 用户需求' : resident ? '驻场任务内容' : '问题 / 项目任务';
    const channels = remote ? ['VPN', '向日葵', '电话', '工作群', '其他'] : resident ? ['现场处理', '远程协助', '电话', '其他'] : type === '大型项目' ? ['现场处理', 'VPN', '向日葵', '其他'] : ['现场处理', '电话', '其他'];
    const previousChannel = $('channel').value || $('channel').dataset.saved || '';
    const channelOptions = channels.includes(previousChannel) ? channels : [...channels, ...(previousChannel ? [previousChannel] : [])];
    $('channel').innerHTML = channelOptions.map(channel => `<option>${esc(channel)}</option>`).join('');
    $('channel').value = previousChannel || channels[0];
    $('hours').required = $('status').value === '已完成';
  }
  $('type').addEventListener('change', () => { $('channel').dataset.saved = ''; updateServiceFields(); });
  $('status').addEventListener('change', updateServiceFields);
  function closeModal() { $('modalBack').classList.remove('open'); }
  function openInstitutionModal(id) {
    $('institutionForm').reset(); $('institutionId').value = '';
    $('institutionModalTitle').textContent = id ? '单位档案' : '新增单位档案';
    const institution = id ? institutions.find(i => String(i.id) === String(id)) : null;
    if (id && !institution) return;
    if (institution) {
      for (const [field, key] of [['instName','name'],['instAliases','aliases'],['instKind','kind'],['instDistrict','district'],['instStatus','status'],['instAddress','address'],['instContact','contact_name'],['instPhone','contact_phone'],['instWebsite','website'],['instSource','source'],['instNotes','notes']]) $(field).value = institution[key] || '';
      $('institutionId').value = institution.id;
      const institutionNames = new Set([institution.name, ...String(institution.aliases || '').split(/[、；;,，]/).map(x => x.trim()).filter(Boolean)]);
      const history = records.filter(r => institutionNames.has(r.customer)).sort((a,b) => b.date.localeCompare(a.date)).slice(0,10);
      $('institutionHistory').hidden = false;
      $('institutionHistory').innerHTML = `<h3>关联服务记录（${institution.service_count || 0}）</h3>${history.length ? history.map(r => `<div class="institution-history-row"><b>${esc(r.date)} · ${esc(r.type)} · ${esc(r.person)}</b><span>${esc(r.description)}${r.hours ? ` · ${esc(r.hours)} 小时` : ''}</span></div>`).join('') : '<div class="muted">还没有与该单位名称匹配的服务记录。</div>'}`;
    } else {
      $('instKind').value = '高校'; $('instStatus').value = '在用'; $('institutionHistory').hidden = true; $('institutionHistory').innerHTML = '';
    }
    $('institutionModalBack').classList.add('open');
  }
  function closeInstitutionModal() { $('institutionModalBack').classList.remove('open'); }
  async function reloadRecords() { records = await request('/api/records'); render(); }

  $('addBtn').onclick = () => openModal();
  $('closeModal').onclick = $('cancelBtn').onclick = closeModal;
  $('modalBack').onclick = event => { if (event.target === $('modalBack')) closeModal(); };
  document.onkeydown = event => { if (event.key === 'Escape') { closeModal(); closeInstitutionModal(); } };
  $('addInstitutionBtn').onclick = () => openInstitutionModal();
  $('closeInstitutionModal').onclick = $('cancelInstitutionBtn').onclick = closeInstitutionModal;
  $('institutionModalBack').onclick = event => { if (event.target === $('institutionModalBack')) closeInstitutionModal(); };
  $('institutionBody').onclick = event => { const button = event.target.closest('[data-institution]'); if (button) openInstitutionModal(button.dataset.institution); };
  $('institutionForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('institutionId').value;
    const body = { name: $('instName').value.trim(), aliases: $('instAliases').value.trim(), kind: $('instKind').value, district: $('instDistrict').value, status: $('instStatus').value, address: $('instAddress').value.trim(), contact_name: $('instContact').value.trim(), contact_phone: $('instPhone').value.trim(), website: $('instWebsite').value.trim(), source: $('instSource').value.trim(), notes: $('instNotes').value.trim() };
    try {
      await request(id ? `/api/institutions/${encodeURIComponent(id)}` : '/api/institutions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      closeInstitutionModal(); await Promise.all([reloadInstitutions(), reloadRecords()]); toast(id ? '单位档案已更新' : '单位档案已建立');
    } catch (error) { toast(error.message); }
  };
  for (const id of ['institutionSearch', 'institutionKindFilter', 'institutionStatusFilter']) $(id).addEventListener(id === 'institutionSearch' ? 'input' : 'change', renderInstitutions);
  $('recordForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('recordId').value, body = {};
    for (const key of ['date', 'type', 'person', 'source', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result', 'contact_name', 'contact_phone', 'service_time', 'problem', 'parts', 'follow_up']) body[key] = $(key).value.trim();
    try {
      await request(id ? `/api/records/${encodeURIComponent(id)}` : '/api/records', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      closeModal(); await reloadRecords(); toast(id ? '记录已更新' : '服务记录已保存');
    } catch (error) { toast(error.message); }
  };
  $('tbody').onclick = async event => {
    const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-delete]'), print = event.target.closest('[data-print]');
    if (print) printRecord(records.find(r => r.id === print.dataset.print));
    if (edit) openModal(edit.dataset.edit);
    if (remove && confirm('确定删除这条服务记录吗？')) {
      try { await request(`/api/records/${encodeURIComponent(remove.dataset.delete)}`, { method: 'DELETE' }); await reloadRecords(); toast('记录已删除'); }
      catch (error) { toast(error.message); }
    }
  };
  $('period').addEventListener('change', () => { setPeriodDates($('period').value); render(); });
  for (const id of ['rangeStart', 'rangeEnd']) $(id).addEventListener('change', () => { $('period').value = 'custom'; render(); });
  for (const id of ['filterType', 'filterPerson', 'filterStatus']) $(id).addEventListener('change', render);
  $('search').addEventListener('input', render);
  function setNav(button) { document.querySelectorAll('.nav button').forEach(item => item.classList.remove('active')); button.classList.add('active'); }
  $('navRecords').onclick = () => { setNav($('navRecords')); $('calendarPanel').hidden = true; $('institutionsPanel').hidden = true; $('recordsPanel').scrollIntoView({ behavior: 'smooth' }); };
  $('navCalendar').onclick = () => { setNav($('navCalendar')); $('institutionsPanel').hidden = true; $('calendarPanel').hidden = false; renderCalendar(); $('calendarPanel').scrollIntoView({ behavior: 'smooth' }); };
  $('navOverview').onclick = () => { setNav($('navOverview')); $('calendarPanel').hidden = true; $('institutionsPanel').hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('navInstitutions').onclick = () => { setNav($('navInstitutions')); $('calendarPanel').hidden = true; $('institutionsPanel').hidden = false; renderInstitutions(); $('institutionsPanel').scrollIntoView({ behavior: 'smooth' }); };
  $('calendarPerson').addEventListener('change', renderCalendar);
  $('prevMonth').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); selectedCalendarDate = localDate(calendarMonth); renderCalendar(); };
  $('nextMonth').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); selectedCalendarDate = localDate(calendarMonth); renderCalendar(); };
  $('calendarGrid').onclick = event => { const cell = event.target.closest('[data-calendar-date]'); if (!cell) return; selectedCalendarDate = cell.dataset.calendarDate; const date = new Date(`${selectedCalendarDate}T12:00:00`); calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1); renderCalendar(); };
  $('exportBtn').onclick = () => {
    const rows = [['服务日期', '服务类型', '处理人员', '任务来源', '用户/单位', '所属项目', '负责销售', '服务地点', '现场联系人', '联系电话', '服务时间', '服务渠道', '设备型号与数量', '设备总数', '用时(小时)', '状态', '故障/需求/任务', '服务内容', '更换配件', '处理结果', '后续跟进'], ...records.map(r => ['date', 'type', 'person', 'source', 'customer', 'project', 'sales', 'location', 'contact_name', 'contact_phone', 'service_time', 'channel', 'equipment', 'quantity', 'hours', 'status', 'problem', 'description', 'parts', 'result', 'follow_up'].map(k => r[k] || ''))];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `售后服务记录_${today()}.csv`; link.click(); URL.revokeObjectURL(url); toast('已导出 CSV');
  };
  $('exportWorkloadBtn').onclick = () => {
    const scope = periodRecords();
    const rows = [['工程师', '任务总数', ...types.map(t => t.name), '已完成', '投入工时(小时)'], ...people.map(person => {
      const list = scope.filter(r => r.person === person.name);
      return [person.name, list.length, ...types.map(t => list.filter(r => r.type === t.name).length), list.filter(r => r.status === '已完成').length, list.reduce((sum, r) => sum + (Number(r.hours) || 0), 0).toFixed(1)];
    })];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `工程师工作量_${today()}.csv`; link.click(); URL.revokeObjectURL(url); toast('已导出工作量统计');
  };
  function printRecord(record) {
    if (!record) return;
    const field = (label, value) => `<div><b>${label}：</b>${esc(value || '—')}</div>`;
    $('printArea').innerHTML = `<h1>售后服务单</h1><div class="print-meta">${field('单据类型', record.type)}${field('服务日期', record.date)}${field('主处理工程师', record.person)}${field('任务来源', record.source)}${field('状态', record.status)}${field('用户 / 单位', record.customer)}${field('所属项目', record.project)}${field('负责销售', record.sales)}${field('服务地点', record.location)}${field('现场联系人', record.contact_name)}${field('联系电话', record.contact_phone)}${field('服务时间', record.service_time)}${field('投入工时', `${record.hours || 0} 小时`)}${field('设备总数', record.quantity)}${field('服务渠道', record.channel)}</div><h2>设备型号与数量</h2><div class="print-content">${esc(record.equipment || '—')}</div><h2>故障 / 用户需求 / 任务内容</h2><div class="print-content">${esc(record.problem || '—')}</div><h2>服务内容</h2><div class="print-content">${esc(record.description || '—')}</div><h2>更换配件</h2><div class="print-content">${esc(record.parts || '—')}</div><h2>处理结果 / 用户确认</h2><div class="print-content">${esc(record.result || '—')}</div><h2>后续跟进</h2><div class="print-content">${esc(record.follow_up || '—')}</div><div class="signatures"><span>工程师签字：</span><span>用户确认：</span></div>`;
    window.print();
  }
  $('logoutBtn').onclick = async () => { await request('/api/logout', { method: 'POST', body: '{}' }); location.href = '/login'; };
  Promise.all([reloadRecords(), reloadInstitutions()]).catch(error => toast(error.message));
})();
