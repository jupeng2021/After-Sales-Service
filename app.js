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
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
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

  function periodRecords() {
    const period = $('period').value, now = new Date();
    return records.filter(r => {
      const date = new Date(`${r.date}T12:00:00`);
      return period === 'all' || (period === 'year' ? date.getFullYear() === now.getFullYear() : date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth());
    });
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
    const query = $('search').value.trim().toLowerCase(), type = $('filterType').value, person = $('filterPerson').value, status = $('filterStatus').value;
    const list = records.filter(r => (!type || r.type === type) && (!person || r.person === person) && (!status || r.status === status) && (!query || [r.customer, r.project, r.description, r.result, r.person, r.location].join(' ').toLowerCase().includes(query))).sort((a, b) => b.date.localeCompare(a.date));
    $('recordCount').textContent = `共 ${list.length} 条记录`;
    $('empty').hidden = list.length > 0;
    $('tbody').innerHTML = list.map(r => `<tr><td>${esc(r.date)}</td><td><span class="type-tag tag-${typeInfo(r.type).key}">${esc(r.type)}</span></td><td><b>${esc(r.customer)}</b><div class="muted">${esc(r.project || '未关联项目')}</div></td><td>${esc(r.person)}</td><td title="${esc(r.description)}">${esc(r.description.length > 34 ? r.description.slice(0, 34) + '…' : r.description)}</td><td>${Number(r.hours || 0) || '—'}</td><td><span class="status ${r.status === '已完成' ? 'done' : r.status === '处理中' ? 'processing' : 'pending'}">${esc(r.status)}</span></td><td><div class="row-actions"><button class="link-btn" data-edit="${esc(r.id)}">编辑</button><button class="link-btn delete" data-delete="${esc(r.id)}">删除</button></div></td></tr>`).join('');
  }
  function openModal(id) {
    $('recordForm').reset(); $('recordId').value = ''; $('date').value = today(); $('status').value = '待处理';
    $('modalTitle').textContent = id ? '编辑服务记录' : '新建服务记录';
    if (id) {
      const record = records.find(r => r.id === id); if (!record) return;
      for (const key of ['date', 'type', 'person', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result']) $(key).value = record[key] ?? '';
      $('recordId').value = id;
    }
    $('modalBack').classList.add('open');
  }
  function closeModal() { $('modalBack').classList.remove('open'); }
  async function reloadRecords() { records = await request('/api/records'); render(); }

  $('addBtn').onclick = () => openModal();
  $('closeModal').onclick = $('cancelBtn').onclick = closeModal;
  $('modalBack').onclick = event => { if (event.target === $('modalBack')) closeModal(); };
  document.onkeydown = event => { if (event.key === 'Escape') closeModal(); };
  $('recordForm').onsubmit = async event => {
    event.preventDefault();
    const id = $('recordId').value, body = {};
    for (const key of ['date', 'type', 'person', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result']) body[key] = $(key).value.trim();
    try {
      await request(id ? `/api/records/${encodeURIComponent(id)}` : '/api/records', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      closeModal(); await reloadRecords(); toast(id ? '记录已更新' : '服务记录已保存');
    } catch (error) { toast(error.message); }
  };
  $('tbody').onclick = async event => {
    const edit = event.target.closest('[data-edit]'), remove = event.target.closest('[data-delete]');
    if (edit) openModal(edit.dataset.edit);
    if (remove && confirm('确定删除这条服务记录吗？')) {
      try { await request(`/api/records/${encodeURIComponent(remove.dataset.delete)}`, { method: 'DELETE' }); await reloadRecords(); toast('记录已删除'); }
      catch (error) { toast(error.message); }
    }
  };
  for (const id of ['period', 'filterType', 'filterPerson', 'filterStatus']) $(id).addEventListener('change', render);
  $('search').addEventListener('input', render);
  $('navRecords').onclick = () => { document.querySelectorAll('.nav button').forEach(button => button.classList.remove('active')); $('navRecords').classList.add('active'); $('recordsPanel').scrollIntoView({ behavior: 'smooth' }); };
  $('exportBtn').onclick = () => {
    const rows = [['服务日期', '服务类型', '处理人员', '用户/单位', '所属项目', '负责销售', '服务地点', '服务渠道', '设备/配件', '数量', '用时(小时)', '状态', '服务内容', '处理结果'], ...records.map(r => ['date', 'type', 'person', 'customer', 'project', 'sales', 'location', 'channel', 'equipment', 'quantity', 'hours', 'status', 'description', 'result'].map(k => r[k] || ''))];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `售后服务记录_${today()}.csv`; link.click(); URL.revokeObjectURL(url); toast('已导出 CSV');
  };
  $('logoutBtn').onclick = async () => { await request('/api/logout', { method: 'POST', body: '{}' }); location.href = '/login'; };
  reloadRecords().catch(error => toast(error.message));
})();
