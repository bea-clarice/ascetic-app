"""
Ascetic — Digital Distraction vs Academic Performance
FastAPI Backend API  |  Phase 2
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import pandas as pd
import numpy as np
import os
import warnings

warnings.filterwarnings("ignore")

# ─── Model State ──────────────────────────────────────────────────────────────

models = {
    "focus_model":    None,
    "exam_model":     None,
    "label_encoders": None,
    "feature_cols":   None,
    "loaded":         False,
    "error":          None,
}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_models():
    """Load all .pkl files. Called once at startup."""
    try:
        print(f"[startup] BASE_DIR: {BASE_DIR}", flush=True)
        print(f"[startup] Files: {os.listdir(BASE_DIR)}", flush=True)

        models["focus_model"]    = joblib.load(os.path.join(BASE_DIR, "focus_score_model.pkl"))
        print("[startup] focus_score_model loaded", flush=True)

        models["exam_model"]     = joblib.load(os.path.join(BASE_DIR, "exam_score_model.pkl"))
        print("[startup] exam_score_model loaded", flush=True)

        models["label_encoders"] = joblib.load(os.path.join(BASE_DIR, "label_encoders.pkl"))
        print("[startup] label_encoders loaded", flush=True)

        models["feature_cols"]   = joblib.load(os.path.join(BASE_DIR, "feature_cols.pkl"))
        print("[startup] feature_cols loaded", flush=True)

        models["loaded"] = True
        print("[startup] All models loaded successfully!", flush=True)

    except Exception as e:
        models["error"] = str(e)
        # Log the error but DO NOT raise — let the server stay alive
        print(f"[startup] MODEL LOAD ERROR: {e}", flush=True)


# ─── Lifespan (replaces deprecated @app.on_event) ────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()   # runs once when server starts
    yield           # server is live here
    # (cleanup on shutdown, if needed)


# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Ascetic API",
    description="ML-powered focus score & exam grade predictor for the Ascetic PWA.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to your Vercel/Netlify URL after deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ordinal mapping for motivation_level
MOTIVATION_MAP = {"Low": 0, "Medium": 1, "High": 2}


# ─── Request / Response Schemas ───────────────────────────────────────────────

class PredictRequest(BaseModel):
    # ── Core daily inputs ──
    social_media_hours:            float = Field(..., ge=0, le=24)
    streaming_hours:               float = Field(..., ge=0, le=24)
    gaming_hours:                  float = Field(..., ge=0, le=24)
    study_hours_per_day:           float = Field(..., ge=0, le=24)
    sleep_hours:                   float = Field(..., ge=0, le=24)
    exercise_hours:                float = Field(..., ge=0, le=24)

    # ── Secondary metrics ──
    smartphone_usage_hours:        float = Field(default=4.0,  ge=0, le=24)
    class_attendance_percent:      float = Field(default=75.0, ge=0, le=100)
    assignment_completion_percent: float = Field(default=70.0, ge=0, le=100)
    caffeine_intake_cups:          float = Field(default=1.0,  ge=0)

    # ── Profile fields ──
    age:                    int = Field(default=20, ge=10, le=100)
    gender:                 str = Field(default="Male",      description="Male | Female")
    internet_quality:       str = Field(default="Average",   description="Poor | Average | Good")
    motivation_level:       str = Field(default="Medium",    description="Low | Medium | High")
    mental_health_status:   str = Field(default="Average",   description="Poor | Average | Good")
    parent_education_level: str = Field(default="Bachelors",
                                        description="HighSchool | Bachelors | Masters | PhD")

    model_config = {
        "json_schema_extra": {
            "example": {
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
                "parent_education_level": "Bachelors",
            }
        }
    }


class PredictResponse(BaseModel):
    focus_score: float = Field(..., description="Predicted focus score 0–100 %")
    exam_score:  float = Field(..., description="Projected exam score 0–100")
    tier:        int   = Field(..., description="1=Detox, 2=Warning, 3=Good")
    tier_label:  str   = Field(..., description="Human-readable tier name")
    nudge:       str   = Field(..., description="Personalised AI nudge message")


# ─── Helpers ──────────────────────────────────────────────────────────────────

VALID_OPTIONS = {
    "gender":                 ["Male", "Female"],
    "internet_quality":       ["Poor", "Average", "Good"],
    "mental_health_status":   ["Poor", "Average", "Good"],
    "parent_education_level": ["HighSchool", "Bachelors", "Masters", "PhD"],
    "motivation_level":       ["Low", "Medium", "High"],
}


def encode_input(data: PredictRequest) -> pd.DataFrame:
    for field, choices in VALID_OPTIONS.items():
        val = getattr(data, field)
        if val not in choices:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid value '{val}' for '{field}'. Valid options: {choices}",
            )

    row = {
        "social_media_hours":             data.social_media_hours,
        "streaming_hours":                data.streaming_hours,
        "gaming_hours":                   data.gaming_hours,
        "smartphone_usage_hours":         data.smartphone_usage_hours,
        "study_hours_per_day":            data.study_hours_per_day,
        "class_attendance_percent":       data.class_attendance_percent,
        "assignment_completion_percent":  data.assignment_completion_percent,
        "sleep_hours":                    data.sleep_hours,
        "exercise_hours":                 data.exercise_hours,
        "caffeine_intake_cups":           data.caffeine_intake_cups,
        "age":                            data.age,
        "gender":                         data.gender,
        "internet_quality":               data.internet_quality,
        "motivation_level":               data.motivation_level,
        "mental_health_status":           data.mental_health_status,
        "parent_education_level":         data.parent_education_level,
    }

    df = pd.DataFrame([row])

    for col, le in models["label_encoders"].items():
        df[col] = le.transform(df[col])

    df["motivation_level"] = df["motivation_level"].map(MOTIVATION_MAP)
    df = df[models["feature_cols"]]
    return df


def build_nudge(focus_score: float, exam_score: float, data: PredictRequest) -> str:
    if focus_score <= 30:
        return (
            f"Based on your habits, your projected exam score is {exam_score:.0f}/100. "
            "Your focus is critically low — activate Digital Detox Mode now and "
            "reclaim your concentration before it affects your grades permanently."
        )
    elif focus_score <= 59:
        distractions = {
            "social media": data.social_media_hours,
            "streaming":    data.streaming_hours,
            "gaming":       data.gaming_hours,
        }
        top = max(distractions, key=distractions.get)
        return (
            f"Based on your habits, your projected exam score is {exam_score:.0f}/100. "
            f"Reduce {top} by 1–2 hours to boost your focus score and protect your grade "
            "before distraction thresholds hit critical levels."
        )
    else:
        return (
            f"Excellent alignment! Your projected exam score is {exam_score:.0f}/100. "
            "Keep up the intentional digital balance today — consistency is what "
            "separates good students from great ones."
        )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {
        "status": "online",
        "app": "Ascetic API",
        "version": "1.0.0",
        "models_loaded": models["loaded"],
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    if not models["loaded"]:
        raise HTTPException(
            status_code=503,
            detail=f"Models not loaded. Error: {models['error']}",
        )
    return {"status": "healthy", "models_loaded": True}


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
def predict(payload: PredictRequest):
    """
    POST /predict

    Returns focus_score, exam_score, tier, tier_label, and a nudge message.
    """
    if not models["loaded"]:
        raise HTTPException(
            status_code=503,
            detail=f"Models not available. Startup error: {models['error']}",
        )

    try:
        df = encode_input(payload)

        focus_raw = float(models["focus_model"].predict(df)[0])
        exam_raw  = float(models["exam_model"].predict(df)[0])

        focus_score = round(float(np.clip(focus_raw * 10, 0.0, 100.0)), 1)
        exam_score  = round(float(np.clip(exam_raw,       0.0, 100.0)), 1)

        if focus_score <= 30:
            tier, tier_label = 1, "Digital Detox"
        elif focus_score <= 59:
            tier, tier_label = 2, "Warning"
        else:
            tier, tier_label = 3, "Excellent Alignment"

        return PredictResponse(
            focus_score=focus_score,
            exam_score=exam_score,
            tier=tier,
            tier_label=tier_label,
            nudge=build_nudge(focus_score, exam_score, payload),
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")