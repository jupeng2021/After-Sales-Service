# 售后服务工作台

## 启动

在项目目录运行：

```sh
python3 server.py
```

然后打开 <http://127.0.0.1:8765>。首次打开会引导创建唯一的超级管理员账号；之后使用该账号登录。服务默认只监听本机地址。

## 当前框架

- 单一超级管理员登录，不设置员工账号或权限分级。
- 服务记录存入项目目录的 `data/ass.db` SQLite 数据库。
- 上门送货单登记送达日期和时间、目的地、用户、项目、销售、设备型号和数量。
- 上门维护单登记现场联系人、到访时间、故障/需求、服务内容、更换配件、处理结果和后续跟进。
- 远程服务记录 VPN、向日葵等处理渠道；驻场任务可标记群内安排并手工录入任务内容，不读取群消息。
- 增加公司内部工作记录，覆盖设备测试、设备安装/系统部署、运输/发货准备、配置/备货/打包、维修/返修及其他；默认工作地点为公司，可修改，并计入成员任务数、工作量统计、日历和 CSV。
- 每张单据可记录主处理工程师、协助工程师及各自投入工时；工作量按参与任务数和个人工时统计，并支持打印和 CSV 导出。
- 每位成员提供月历档案，可按日期查看已登记任务与工时。
- 内置深圳高校及科研院所名录，并覆盖华中师范大学、香港科技大学（广州）和澳门10所高等院校；可维护地区、地址、联系人、电话和备注，并查看关联服务记录。
- 支持自定义日期范围，按工程师汇总任务总数、各类任务、完成数和工时，并可导出统计 CSV。
- 支持成员、服务类型、周期、状态统计和记录筛选。
- 成员预置为陈巨鹏、肖林、洪凯。

初始单位名录参考深圳市教育局、深圳市财政局及深圳市科技类事业单位公开名录；科研机构名录动态调整，支持手动补录。日报同步暂不接入；当前不读取飞书群消息。数据库及本地环境文件不会提交到 GitHub。

名录来源： [深圳市教育局高校专栏导航](https://szeb.sz.gov.cn/home/xxgk/zdlyxxgkzl/gdyx/gxzldh/index.html)、[深圳市政府高等教育信息](https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12323537.html)、[深圳市财政局高校和科研院所名录](https://szfb.sz.gov.cn/xwzx/tzgg/content/post_6761659.html)、[深圳市科技类事业单位公开名录](https://www.szsbb.gov.cn/attachment/0/41/41512/759551.PDF)、[深圳虚拟大学园研究院评价名单](https://stic.sz.gov.cn/xxgk/tzgg/content/post_11645970.html)、[澳门教育及青年发展局院校资讯](https://portal.dsedj.gov.mo/webdsejspace/site/studyinmacau/tc/campus-information.html)、[华中师范大学招生章程](https://zs.ccnu.edu.cn/info/1006/11433.htm)及[香港科技大学（广州）招生章程](https://ugadmissions.hkust-gz.edu.cn/article/AdmissionPolicies/?student_type=HongKongMacaoTaiwan&zbid=16)。各来源范围不同且会动态调整，因此档案保留来源字段并支持补录。
