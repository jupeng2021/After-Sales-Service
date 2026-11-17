(() => {
  const people = [
    { name: '陈巨鹏', role: '技术服务部经理' },
    { name: '肖林', role: '技术部工程师 · 公司' },
    { name: '洪凯', role: '技术部工程师 · 北理莫斯科大学驻场' }
  ];
  const types = [
    { name: '上门送货', key: 'delivery' }, { name: '上门维护', key: 'maintain' },
    { name: '远程服务', key: 'remote' }, { name: '驻场服务', key: 'resident' }, { name: '大型项目', key: 'project' },
    { name: '公司内部工作', key: 'internal' }
  ];
  let records = [];
  let institutions = [];
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => localDate(new Date());
  let selectedCalendarDate = today();
  const typeInfo = name => types.find(t => t.name === name) || types[0];
  const assistantsOf = record => Array.isArray(record.assistants) ? record.assistants : [];
  const assignedTo = (record, name) => record.person === name || assistantsOf(record).some(a => a.person === name);
  const personHours = (record, name) => record.person === name ? Number(record.hours) || 0 : assistantsOf(record).filter(a => a.person === name).reduce((sum, a) => sum + (Number(a.hours) || 0), 0);
  const totalHours = record => (Number(record.hours) || 0) + assistantsOf(record).reduce((sum, a) => sum + (Number(a.hours) || 0), 0);

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
    const hours = scope.reduce((sum, r) => sum + totalHours(r), 0);
    $('stats').innerHTML = [
      ['服务任务', scope.length, '本周期登记总数', '▦'], ['已完成', complete, '已完成任务', '✓'],
      ['待跟进', waiting, '待处理或处理中', '◷'], ['工程师人时', hours.toFixed(1), '小时 · 主处理与协助工时合计', '◴']
    ].map(([label, value, note, icon]) => `<div class="card stat"><div class="stat-head">${label}<span class="stat-icon">${icon}</span></div><strong>${value}</strong><small>${note}</small></div>`).join('');
    const max = Math.max(1, ...types.map(t => scope.filter(r => r.type === t.name).length));
    $('typeBars').innerHTML = types.map(t => {
      const count = scope.filter(r => r.type === t.name).length;
      return `<div class="bar-row"><span class="bar-label">${t.name}</span><div class="bar-track"><div class="bar-fill" style="width:${count ? Math.max(4, count / max * 100) : 0}%"></div></div><span class="bar-num">${count}</span></div>`;
    }).join('');
    $('team').innerHTML = people.map(person => {
      const list = scope.filter(r => assignedTo(r, person.name));
      const hoursForPerson = list.reduce((sum, r) => sum + personHours(r, person.name), 0);
      return `<div class="member"><div class="avatar">${person.name.slice(-1)}</div><div class="member-main"><b>${person.name}</b><small>${person.role}</small></div><div class="member-count">${list.length}<small>${hoursForPerson.toFixed(1)} 小时</small></div></div>`;
    }).join('');
    $('workloadBody').innerHTML = people.map(person => {
      const list = scope.filter(r => assignedTo(r, person.name));
      const counts = types.map(t => list.filter(r => r.type === t.name).length);
      const hoursForPerson = list.reduce((sum, r) => sum + personHours(r, person.name), 0);
      return `<tr><td><b>${esc(person.name)}</b></td><td>${list.length}</td>${counts.map(n => `<td>${n}</td>`).join('')}<td>${list.filter(r => r.status === '已完成').length}</td><td>${hoursForPerson.toFixed(1)} 小时</td></tr>`;
    }).join('');
    const startLabel = $('rangeStart').value || '开始不限', endLabel = $('rangeEnd').value || '至今';
    $('workloadCaption').textContent = `统计范围：${startLabel} 至 ${endLabel}；任务和工时按主处理及协助工程师分别统计`;
    const query = $('search').value.trim().toLowerCase(), type = $('filterType').value, person = $('filterPerson').value, status = $('filterStatus').value;
    const list = records.filter(r => (!type || r.type === type) && (!person || assignedTo(r, person)) && (!status || r.status === status) && (!query || [r.customer, r.project, r.internal_category, r.description, r.result, r.person, assistantsOf(r).map(a => a.person).join(' '), r.location, r.source].join(' ').toLowerCase().includes(query))).sort((a, b) => b.date.localeCompare(a.date));
    $('recordCount').textContent = `共 ${list.length} 条记录`;
    $('empty').hidden = list.length > 0;
    $('tbody').innerHTML = list.map(r => `<tr><td>${esc(r.date)}${r.service_time ? `<div class="muted">${esc(r.service_time)}</div>` : ''}</td><td><span class="type-tag tag-${typeInfo(r.type).key}">${esc(r.type)}</span>${r.internal_category ? `<div class="muted">${esc(r.internal_category)}</div>` : ''}</td><td><b>${esc(r.customer || (r.type === '公司内部工作' ? '公司内部' : ''))}</b><div class="muted">${esc(r.project || '未关联项目')}</div></td><td>${esc(r.person)}${assistantsOf(r).length ? `<div class="muted">协助：${assistantsOf(r).map(a => esc(a.person)).join('、')}</div>` : ''}</td><td title="${esc(r.description)}">${esc(r.description.length > 34 ? r.description.slice(0, 34) + '…' : r.description)}</td><td>${totalHours(r).toFixed(1)} 小时</td><td><span class="status ${r.status === '已完成' ? 'done' : r.status === '处理中' ? 'processing' : 'pending'}">${esc(r.status)}</span></td><td><div class="row-actions"><button class="link-btn" data-print="${esc(r.id)}">打印</button><button class="link-btn" data-edit="${esc(r.id)}">编辑</button><button class="link-btn delete" data-delete="${esc(r.id)}">删除</button></div></td></tr>`).join('');
    renderCalendar(); renderInstitutions();
  }
  function renderInstitutions() {
    const byRecentService = items => [...items].sort((a, b) => (b.last_service_date || '').localeCompare(a.last_service_date || '') || (Number(b.service_count) || 0) - (Number(a.service_count) || 0) || a.name.localeCompare(b.name, 'zh-CN'));
    const recentlyUsed = byRecentService(institutions);
    $('customerSuggestions').innerHTML = recentlyUsed.filter(i => i.status === '在用').flatMap(i => [i.name, ...String(i.aliases || '').split(/[、；;,，]/).map(x => x.trim()).filter(Boolean)]).map(name => `<option value="${esc(name)}"></option>`).join('');
    const query = $('institutionSearch').value.trim().toLowerCase(), kind = $('institutionKindFilter').value, status = $('institutionStatusFilter').value;
    const list = byRecentService(institutions.filter(i => (!kind || i.kind === kind) && (!status || i.status === status) && (!query || [i.name, i.aliases, i.district, i.address, i.contact_name, i.contact_phone].join(' ').toLowerCase().includes(query))));
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
    const monthRecords = records.filter(r => assignedTo(r, person) && r.date?.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`));
    const profile = people.find(p => p.name === person) || people[0];
    $('calendarProfile').innerHTML = `<div class="avatar">${profile.name.slice(-1)}</div><div class="profile-info"><b>${esc(profile.name)}</b><small>${esc(profile.role)} · 日历档案</small></div><div class="profile-stats"><span>${monthRecords.length}<small>参与服务</small></span><span>${monthRecords.reduce((s,r)=>s+personHours(r,person),0).toFixed(1)}<small>个人工时</small></span></div>`;
    const first = new Date(year, month, 1), start = new Date(year, month, 1 - first.getDay()), todayText = today();
    const heads = ['日','一','二','三','四','五','六'].map(d => `<div class="cal-head">周${d}</div>`).join('');
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const date = new Date(start); date.setDate(start.getDate() + i);
      const iso = localDate(date), count = records.filter(r => assignedTo(r, person) && r.date === iso).length;
      const cls = ['cal-day', date.getMonth() !== month ? 'outside' : '', iso === todayText ? 'today' : '', iso === selectedCalendarDate ? 'selected' : ''].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-calendar-date="${iso}"><span class="cal-num">${date.getDate()}</span>${count ? `<br><span class="cal-count">${count} 项</span>` : ''}</button>`;
    }
    $('calendarGrid').innerHTML = heads + cells;
    $('selectedDateTitle').textContent = `${selectedCalendarDate} · ${person}`;
    const items = records.filter(r => assignedTo(r, person) && r.date === selectedCalendarDate);
    const serviceHtml = items.map(r => `<div class="cal-item"><span class="type-tag tag-${typeInfo(r.type).key}">${esc(r.type)}</span><div><b>${esc(r.internal_category || r.customer || '公司内部')}${r.project ? ` · ${esc(r.project)}` : ''}</b><small>${r.person === person ? '主处理' : '协助'} · ${esc(r.description)} · ${personHours(r,person).toFixed(1)} 小时</small></div></div>`);
    $('selectedDateItems').innerHTML = serviceHtml.join('') || '<div class="cal-empty">当天没有已登记服务。</div>';
  }
  function openModal(id) {
    $('recordForm').reset(); $('recordId').value = ''; $('date').value = today(); $('status').value = '待处理';
    $('assistantRows').innerHTML = '';
    $('modalTitle').textContent = id ? '编辑上门服务单' : '新建上门服务单';
    if (id) {
      const record = records.find(r => r.id === id); if (!record) return;
      for (const key of ['date', 'type', 'person', 'source', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result', 'contact_name', 'contact_phone', 'service_time', 'problem', 'parts', 'follow_up', 'internal_category']) $(key).value = record[key] ?? '';
      $('channel').dataset.saved = record.channel || '';
      $('recordId').value = id;
    } else { $('channel').dataset.saved = ''; $('channel').value = ''; }
    updateServiceFields();
    renderAssistantRows(id ? assistantsOf(records.find(r => r.id === id)) : []);
    $('modalBack').classList.add('open');
  }
  function collectAssistantRows() {
    return [...$('assistantRows').querySelectorAll('.assistant-row')].map(row => ({ person: row.querySelector('.assistant-person').value, hours: row.querySelector('.assistant-hours').value.trim() }));
  }
  function renderAssistantRows(rows) {
    const primary = $('person').value;
    $('assistantRows').innerHTML = rows.map((assistant, index) => {
      const occupied = new Set(rows.filter((_, i) => i !== index).map(item => item.person));
      const choices = people.filter(person => person.name !== primary && (!occupied.has(person.name) || person.name === assistant.person));
      return `<div class="assistant-row"><select class="assistant-person" required>${choices.map(person => `<option${person.name === assistant.person ? ' selected' : ''}>${esc(person.name)}</option>`).join('')}</select><input class="assistant-hours" type="number" min="0.25" step="0.25" placeholder="协助工时（小时）" value="${esc(assistant.hours ?? '')}" required><button type="button" class="assistant-remove" data-remove-assistant>移除</button></div>`;
    }).join('');
  }
  function updateServiceFields() {
    const type = $('type').value, delivery = type === '上门送货', maintenance = type === '上门维护';
    const remote = type === '远程服务', resident = type === '驻场服务', internal = type === '公司内部工作', onsite = delivery || maintenance;
    const labels = { '上门送货': '新建上门送货单', '上门维护': '新建上门维护单', '远程服务': '新建远程服务单', '驻场服务': '新建驻场任务单', '大型项目': '新建项目服务记录', '公司内部工作': '新建公司内部工作记录' };
    $('modalTitle').textContent = `${$('recordId').value ? '编辑' : '新建'}${(labels[type] || '服务单').replace(/^新建/, '')}`;
    $('problemField').hidden = delivery || internal;
    $('parts').closest('label').hidden = !maintenance;
    $('problem').required = maintenance || remote || resident || type === '大型项目';
    $('equipmentField').hidden = !delivery;
    $('quantityField').hidden = !delivery;
    $('internalCategoryField').hidden = !internal;
    $('internal_category').required = internal;
    $('equipment').required = delivery;
    $('quantity').required = delivery;
    $('customer').required = !internal;
    $('customerLabel').textContent = internal ? '关联用户 / 项目（选填）' : '用户 / 单位 *';
    $('location').required = onsite || internal;
    $('locationField').hidden = !(onsite || resident || type === '大型项目' || internal);
    $('contactNameField').hidden = !onsite;
    $('contactPhoneField').hidden = !onsite;
    $('service_time').required = onsite;
    $('serviceTimeLabel').textContent = delivery ? '送达时间' : maintenance ? '到访时间' : remote ? '处理时间' : resident ? '任务时间' : internal ? '工作时间' : '服务时间';
    $('locationField').firstChild.textContent = delivery ? '送达地址' : resident ? '驻场地点' : internal ? '工作地点' : '上门地点';
    $('problemLabel').textContent = maintenance ? '故障现象 / 用户需求' : remote ? '远程问题 / 用户需求' : resident ? '驻场任务内容' : '问题 / 项目任务';
    $('descriptionLabel').textContent = internal ? '实际工作内容 *' : '服务内容 *';
    if (internal && !$('location').value) $('location').value = '公司';
    const channels = internal ? ['公司内部', '其他'] : remote ? ['VPN', '向日葵', '电话', '工作群', '其他'] : resident ? ['现场处理', '远程协助', '电话', '其他'] : type === '大型项目' ? ['现场处理', 'VPN', '向日葵', '其他'] : ['现场处理', '电话', '其他'];
    const previousChannel = $('channel').value || $('channel').dataset.saved || '';
    const channelOptions = channels.includes(previousChannel) ? channels : [...channels, ...(previousChannel ? [previousChannel] : [])];
    $('channel').innerHTML = channelOptions.map(channel => `<option>${esc(channel)}</option>`).join('');
    $('channel').value = previousChannel || channels[0];
    $('hours').required = $('status').value === '已完成';
  }
  $('type').addEventListener('change', () => { $('channel').dataset.saved = ''; if ($('type').value === '公司内部工作') $('location').value = '公司'; else if ($('location').value === '公司') $('location').value = ''; updateServiceFields(); });
  $('person').addEventListener('change', () => renderAssistantRows(collectAssistantRows().filter(a => a.person !== $('person').value)));
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
      $('institutionHistory').innerHTML = `<h3>关联服务记录（${institution.service_count || 0}）</h3>${history.length ? history.map(r => `<div class="institution-history-row"><b>${esc(r.date)} · ${esc(r.type)} · ${esc(r.person)}${assistantsOf(r).length ? `（协助：${assistantsOf(r).map(a => esc(a.person)).join('、')}）` : ''}</b><span>${esc(r.description)}${totalHours(r) ? ` · ${totalHours(r).toFixed(1)} 人时` : ''}</span></div>`).join('') : '<div class="muted">还没有与该单位名称匹配的服务记录。</div>'}`;
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
  $('addAssistantBtn').onclick = () => {
    const rows = collectAssistantRows(), used = new Set(rows.map(row => row.person));
    const available = people.find(person => person.name !== $('person').value && !used.has(person.name));
    if (!available) { toast('其他成员已全部添加'); return; }
    rows.push({ person: available.name, hours: '' }); renderAssistantRows(rows);
  };
  $('assistantRows').onclick = event => {
    if (!event.target.closest('[data-remove-assistant]')) return;
    renderAssistantRows(collectAssistantRows().filter((_, index) => index !== [...$('assistantRows').children].indexOf(event.target.closest('.assistant-row'))));
  };
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
      for (const key of ['date', 'type', 'person', 'source', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result', 'contact_name', 'contact_phone', 'service_time', 'problem', 'parts', 'follow_up', 'internal_category']) body[key] = $(key).value.trim();
    body.assistants = collectAssistantRows();
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
    const rows = [['服务日期', '服务类型', '内部工作类别', '主处理工程师', '协助工程师及工时', '任务来源', '用户/单位', '所属项目', '负责销售', '服务地点', '现场联系人', '联系电话', '服务时间', '服务渠道', '设备型号与数量', '设备总数', '总人时', '状态', '故障/需求/任务', '服务内容', '更换配件', '处理结果', '后续跟进'], ...records.map(r => ['date', 'type', 'internal_category', 'person'].map(k => r[k] || '').concat([assistantsOf(r).map(a => `${a.person} ${a.hours}h`).join('；')], ['source', 'customer', 'project', 'sales', 'location', 'contact_name', 'contact_phone', 'service_time', 'channel', 'equipment', 'quantity'].map(k => r[k] || ''), [totalHours(r).toFixed(1)], ['status', 'problem', 'description', 'parts', 'result', 'follow_up'].map(k => r[k] || '')))];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `售后服务记录_${today()}.csv`; link.click(); URL.revokeObjectURL(url); toast('已导出 CSV');
  };
  $('exportWorkloadBtn').onclick = () => {
    const scope = periodRecords();
    const rows = [['工程师', '任务总数', ...types.map(t => t.name), '已完成', '投入工时(小时)'], ...people.map(person => {
      const list = scope.filter(r => assignedTo(r, person.name));
      return [person.name, list.length, ...types.map(t => list.filter(r => r.type === t.name).length), list.filter(r => r.status === '已完成').length, list.reduce((sum, r) => sum + personHours(r, person.name), 0).toFixed(1)];
    })];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `工程师工作量_${today()}.csv`; link.click(); URL.revokeObjectURL(url); toast('已导出工作量统计');
  };
  function printRecord(record) {
    if (!record) return;
    const field = (label, value) => `<div><b>${label}：</b>${esc(value || '—')}</div>`;
    $('printArea').innerHTML = `<h1>售后服务单</h1><div class="print-meta">${field('单据类型', record.type)}${field('内部工作类别', record.internal_category)}${field('服务日期', record.date)}${field('主处理工程师', record.person)}${field('协助工程师', assistantsOf(record).map(a => `${a.person}（${a.hours} 小时）`).join('、'))}${field('任务来源', record.source)}${field('状态', record.status)}${field('用户 / 单位', record.customer || (record.type === '公司内部工作' ? '公司内部' : ''))}${field('所属项目', record.project)}${field('负责销售', record.sales)}${field('服务地点', record.location)}${field('现场联系人', record.contact_name)}${field('联系电话', record.contact_phone)}${field('服务时间', record.service_time)}${field('投入人时', `${totalHours(record).toFixed(1)} 小时`)}${field('设备总数', record.quantity)}${field('服务渠道', record.channel)}</div><h2>设备型号与数量</h2><div class="print-content">${esc(record.equipment || '—')}</div><h2>故障 / 用户需求 / 任务内容</h2><div class="print-content">${esc(record.problem || '—')}</div><h2>服务内容</h2><div class="print-content">${esc(record.description || '—')}</div><h2>更换配件</h2><div class="print-content">${esc(record.parts || '—')}</div><h2>处理结果 / 用户确认</h2><div class="print-content">${esc(record.result || '—')}</div><h2>后续跟进</h2><div class="print-content">${esc(record.follow_up || '—')}</div><div class="signatures"><span>工程师签字：</span><span>用户确认：</span></div>`;
    window.print();
  }
  $('logoutBtn').onclick = async () => { await request('/api/logout', { method: 'POST', body: '{}' }); location.href = '/login'; };
  Promise.all([reloadRecords(), reloadInstitutions()]).catch(error => toast(error.message));
})();
