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
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedCalendarDate = today();
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => localDate(new Date());
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
    const list = records.filter(r => (!type || r.type === type) && (!person || r.person === person) && (!status || r.status === status) && (!query || [r.customer, r.project, r.description, r.result, r.person, r.location].join(' ').toLowerCase().includes(query))).sort((a, b) => b.date.localeCompare(a.date));
    $('recordCount').textContent = `共 ${list.length} 条记录`;
    $('empty').hidden = list.length > 0;
    $('tbody').innerHTML = list.map(r => `<tr><td>${esc(r.date)}${r.service_time ? `<div class="muted">${esc(r.service_time)}</div>` : ''}</td><td><span class="type-tag tag-${typeInfo(r.type).key}">${esc(r.type)}</span></td><td><b>${esc(r.customer)}</b><div class="muted">${esc(r.project || '未关联项目')}</div></td><td>${esc(r.person)}</td><td title="${esc(r.description)}">${esc(r.description.length > 34 ? r.description.slice(0, 34) + '…' : r.description)}</td><td>${Number(r.hours || 0) || '—'} 小时</td><td><span class="status ${r.status === '已完成' ? 'done' : r.status === '处理中' ? 'processing' : 'pending'}">${esc(r.status)}</span></td><td><div class="row-actions"><button class="link-btn" data-print="${esc(r.id)}">打印</button><button class="link-btn" data-edit="${esc(r.id)}">编辑</button><button class="link-btn delete" data-delete="${esc(r.id)}">删除</button></div></td></tr>`).join('');
    renderCalendar();
  }
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
      for (const key of ['date', 'type', 'person', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result', 'contact_name', 'contact_phone', 'service_time', 'problem', 'parts', 'follow_up']) $(key).value = record[key] ?? '';
      $('recordId').value = id;
    }
    updateServiceFields();
    $('modalBack').classList.add('open');
  }
  function updateServiceFields() {
    const delivery = $('type').value === '上门送货';
    const onsite = delivery || $('type').value === '上门维护';
    $('problemField').hidden = delivery;
    $('parts').closest('label').hidden = delivery;
    $('problem').required = $('type').value === '上门维护';
    $('equipmentField').hidden = !delivery;
    $('quantityField').hidden = !delivery;
    $('equipment').required = delivery;
    $('quantity').required = delivery;
    $('location').required = onsite;
    $('service_time').required = onsite;
    $('hours').required = $('status').value === '已完成';
  }
  $('type').addEventListener('change', updateServiceFields);
  $('status').addEventListener('change', updateServiceFields);
  function closeModal() { $('modalBack').classList.remove('open'); }
  async function reloadRecords() { records = await request('/api/records'); render(); }

  $('addBtn').onclick = () => openModal();
  $('closeModal').onclick = $('cancelBtn').onclick = closeModal;
  $('modalBack').onclick = event => { if (event.target === $('modalBack')) closeModal(); };
  document.onkeydown = event => { if (event.key === 'Escape') closeModal(); };
  $('recordForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('recordId').value, body = {};
    for (const key of ['date', 'type', 'person', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result', 'contact_name', 'contact_phone', 'service_time', 'problem', 'parts', 'follow_up']) body[key] = $(key).value.trim();
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
  $('navRecords').onclick = () => { setNav($('navRecords')); $('calendarPanel').hidden = true; $('recordsPanel').scrollIntoView({ behavior: 'smooth' }); };
  $('navCalendar').onclick = () => { setNav($('navCalendar')); $('calendarPanel').hidden = false; renderCalendar(); $('calendarPanel').scrollIntoView({ behavior: 'smooth' }); };
  $('navOverview').onclick = () => { setNav($('navOverview')); $('calendarPanel').hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('calendarPerson').addEventListener('change', renderCalendar);
  $('prevMonth').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); selectedCalendarDate = localDate(calendarMonth); renderCalendar(); };
  $('nextMonth').onclick = () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); selectedCalendarDate = localDate(calendarMonth); renderCalendar(); };
  $('calendarGrid').onclick = event => { const cell = event.target.closest('[data-calendar-date]'); if (!cell) return; selectedCalendarDate = cell.dataset.calendarDate; const date = new Date(`${selectedCalendarDate}T12:00:00`); calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1); renderCalendar(); };
  $('exportBtn').onclick = () => {
    const rows = [['服务日期', '服务类型', '处理人员', '用户/单位', '所属项目', '负责销售', '服务地点', '现场联系人', '联系电话', '到访时间', '服务渠道', '设备型号与数量', '设备总数', '用时(小时)', '状态', '故障/需求', '服务内容', '更换配件', '处理结果', '后续跟进'], ...records.map(r => ['date', 'type', 'person', 'customer', 'project', 'sales', 'location', 'contact_name', 'contact_phone', 'service_time', 'channel', 'equipment', 'quantity', 'hours', 'status', 'problem', 'description', 'parts', 'result', 'follow_up'].map(k => r[k] || ''))];
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
    $('printArea').innerHTML = `<h1>售后上门服务单</h1><div class="print-meta">${field('单据类型', record.type)}${field('服务日期', record.date)}${field('主处理工程师', record.person)}${field('状态', record.status)}${field('用户 / 单位', record.customer)}${field('所属项目', record.project)}${field('负责销售', record.sales)}${field('服务地点', record.location)}${field('现场联系人', record.contact_name)}${field('联系电话', record.contact_phone)}${field('到访时间', record.service_time)}${field('投入工时', `${record.hours || 0} 小时`)}${field('设备总数', record.quantity)}${field('服务渠道', record.channel)}</div><h2>设备型号与数量</h2><div class="print-content">${esc(record.equipment || '—')}</div><h2>故障 / 用户需求</h2><div class="print-content">${esc(record.problem || '—')}</div><h2>服务内容</h2><div class="print-content">${esc(record.description || '—')}</div><h2>更换配件</h2><div class="print-content">${esc(record.parts || '—')}</div><h2>处理结果 / 用户确认</h2><div class="print-content">${esc(record.result || '—')}</div><h2>后续跟进</h2><div class="print-content">${esc(record.follow_up || '—')}</div><div class="signatures"><span>工程师签字：</span><span>用户确认：</span></div>`;
    window.print();
  }
  $('logoutBtn').onclick = async () => { await request('/api/logout', { method: 'POST', body: '{}' }); location.href = '/login'; };
  reloadRecords().catch(error => toast(error.message));
})();
