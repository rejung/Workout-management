# 04_System_Architecture (시스템 아키텍처 설계)

본 문서는 운동 관리 시스템 Version 2 웹 애플리케이션의 내부 레이어 구조와 모듈 간 의존성 방향을 다룬다. 시스템은 변경에 취약한 영속성 세부 기술에 종속되지 않도록 **"의존성 역전 원칙(Dependency Inversion Principle)"**을 반영하여 설계된다.

---

## 1. 계층형 아키텍처 개요 (Layered Architecture Overview)

```
┌─────────────────────────────────────────────────────────────┐
│                       UI Layer (React)                      │
│   - React Components / Tailwind CSS                         │
│   - View Models / Client State UI Controls                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│   - Service Use Cases (기록 가공 및 흐름 제어)               │
│   - State Management / Business Logic Orchestration        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Domain Layer                          │
│   - e1RM 연산 엔진 (Epley 공식)                             │
│   - 데이터 샘플링 필터 (4주 / 8주 이동 집계 도메인 규칙)     │
│   - Entities (Pure TypeScript) - 외부 종속성 0%              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Data / Infrastructure Layer                 │
│   - Repository Interfaces & DTO (Data Transfer Objects)      │
│   - Persistence Layer [미정 (추후 Firestore/Supabase 연동)]  │
│   - Local Cache Adapter (Transient Storage)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 레이어별 상세 정의 및 역할 (Layer Details)

### 2.1. UI Layer (React, Tailwind CSS, Lucide Icons)
* **역할**: 오직 사용자의 시각적 레이아웃과 액션 인터랙션을 책임진다.
* **책임 범위**:
  * 복잡한 수학적 연산(e1RM, 이동 평균 등)은 내부적으로 수행하지 않으며, 단지 하위 레이어에서 가공되어 바인딩된 지표 데이터를 사용자에게 직관적인 화면(대시보드, 타임라인)으로 렌더링한다.
  * 모바일 친화적인 UI 조작 피드백, 제어 애니메이션 제공.

### 2.2. Application Layer (Service & Coordination)
* **역할**: UI 영역과 핵심 비즈니스 도메인 규칙을 정합성 있게 이어주는 비즈니스 시나리오 관제탑.
* **책임 범위**:
  * "운동 세트를 입력하면 저장소에 전송하고, 동시에 대시보드 상태를 동기 업데이트한다"와 같은 전체적인 흐름 지휘(Orchestration).
  * 영속성 저장 매체에 접근하기 위한 추상화된 포트(Port/Repository Interface) 호출.

### 2.3. Domain Layer (Pure Domain Logic - Core Engine)
* **역할**: 어떠한 외부 라이브러리(React, CSS 등)나 인터넷 네트워크 연결 상태에도 오염되지 않는 순수한 데이터 연산 알고리즘 계층. Pure TypeScript 객체로만 구성된다.
* **핵심 도메인 알고리즘**:
  * **Epley Formula Engine**: 무게와 반복수에 따른 e1RM 산출 공식.
  * **Moving Average Engine**: 체중의 7일 이동 평균값 도출 연산.
  * **Historical Performance Sieve**: 수집 이력 중 최근 4주, 최근 8주의 비교 데이터를 분류 및 가공하는 정제 기법.

### 2.4. Data Layer (Persistence Layer - 미정)
* **역할**: 로데이터의 저장 및 읽기를 관리하는 입출력 인터페이스 어댑터 영역.
* **핵심 가이드**:
  * **영속성 데이터베이스 기술 미정**: 현재 설계 시점에서는 특정 로컬 스토리지(localStorage)나 상용 클라우드 데이터베이스 서비스(Firestore, Supabase, Cloud SQL 등)를 확정하지 않는다.
  * **인터페이스 기반 분리**: Application Layer에서는 오직 `WorkoutRepository`, `WeightRepository`라는 인터페이스만 선언하여 바라보며, 구체적인 파일 저장 및 DB 쿼리 드라이버는 Data Layer 하부에서 런타임에 어댑터 형태로 유연하게 주입(Dependency Injection)받아 기동한다.

---

## 3. 데이터 흐름 제어 규칙 (Data Flow Control Rules)
* **단방향 데이터 흐름 (Unidirectional Data Flow)**:
  * 사용자 입력 이벤트 발생 → UI 계층에서 캐치 → Application Service에 페이로드 전달 → Domain Entity에서 데이터 유효성 검증 및 도메인 로직 가동 → Repository Adapter를 통해 영속성 저장소에 기록 → 대시보드 상태 갱신 통지 → UI 리렌더링.
* **의존성 방향의 단방향화 (Dependency Rule)**:
  * 모든 소스 코드 의존성은 바깥쪽 레이어에서 안쪽 레이어(Core Domain)로만 향해야 한다. 즉, 도메인 코드는 리액트 컴포넌트나 SQL 쿼리를 절대로 직접적으로 알아서는 안 된다.
