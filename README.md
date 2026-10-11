# NYC Urban Mobility Dashboard - Summative Project Plan

This is the working draft README for the Team4C1 Urban Mobility Data Explorer project. It will be updated as the codebase and documentation evolve throughout the project.

- Repository: [GitHub - Team4C1 Urban Mobility Data Explorer](https://github.com/gunnogere/Team4C1_Summative_Urban_Mobility_Data_Explorer/)
- Team Tracker: [Team Participation Sheet](https://docs.google.com/spreadsheets/d/1WCFntWARypndTvvnE96RubS0UG_TBQ_wbSkPMJvA4II/edit?gid=0#gid=0)

## 1. Project Overview

This project builds an urban mobility analytics dashboard for analyzing NYC taxi trip data. The goal is to combine a reliable ETL pipeline, a structured database, a backend API, and a frontend dashboard into a complete end-to-end analytics solution.

The system is designed to:
- ingest raw taxi operation data
- clean and validate records
- create query-ready tables and derived metrics
- expose data through an API
- visualize insights on a dashboard
- support analysis of trip patterns, zones, distances, fares, and borough movements

## 2. Technical Stack

| Domain | Technology | Notes |
|---|---|---|
| Data Engine & ETL | Node.js + JavaScript | Current ETL pipeline in `etl_pipeline/` processes raw files and writes staged JSON outputs |
| Backend & REST API | Node.js | Backend services run with Node.js and expose the app's data endpoints |
| Database System | PostgreSQL | Relational schema for trips, zones, lookup tables, and geo metadata |
| Frontend Dashboard | HTML5, CSS3, JavaScript | Dashboard UI for charts, filters, KPI cards, and map-based views |
| Analytics & Data Validation | JavaScript + JSON staging | Derived metrics and cleaning logic are applied before database loading |

Note: This repo currently uses Node.js for the ETL and backend stack, and the project plan is aligned to that implementation.

## 3. Repository Structure

```text
Team4C1_Summative_Urban_Mobility_Data_Explorer/
├── backend/                 # Backend API and application logic
├── frontend/                # Frontend dashboard and charts
├── database/                # SQL schema, dumps, and database docs
├── etl_pipeline/            # ETL pipeline for raw data cleaning and staging
├── docs/                    # Documentation and exclusion logs
├── README.md                # Project overview and task plan
├── .gitignore               # Git ignore configuration
└── package files / configs  # Project tooling and installed dependencies
```

## 4. Team Roster & Ownership Matrix

### Team Members

- Joshua Gunnogere Mulongo — Data Engineer / ETL Lead
- Josue Nsengiyumva — Backend Engineer
- Didier ALUBSET2 — Frontend Engineer
- ~Moezy — Database Engineer

### Detailed Member Responsibilities

#### Member 1: Joshua Gunnogere Mulongo — Data Engineer

Technical Tasks:
- design and implement the ETL workflow
- ingest raw NYC taxi datasets
- validate and clean records
- generate cleaned JSON outputs for downstream loading
- document excluded rows and data quality issues

Administrative Tasks:
- maintain task coordination for ETL work
- confirm output readiness for database ingestion
- support repository organization and documentation updates

Report Deliverable:
- Author Section 1: Problem Framing & Dataset Analysis

#### Member 2: ~Moezy — Database & Algorithm Engineer

Technical Tasks:
- define the relational schema
- create SQL table definitions and relationships
- design indexing and constraints for efficient querying
- support database import from the cleaned ETL output
- help structure the data model for analytics and reporting

Report Deliverable:
- Author Section 3: Algorithmic Logic, Pseudo-code & O(N) Complexity Analysis

#### Member 3: Josue Nsengiyumva — Backend Engineer

Technical Tasks:
- build the REST API layer
- connect frontend requests to processed data
- implement filtering, aggregation, and summary endpoints
- work with the database and ETL outputs as the source of truth
- ensure the backend runs cleanly in the Node.js environment

Report Deliverable:
- Design the full system architecture diagram and author Section 2: System Architecture & Design Decisions

#### Member 4: Didier ALUBSET2 — Frontend Engineer

Technical Tasks:
- build the dashboard interface
- create KPI cards and visualizations
- implement chart layouts and user interaction
- connect the UI to backend endpoints
- present mobility insights clearly to end users

Report Deliverable:
- Author Section 4: 3 Urban Mobility Insights & Visualizations

### All Members — Joint Deliverables

- author Section 5: Reflection & Future Work of the project report
- record the 5-minute video walkthrough covering architecture, custom algorithm, and dashboard demo
- prepare a clean, runnable README with installation steps, setup instructions, and launch command guidance
- keep the repository organized and ensure all scripts run successfully

## 5. Workstreams and Responsibilities

### ETL Pipeline

- clean and validate the raw NYC trip dataset
- remove invalid, duplicate, or unrealistic records
- derive supporting analytics metrics such as duration, speed, and rush-hour flags
- output clean JSON files for database import

### Database

- create normalized relational tables
- store vendors, payment types, rate codes, zones, and trip records
- maintain integrity through foreign keys and indexes
- support the backend analytics queries

### Backend

- serve trip, zone, and summary data via API endpoints
- handle backend-side validation and business rules
- expose data for dashboard consumption
- support filtering and aggregation operations

### Frontend

- implement the interactive dashboard
- visualize trend and comparison data
- present actionable city mobility insights
- make the product easy to explore and understand

## 6. Deliverables Checklist

- Codebase archive and GitHub repository: fully runnable project with meaningful commit history
- Database dump and schema files: complete SQL scripts for PostgreSQL table creation and data import
- PDF technical documentation report (2–3 pages): covering sections 1 through 5
- Project README.md: clear, step-by-step launch and configuration instructions
- 5-minute video walkthrough: demonstrates architecture, algorithm execution, and working UI features
- Team participation sheet: completed with correct access permissions

## 7. Compliance, Guardrails & Integrity Rules

1. Zero-grade failures: missing any of the required core deliverables (video, documentation report, or README.md), or non-executable code, will result in automatic zero grading.
2. AI & code vibe policy: maximum allowable AI-generated code is 20%; at least 80% must be manually written. AI tools may be used mainly for formatting and README drafts, not for core engineering work.
3. Custom algorithm rules: any custom algorithm must be implemented from scratch using pure control structures. Do not use `sort()`, `heapq`, Pandas `.sort_values()`, or SQL `ORDER BY` if the task requires custom logic.
4. Sheet access controls: the team lead must remain the sole editor of the team participation sheet; all other members should have comment-only access.
5. Link verification: all GitHub, tracker, and video links must be valid and publicly accessible before submission.

## 8. Execution Flow

1. Run the ETL pipeline to clean and structure raw data.
2. Load the cleaned data into the PostgreSQL database.
3. Start the Node.js backend service.
4. Launch the frontend dashboard to visualize the results.
5. Validate the full flow from data ingestion to dashboard insights.

## 9. Project Status

This README is a draft and should be revised as the project progresses. It captures the current team structure, assigned responsibilities, and overall technical architecture for the Urban Mobility Data Explorer.

## 10. References

- Team Participation Sheet: [Google Sheet](https://docs.google.com/spreadsheets/d/1WCFntWARypndTvvnE96RubS0UG_TBQ_wbSkPMJvA4II/edit?gid=0#gid=0)
- Project Repository: [GitHub](https://github.com/gunnogere/Team4C1_Summative_Urban_Mobility_Data_Explorer/)
