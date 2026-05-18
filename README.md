# Ascetic API — Backend

> ML-powered focus score & exam grade predictor for the **Ascetic** PWA.

---

## Project Structure

```
ascetic-backend/
├── backend/
│   ├── api.py                    ← FastAPI app (Phase 2)
│   ├── focus_score_model.pkl     ← Trained GradientBoostingRegressor (focus)
│   ├── exam_score_model.pkl      ← Trained GradientBoostingRegressor (exam)
│   ├── label_encoders.pkl        ← LabelEncoders for categorical columns
│   ├── feature_cols.pkl          ← Ordered feature column list
│   └── requirements.txt          ← Python dependencies
├── render.yaml                   ← Render.com auto-deploy config
└── README.md
```

---

## API Endpoints

| Method | Path       | Description                              |
|--------|------------|------------------------------------------|
| GET    | `/`        | Health check, version info               |
| GET    | `/health`  | Liveness probe for Render                |
| POST   | `/predict` | Main prediction endpoint                 |
| GET    | `/docs`    | Interactive Swagger UI (auto-generated)  |

---

## POST /predict — Request Body

```json
{
  "social_media_hours": 3,
  "streaming_hours": 2,
  "gaming_hours": 1,
  "study_hours_per_day": 4,
  "sleep_hours": 7,
  "exercise_hours": 1,
  "smartphone_usage_hours": 5,
  "class_attendance_percent": 80,
  "assignment_completion_percent": 75,
  "caffeine_intake_cups": 2,
  "age": 20,
  "gender": "Male",
  "internet_quality": "Good",
  "motivation_level": "Medium",
  "mental_health_status": "Average",
  "parent_education_level": "Bachelors"
}
```

### Valid categorical values

| Field                   | Valid Values                              |
|-------------------------|-------------------------------------------|
| `gender`                | `Male`, `Female`                          |
| `internet_quality`      | `Poor`, `Average`, `Good`                 |
| `mental_health_status`  | `Poor`, `Average`, `Good`                 |
| `parent_education_level`| `HighSchool`, `Bachelors`, `Masters`, `PhD`|
| `motivation_level`      | `Low`, `Medium`, `High`                   |

---

## POST /predict — Response Body

```json
{
  "focus_score": 42.5,
  "exam_score": 69.2,
  "tier": 2,
  "tier_label": "Warning",
  "nudge": "Based on your habits, your projected exam score is 69/100. Reduce social media by 1–2 hours to boost your focus score..."
}
```

| Field         | Description                                      |
|---------------|--------------------------------------------------|
| `focus_score` | Predicted focus % for tomorrow (0–100)           |
| `exam_score`  | Projected exam grade (0–100)                     |
| `tier`        | `1` = Digital Detox (≤30%), `2` = Warning (31–59%), `3` = Excellent (≥60%) |
| `tier_label`  | Human-readable tier name                         |
| `nudge`       | Personalised AI insight for the Home page card   |

---

## Run Locally

```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload
```

API will be available at: `http://localhost:8000`  
Swagger docs at: `http://localhost:8000/docs`

Test with curl:

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "social_media_hours": 3,
    "streaming_hours": 2,
    "gaming_hours": 1,
    "study_hours_per_day": 4,
    "sleep_hours": 7,
    "exercise_hours": 1,
    "age": 20,
    "gender": "Male",
    "internet_quality": "Good",
    "motivation_level": "Medium",
    "mental_health_status": "Average",
    "parent_education_level": "Bachelors"
  }'
```

---

## Deploy to Render.com (Free Tier)

1. Push this entire `ascetic-backend/` folder to a **GitHub repo**
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` — click **Apply**
5. Wait ~3 minutes for the first build
6. Your API will be live at: `https://ascetic-api.onrender.com`

> ⚠️ **Important:** Render free tier spins down after 15 minutes of inactivity.  
> The first request after sleep takes ~30 seconds (cold start). This is normal.

---

## Frontend Integration

In your `app.js`, call the API like this when the user hits **Log**:

```javascript
const API_BASE = "https://ascetic-api.onrender.com"; // Replace with your Render URL

async function predict(formData, profile) {
  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      social_media_hours:            formData.socialMedia,
      streaming_hours:               formData.streaming,
      gaming_hours:                  formData.gaming,
      study_hours_per_day:           formData.study,
      sleep_hours:                   formData.sleep,
      exercise_hours:                formData.exercise,
      smartphone_usage_hours:        formData.smartphone ?? 4,
      class_attendance_percent:      profile.attendance  ?? 75,
      assignment_completion_percent: profile.assignments ?? 70,
      caffeine_intake_cups:          formData.caffeine   ?? 1,
      age:                           profile.age,
      gender:                        profile.gender,
      internet_quality:              profile.internetQuality,
      motivation_level:              profile.motivationLevel,
      mental_health_status:          profile.mentalHealthStatus,
      parent_education_level:        profile.parentEducation,
    }),
  });
  if (!res.ok) throw new Error("Prediction failed");
  return await res.json(); // { focus_score, exam_score, tier, tier_label, nudge }
}
```
