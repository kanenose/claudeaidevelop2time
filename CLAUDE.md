# 커뮤니티 사이트 — Claude Code 워크플로우

## 프로젝트 개요
Firebase 기반 한국어 커뮤니티 사이트.
게시글·댓글·투표·신고·관리자 기능을 포함한 단일 HTML/JS 앱.

## 기술 스택
- Vanilla JavaScript (프레임워크 없음)
- Firebase Authentication + Firestore
- 단일 페이지 앱 (index.html + js/ 폴더)

## 디렉토리 구조
```
community-site/
├── index.html
├── style.css
├── firestore.rules        ← Firestore 보안 규칙 (Firebase Console에 수동 적용)
└── js/
    ├── firebase-config.js ← Firebase 프로젝트 설정
    ├── state.js           ← 전역 상태 (currentUser, isAdmin 등)
    ├── utils.js           ← 공통 유틸 (esc, formatDate 등)
    ├── ui.js              ← 섹션 전환, 인증 UI 업데이트
    ├── auth.js            ← 로그인/회원가입/로그아웃
    ├── posts.js           ← 게시글 CRUD
    ├── comments.js        ← 댓글 CRUD
    ├── votes.js           ← 추천/비추천 (Firestore 트랜잭션)
    ├── profile.js         ← 프로필 페이지
    ├── settings.js        ← 닉네임/비밀번호 변경, 회원 탈퇴
    ├── admin.js           ← 관리자 패널
    └── main.js            ← 진입점 (loadPosts, loadBannedWords)
```

## 코드 규칙
- 스페이스 2칸 들여쓰기
- 사용자 입력은 반드시 `esc()` 함수로 이스케이프 후 DOM에 삽입
- innerHTML에 사용자 데이터 직접 삽입 금지
- Firestore 배치는 499개 단위로 분할

## 절대 하지 말 것
- firebase-config.js의 API 키 변경 금지
- firestore.rules 없이 Firestore 직접 접근 허용 금지
- `allow read, write: if true` 규칙 사용 금지

## Multi-Agent 코드 리뷰 워크플로우

PR이 열리면 `.github/workflows/claude-review.yml`이 자동으로 트리거됩니다.

### 에이전트 구성
| 에이전트 | 모델 | 역할 |
|---------|------|------|
| security-reviewer | sonnet | XSS, 인증·권한, Firestore Rules 취약점 |
| performance-reviewer | sonnet | Firestore 쿼리 효율, 리스너 누수, 렌더링 |
| style-reviewer | haiku | 코드 중복, 네이밍, 유지보수성 |

### 결과 파일
| 파일 | 내용 |
|------|------|
| `/tmp/review/security.md` | 보안 리뷰 상세 |
| `/tmp/review/performance.md` | 성능 리뷰 상세 |
| `/tmp/review/style.md` | 스타일 리뷰 상세 |
| `/tmp/review/final.md` | 심각도 순 종합 보고서 |

### 취합 기준
1. 동일 파일·라인 중복 이슈는 가장 높은 심각도만 유지
2. 높음 → 중간 → 낮음 순 정렬
3. 높음 이슈를 별도 Action Required 섹션으로 상단 추출
