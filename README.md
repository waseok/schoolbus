# 통학버스 안전일지

학교 등교 통학버스의 운행일지, 월별 미운행 통계, 월간 안전점검을 한곳에서 관리하는 웹 시스템입니다.

## 주요 기능

- 1~18호차 차량정보와 운전자·동승자 관리
- 학생별 단일 차량 배정 및 배정 시작일·종료일 이력 관리
- 등교 탑승 여부와 비고 기록
- 대한민국 공휴일 자동 제외, 재량휴업일 직접 설정
- 차량별 월간 미운행 날짜 통계
- 차량을 자유롭게 묶는 월간 안전점검 세트
- 관리자·운전자·동승자 역할과 담당 차량 권한
- 아이디와 숫자 간편 비밀번호 로그인
- 차량번호와 운전자 이름 가운데 글자 마스킹

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

검증 및 배포 빌드:

```bash
npm test
npm run build
```

Vercel에서는 Framework Preset을 `Next.js`로 두고 GitHub 저장소를 연결하면 됩니다.

## 데이터 저장

운영 데이터는 Supabase PostgreSQL에 저장됩니다. 첫 접속 시 관리자 계정을 만든 뒤 차량, 사용자, 학생 배정과 학사일정을 설정합니다. 실제 학생 정보와 비밀번호, Supabase 비밀키는 GitHub 저장소에 포함되지 않습니다.

서버 환경변수로 아래 두 값을 설정해야 합니다.

- `SUPABASE_URL`: 프로젝트 API URL
- `SUPABASE_SECRET_KEY`: 서버 전용 Secret API Key

데이터베이스 스키마는 `supabase/migrations/`에서 관리합니다.

## 기술 구성

- Next.js + React
- Vercel 서버 API Routes
- Supabase PostgreSQL + Row Level Security
- 한국 공휴일 자동 계산
