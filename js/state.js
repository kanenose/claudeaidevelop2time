let currentUser         = null;
let isAdmin             = false;
let currentSort         = 'latest';
let currentCategory     = 'all';
let searchQuery         = '';
let currentPostId       = null;
let allPosts            = [];
let bannedWords         = [];
let unsubscribePosts    = null;
let unsubscribeComments = null;

const CATEGORIES = [
  { id: 'all',      label: '전체',  color: '',        adminOnly: false },
  { id: 'free',     label: '자유',  color: '#4f46e5', adminOnly: false },
  { id: 'question', label: '질문',  color: '#f59e0b', adminOnly: false },
  { id: 'info',     label: '정보',  color: '#10b981', adminOnly: false },
  { id: 'humor',    label: '유머',  color: '#ec4899', adminOnly: false },
  { id: 'test',     label: '테스트', color: '#6b7280', adminOnly: true  },
];
