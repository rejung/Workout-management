# 05_Data_Model (데이터 모델 및 개념적 ERD)

본 문서는 운동 관리 시스템 Version 2에서 데이터를 적재하고 분석하기 위한 핵심 데이터 구조와 이들 간의 관계를 명세한다. 구글 시트 Version 1의 테이블 형태 적합성을 준수하면서도, 객체 지향적인 스키마 확장이 가능하도록 개체-관계(Entity-Relationship) 모델을 구축한다.

---

## 1. 개념적 개체 관계도 (Conceptual ERD)

```
       ┌─────────────────┐             ┌─────────────────┐
       │   Exercise      │             │    WeightLog    │
       ├─────────────────┤             ├─────────────────┤
       │ ID (PK)         │             │ ID (PK)         │
       │ Name            │             │ Date            │
       │ Category        │             │ Weight (kg)     │
       └────────┬────────┘             └─────────────────┘
                │
                │ 1
                │
                │ N (References)
       ┌────────▼────────┐
       │   WorkoutLog    │             ┌─────────────────┐
       ├─────────────────┤ 1         N │    SetRecord    │
       │ ID (PK)         │────────────►├─────────────────┤
       │ Date            │             │ ID (PK)         │
       │ Exercise ID(FK) │             │ SetNumber       │
       │ RunningDistance │             │ Weight (kg)     │
       │ RunningTime     │             │ Reps            │
       └─────────────────┘             └─────────────────┘
                │
                │ 1
                │
                │ 1 (References)
       ┌────────▼────────┐
       │  TrainingGoal   │
       ├─────────────────┤
       │ ID (PK)         │
       │ Exercise ID(FK) │
       │ Target_e1RM     │
       └─────────────────┘
```

---

## 2. 핵심 엔티티 상세 명세 (Entity Specifications)

### 2.1. Exercise (종목 마스터)
운동 종류와 신체 부위 범주를 관리하는 고유 메타 데이터이다. 중복 입력을 사전에 통제하는 역할을 수행한다.

| 속성명 (Field) | 데이터 타입 | 제약 조건 | 설명 |
| :--- | :--- | :--- | :--- |
| **id** | UUID / String | Primary Key | 종목 고유 식별 코드 |
| **name** | String | Unique, Not Null | 운동 정식 명칭 (예: 스쿼트, 벤치프레스) |
| **category** | String (Enum) | Not Null | 자극 부위 및 형태 (스쿼트, 가슴, 등, 어깨, 팔, 하체, 코어, 전신, 유산소) |

### 2.2. SetRecord (운동 세트 레코드)
운동을 실제 기입할 때 각 세트 단위별로 도달한 중량과 횟수의 원시 저장소이다.

| 속성명 (Field) | 데이터 타입 | 제약 조건 | 설명 |
| :--- | :--- | :--- | :--- |
| **id** | UUID / String | Primary Key | 세트 고유 식별 코드 |
| **setNumber** | Number | >= 1, Not Null | 수행 세트 순서 (1세트, 2세트 ...) |
| **weight** | Number | Float, Not Null | 세트당 수행 중량 (kg) |
| **reps** | Number | Integer, Not Null | 세트당 수행 성공 횟수 (Reps) |

### 2.3. WorkoutLog (훈련 수행 일지)
날짜별로 어떤 종목을 얼마만큼 세트들로 가동했는지 묶어주는 훈련 일지의 뼈대이다.

| 속성명 (Field) | 데이터 타입 | 제약 조건 | 설명 |
| :--- | :--- | :--- | :--- |
| **id** | UUID / String | Primary Key | 훈련 기록 고유 식별 코드 |
| **date** | Date / String | ISO-8601, Not Null | 운동을 수행한 구체적인 날짜 |
| **exerciseId** | UUID / String | Foreign Key | 어떤 종목(Exercise)을 훈련했는지에 대한 관계성 키 |
| **sets** | Array [SetRecord] | Embedded / Relation | 해당 종목 수행 시 달성한 하위 세트 레코드 목록 |
| **runningDistance**| Number | Nullable | 러닝인 경우 수행한 누적 거리 (km) |
| **runningTime** | String | Nullable | 러닝인 경우 수행한 시간 (HH:MM) |

### 2.4. WeightLog (체중 변화 연대기)
신체 질량의 변화를 분석하고 이동 평균을 구하는 단독 수집 저장소이다.

| 속성명 (Field) | 데이터 타입 | 제약 조건 | 설명 |
| :--- | :--- | :--- | :--- |
| **id** | UUID / String | Primary Key | 체중 기록 고유 식별 코드 |
| **date** | Date / String | ISO-8601, Not Null | 체중을 정밀 측정한 날짜 |
| **weight** | Number | Float, Not Null | 당일 측정 체중 수치 (kg) |

### 2.5. TrainingGoal (스트렝스 개인 목표치)
각 대종목별로 사용자가 설정한 최종 지향 중량을 담고 있으며, 대시보드에서 달성율 연산을 위해 필수 참조된다.

| 속성명 (Field) | 데이터 타입 | 제약 조건 | 설명 |
| :--- | :--- | :--- | :--- |
| **id** | UUID / String | Primary Key | 목표 고유 식별 코드 |
| **exerciseId** | UUID / String | Foreign Key, Unique | 목표와 연동되는 종목 ID |
| **target_e1RM** | Number | Not Null | 사용자가 달성하고자 하는 목표 추정 1RM 수치 (kg) |

---

## 3. 개체 간의 무결성 및 흐름 규칙 (Integrity Constraints)
* **참조 무결성 (Referential Integrity)**:
  * 특정 `Exercise` 메타데이터가 삭제될 경우, 해당 종목을 참조하는 모든 `WorkoutLog` 및 `TrainingGoal` 데이터는 정합성을 보장하기 위해 무상태 도메인 계층에서 적절한 '정리(Cascade) 규칙'에 의해 안전히 처리되어야 한다.
* **시간 정렬성 (Chronological Ordering)**:
  * `WorkoutLog`와 `WeightLog`는 시스템 내 모든 통계 알고리즘 가동 시 날짜 정보를 기반으로 정렬된 상태에서 입력되고 해석된다.
