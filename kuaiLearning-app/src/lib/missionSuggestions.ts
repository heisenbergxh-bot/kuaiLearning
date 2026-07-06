// Shared suggestion chips for the mission interview (MissionChat).
// Moved out of the old form wizard so the conversational flow can reuse them.

export const SUGGESTED_TOPICS = [
  'Python 编程', 'JavaScript/前端', 'Rust', 'Go', 'Java', 'C/C++',
  '机器学习/AI', '数据分析', '日语', '英语', '韩语',
  '钢琴', '吉他', '瑜伽', '健身', '摄影', '投资理财', '写作', '烹饪',
];

export const SUGGESTED_MOTIVATIONS: { label: string; value: string }[] = [
  { label: '转行/找工作', value: '换一份更好的工作，进入新行业' },
  { label: '提升现有技能', value: '在现在的岗位上做得更好，争取晋升' },
  { label: '个人兴趣', value: '纯粹出于好奇和热爱，丰富生活' },
  { label: '完成具体项目', value: '想做出一个具体的东西（如网站、App、作品）' },
  { label: '考证书/考试', value: '为某个考试或认证做准备' },
  { label: '教别人', value: '想学懂了之后教给别人' },
  { label: '跟上时代', value: '不想被时代淘汰，保持竞争力' },
];

export const SUGGESTED_SUCCESS = [
  '独立完成一个项目', '通过相关考试', '看懂专业文档', '教给别人',
  '在工作中实际应用', '获得证书', '公开发表作品', '参加比赛',
];

export const SUGGESTED_CONSTRAINTS = [
  '每天只能学30分钟', '每周最多学3小时', '零基础', '有一定基础',
  '喜欢看视频学', '喜欢看书学', '需要中文资料', '预算有限',
];
