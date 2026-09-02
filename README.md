[English](README.md) | [Русский](README.ru.md)

# CV Soccer Situation Viewer

Computer vision application for converting short football video clips into interactive tactical situations.

The project combines **YOLO object detection**, **color-based player similarity search**, **PostgreSQL + pgvector**, **WebSocket real-time processing**, and interactive tactical visualization.

---

## Features

- Upload football videos through a web interface.
- Select a **1-second** episode for analysis.
- Cut the selected episode directly in the browser using **FFmpeg WebAssembly**.
- Send only the selected video fragment to the backend.
- Detect players and the ball using **Ultralytics YOLO**.
- Calculate visual color vectors for detected players.
- Find visually similar players using **pgvector**.
- Group players using a configurable similarity threshold.
- Manually assign player groups to:
  - Teammate
  - Opponent
  - Unknown
- Visualize players and the ball on a tactical field.
- Display movement directions using arrows.
- Receive analysis progress and processed frames through **WebSocket**.
- Save the resulting tactical scheme.
- Open saved situations in a separate Viewer.

---

## Pipeline

```text
Video
  │
  ▼
Select 1-second episode
  │
  ▼
FFmpeg WebAssembly
  │
  ▼
FastAPI Backend
  │
  ▼
YOLO Object Detection
  │
  ├── Players
  ├── Ball
  ├── Coordinates
  └── Movement Direction
  │
  ▼
Player Color Vectors
  │
  ▼
pgvector Similarity Search
  │
  ▼
Player Groups
  │
  ▼
Manual Team Assignment
  │
  ▼
Tactical Scheme
  │
  ▼
Save
  │
  ▼
Viewer
```

---

## Architecture

| Component | Technologies | Responsibility |
|---|---|---|
| Frontend | React, Vite | Video selection, timeline, tactical field, groups and Viewer |
| Video Processing | FFmpeg WebAssembly | Cutting the selected video segment in the browser |
| Backend | Python 3.12, FastAPI, Uvicorn | Video processing, YOLO inference, vector calculation and API |
| Computer Vision | Ultralytics YOLO, OpenCV, NumPy | Object detection and image processing |
| Database | PostgreSQL 16, pgvector | Scenes, objects, vectors, groups and tactical schemes |
| Communication | HTTP, WebSocket | API requests and real-time analysis updates |
| Infrastructure | Docker, Docker Compose | Running the complete application |

---

## How It Works

### 1. Video Selection

The user selects a football video through the web interface.

A timeline allows the user to choose the moment that should be analyzed.

The application currently works with a fixed **1-second video window**.

---

### 2. Client-Side Video Processing

The selected segment is extracted directly in the browser using **FFmpeg WebAssembly**.

The original video does not need to be uploaded to the backend in its entirety.

Only the selected 1-second fragment is sent to the server for analysis.

This reduces the amount of data transferred to the backend and keeps the initial video processing on the client side.

---

### 3. YOLO Analysis

The backend receives the selected clip and processes its frames using **Ultralytics YOLO**.

The analysis detects:

- Players
- Ball
- Object coordinates
- Movement direction

The processed information is stored by the backend and streamed to the frontend during analysis.

The frontend receives processing updates through a **WebSocket connection**.

---

### 4. Player Similarity and Grouping

For detected players, the backend calculates a visual color vector based on the player's appearance.

These vectors are stored and compared using **pgvector**.

Players with similar color vectors can then be grouped together.

The similarity threshold can be adjusted directly in the interface.

This allows the user to control how strictly players should be considered visually similar.

---

### 5. Team Assignment

Player groups are not automatically assigned to teams.

The user manually classifies each group as:

- **Teammate**
- **Opponent**
- **Unknown**

The selected classification is applied to all players belonging to that group.

---

### 6. Tactical Scheme

Detected objects are projected onto a tactical football field.

Players are displayed using different colors:

- **Teammate**
- **Opponent**
- **Unknown**

Movement directions are displayed using arrows.

The ball is displayed separately.

After the groups have been assigned, the tactical situation can be saved and opened in the Viewer.

---

## Requirements

The project is designed to run using **Docker** and **Docker Compose**.

No local Python or Node.js installation is required for the main application workflow.

You need:

- Docker
- Docker Compose

The default Docker configuration runs YOLO inference using the **CPU**.

GPU acceleration is not configured in the default Docker Compose setup.

---

## YOLO Model

The YOLO model is intentionally not included in the repository.

Download the required model and place it in:

```text
backend/yolo_model/yolo11n.pt
```

The model should not be committed to Git.

The backend uses the model specified by:

```env
ULTRALYTICS_YOLO_MODEL=yolo11n.pt
```

---

## Configuration

Create a `.env` file in the project root based on `.env.example`.

Example:

```env
POSTGRES_DB=soccer
POSTGRES_USER=soccer
POSTGRES_PASSWORD=soccer

POSTGRES_PORT=5432
BACKEND_PORT=8000
FRONTEND_PORT=5173

ULTRALYTICS_YOLO_MODEL=yolo11n.pt
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

---

## Running the Project

After downloading the YOLO model and configuring the environment files, start the application with:

```bash
docker compose up --build
```

Or run it in the background:

```bash
docker compose up --build -d
```

The application will be available at:

```text
Frontend:
http://localhost:5173

Backend:
http://localhost:8000
```

---

## Useful Docker Commands

Start the application:

```bash
docker compose up
```

Start and rebuild containers:

```bash
docker compose up --build
```

Start in detached mode:

```bash
docker compose up --build -d
```

Stop the application:

```bash
docker compose down
```

Restart the frontend:

```bash
docker compose restart frontend
```

Restart the backend:

```bash
docker compose restart backend
```

Restart PostgreSQL:

```bash
docker compose restart postgres
```

Rebuild a specific service:

```bash
docker compose build frontend
```

```bash
docker compose build backend
```

View logs:

```bash
docker compose logs -f
```

View backend logs:

```bash
docker compose logs -f backend
```

---

## Database

The project uses **PostgreSQL 16** with the **pgvector** extension.

Database initialization is performed automatically from:

```text
db/init/001_init.sql
```

The PostgreSQL data is stored in a Docker named volume:

```text
postgres_data
```

This allows database data to persist when containers are recreated.

---

## API and Real-Time Processing

The backend exposes a REST API through **FastAPI**.

The analysis workflow follows this general sequence:

During processing, the frontend receives information such as:

- Current frame
- Frame number
- Timestamp
- Detection information
- Processing progress
- Analysis completion status

This allows the interface to display the YOLO processing process in real time.

---

## Current Limitations

- Analysis is currently limited to a **1-second video segment**.
- Team assignment is performed manually after player grouping.
- Player grouping is primarily based on visual color similarity.
- Full camera perspective correction is not currently implemented.
- The system is designed for short tactical situations

---

## Future Improvements

Possible directions for further development include:

- Automatic team classification.
- More advanced player re-identification.
- More accurate field perspective transformation.
- Analysis of longer video sequences.
- Player and ball trajectory tracking.
- Improved player tracking across frames.

---

## Technologies

### Frontend

- React
- Vite
- FFmpeg WebAssembly
- WebSocket API

### Backend

- Python 3.12
- FastAPI
- Uvicorn
- OpenCV
- NumPy
- Ultralytics YOLO

### Database

- PostgreSQL 16
- pgvector

### Infrastructure

- Docker
- Docker Compose

---

## Project Goals

The main goal is to transform raw football video into a structured and interactive representation of a tactical situation.
