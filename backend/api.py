"""
Ascetic 
FastAPI Backend API  |  Phase 3 — with FCM Push Notifications
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
import json
from datetime import datetime, timezone, timedelta

import firebase_admin
from firebase_admin import credentials, firestore, messaging
from apscheduler.schedulers.background import BackgroundScheduler

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

# ─── Firebase Admin Setup ─────────────────────────────────────────────────────

firebase_db = None

def init_firebase():
    """Initialize Firebase Admin SDK using serviceAccount.json or env variable."""
    global firebase_db
    try:
        sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
        if sa_json:
            cred = credentials.Certificate(json.loads(sa_json))
        else:
            sa_path = os.path.join(BASE_DIR, "serviceAccount.json")
            if not os.path.exists(sa_path):
                print("[firebase] No service account found. Push notifications disabled.", flush=True)
                return
            cred = credentials.Certificate(sa_path)

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)

        firebase_db = firestore.client()
        print("[firebase] Firebase Admin initialized successfully.", flush=True)

    except Exception as e:
        print(f"[firebase] Init error: {e}", flush=True)


# ─── Push Notification Helpers ────────────────────────────────────────────────

def get_today_manila() -> str:
    """Return today's date in Asia/Manila time as YYYY-MM-DD."""
    manila = timezone(timedelta(hours=8))
    return datetime.now(manila).strftime("%Y-%m-%d")


def get_yesterday_manila() -> str:
    """Return yesterday's date in Asia/Manila time as YYYY-MM-DD."""
    manila = timezone(timedelta(hours=8))
    return (datetime.now(manila) - timedelta(days=1)).strftime("%Y-%m-%d")


def send_push_to_user(uid: str, title: str, body: str):
    """Send a push notification to all FCM tokens for a user."""
    if not firebase_db:
        return
    try:
        tokens_snap = list(
            firebase_db.collection("users").doc(uid).collection("tokens").stream()
        )
        tokens = [d.to_dict().get("token") for d in tokens_snap]
        tokens = [t for t in tokens if t]
        if not tokens:
            return

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(
                    title=title,
                    body=body,
                    icon="https://ascetic-app-ai.web.app/icons/icon-192.png",
                    vibrate=[120, 80, 120, 80, 120],
                    actions=[
                        messaging.WebpushNotificationAction(action="open",    title="Open App"),
                        messaging.WebpushNotificationAction(action="dismiss", title="Dismiss"),
                    ],
                ),
            ),
            tokens=tokens,
        )

        response = messaging.send_each_for_multicast(message)
        print(
            f"[push] uid={uid} success={response.success_count} failed={response.failure_count}",
            flush=True,
        )

        # Remove stale tokens
        for i, resp in enumerate(response.responses):
            if not resp.success and i < len(tokens_snap):
                err = str(resp.exception or "")
                if "not-registered" in err or "invalid-argument" in err:
                    tokens_snap[i].reference.delete()
                    print(f"[push] Removed stale token for uid={uid}", flush=True)

    except Exception as e:
        print(f"[push] Error for uid={uid}: {e}", flush=True)


# ─── Scheduled Jobs ───────────────────────────────────────────────────────────

def job_nightly_reminder():
    """Backward-compatible wrapper for the renamed daily reminder job."""
    job_daily_reminder()


def job_cognitive_reset():
    """
    Runs every 55 minutes. Only fires during study hours (8 AM – 10 PM Manila).
    """
    if not firebase_db:
        return

    hour = datetime.now(timezone(timedelta(hours=8))).hour
    if not (8 <= hour < 22):
        return

    print("[scheduler] Cognitive reset reminder firing.", flush=True)

    try:
        for user_doc in firebase_db.collection("users").stream():
            send_push_to_user(
                user_doc.id,
                "Cognitive Reset",
                "Take a 5-minute active break. Stand up, stretch, and step away from screens.",
            )
    except Exception as e:
        print(f"[scheduler] Cognitive reset error: {e}", flush=True)


def job_daily_reminder():
    """Runs at 8:00 AM Manila time and reminds users to log yesterday's data."""
    if not firebase_db:
        print("[scheduler] Firebase not ready. Skipping daily reminder.", flush=True)
        return

    yesterday = get_yesterday_manila()
    print(f"[scheduler] Daily reminder date={yesterday}", flush=True)

    try:
        for user_doc in firebase_db.collection("users").stream():
            uid = user_doc.id
            log_ref = (
                firebase_db.collection("users").doc(uid)
                .collection("logs").document(yesterday).get()
            )
            if log_ref.exists:
                send_push_to_user(
                    uid,
                    "Ascetic check-in complete",
                    "You logged yesterday's activities. Keep the rhythm going today.",
                )
            else:
                send_push_to_user(
                    uid,
                    "Ascetic daily reminder",
                    "Daily reminder to keep logging yesterday's activities in Ascetic.",
                )
    except Exception as e:
        print(f"[scheduler] Daily reminder error: {e}", flush=True)


def job_detox_break_reminder():
    """Runs every 55 minutes for users whose yesterday focus score is 30% or below."""
    if not firebase_db:
        return

    yesterday = get_yesterday_manila()
    print(f"[scheduler] Detox break reminder firing date={yesterday}", flush=True)

    try:
        for user_doc in firebase_db.collection("users").stream():
            uid = user_doc.id
            log_ref = (
                firebase_db.collection("users").doc(uid)
                .collection("logs").document(yesterday).get()
            )
            if not log_ref.exists:
                continue
            focus_score = float((log_ref.to_dict().get("result") or {}).get("focus_score", 101))
            if focus_score > 30:
                continue
            send_push_to_user(
                uid,
                "Digital Detox break",
                "Take a 5-minute break. Step away from screens and reset your focus.",
            )
    except Exception as e:
        print(f"[scheduler] Detox break reminder error: {e}", flush=True)


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="Asia/Manila")
    scheduler.add_job(job_daily_reminder,       "cron",     hour=8, minute=0, id="daily_reminder")
    scheduler.add_job(job_detox_break_reminder, "interval", minutes=55,        id="detox_break_reminder")
    scheduler.start()
    print("[scheduler] Started - daily: 08:00 | detox break: every 55 min", flush=True)
    return scheduler


# ─── Model Loader ─────────────────────────────────────────────────────────────

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
        print(f"[startup] MODEL LOAD ERROR: {e}", flush=True)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

_scheduler = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    load_models()
    init_firebase()
    _scheduler = start_scheduler()
    yield
    if _scheduler:
        _scheduler.shutdown(wait=False)
        print("[scheduler] Stopped.", flush=True)


# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Ascetic API",
    description="ML-powered focus score & exam grade predictor for the Ascetic PWA.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MOTIVATION_MAP = {"Low": 0, "Medium": 1, "High": 2}
CATEGORY_ALIASES = {
    "internet_quality": {
        "Low": "Poor", "Medium": "Average", "High": "Good",
        "Poor": "Low", "Average": "Medium", "Good": "High",
    }
}


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
    "internet_quality":       ["Poor", "Average", "Good", "Low", "Medium", "High"],
    "mental_health_status":   ["Poor", "Average", "Good"],
    "parent_education_level": ["HighSchool", "Bachelors", "Masters", "PhD"],
    "motivation_level":       ["Low", "Medium", "High"],
}


def coerce_category(field: str, value: str) -> str:
    """Use the value expected by the fitted LabelEncoder when aliases exist."""
    encoders = models.get("label_encoders") or {}
    encoder  = encoders.get(field)
    if encoder is None:
        return value
    classes = set(str(c) for c in getattr(encoder, "classes_", []))
    if value in classes:
        return value
    alias = CATEGORY_ALIASES.get(field, {}).get(value)
    if alias in classes:
        return alias
    return value


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
        "gender":                         coerce_category("gender",                data.gender),
        "internet_quality":               coerce_category("internet_quality",       data.internet_quality),
        "motivation_level":               coerce_category("motivation_level",       data.motivation_level),
        "mental_health_status":           coerce_category("mental_health_status",   data.mental_health_status),
        "parent_education_level":         coerce_category("parent_education_level", data.parent_education_level),
    }

    df = pd.DataFrame([row])

    encoded_cols = set()
    for col, le in models["label_encoders"].items():
        df[col] = le.transform(df[col])
        encoded_cols.add(col)

    if "motivation_level" not in encoded_cols:
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


def heuristic_prediction(data: PredictRequest, reason: str | None = None) -> PredictResponse:
    """Deterministic fallback used when hosted model artifacts are unavailable."""
    distraction_hours = data.social_media_hours + data.streaming_hours + data.gaming_hours
    recovery_score    = data.sleep_hours * 4 + data.exercise_hours * 5
    focus_score = round(float(np.clip(
        42 + data.study_hours_per_day * 9 + recovery_score - distraction_hours * 6,
        0.0, 100.0,
    )), 1)
    exam_score = round(float(np.clip(
        focus_score * 0.78 + data.study_hours_per_day * 4 + 8,
        0.0, 100.0,
    )), 1)

    if focus_score <= 30:
        tier, tier_label = 1, "Digital Detox"
    elif focus_score <= 59:
        tier, tier_label = 2, "Warning"
    else:
        tier, tier_label = 3, "Excellent Alignment"

    improved_exam = min(100.0, exam_score + max(6.0, data.social_media_hours * 3))
    prefix = f"{reason} " if reason else ""
    return PredictResponse(
        focus_score=focus_score,
        exam_score=exam_score,
        tier=tier,
        tier_label=tier_label,
        nudge=(
            f"{prefix}Based on your habits, your projected exam score is "
            f"{exam_score:.0f}/100. Reduce social media by 1 hour to boost it "
            f"to {improved_exam:.0f}/100."
        ),
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
def root():
    return {
        "status":        "online",
        "app":           "Ascetic API",
        "version":       "2.0.0",
        "models_loaded": models["loaded"],
        "firebase_ready": firebase_db is not None,
        "docs":          "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    if not models["loaded"]:
        raise HTTPException(
            status_code=503,
            detail=f"Models not loaded. Error: {models['error']}",
        )
    return {
        "status":        "healthy",
        "models_loaded": True,
        "firebase_ready": firebase_db is not None,
    }


@app.post("/notify/test", tags=["Notifications"])
def test_notify(uid: str):
    """Send a test push to a specific user. Use to verify FCM is working."""
    if not firebase_db:
        raise HTTPException(status_code=503, detail="Firebase not initialized.")
    send_push_to_user(uid, "Test Notification", "Ascetic push notifications are working!")
    return {"sent": True, "uid": uid}


@app.post("/notify/nightly", tags=["Notifications"])
def trigger_nightly():
    """Manually trigger the 8 AM daily reminder."""
    job_daily_reminder()
    return {"triggered": True}


@app.post("/predict", response_model=PredictResponse, tags=["Prediction"])
def predict(payload: PredictRequest):
    """
    POST /predict

    Returns focus_score, exam_score, tier, tier_label, and a nudge message.
    Falls back to heuristic if models are not loaded.
    """
    if not models["loaded"]:
        return heuristic_prediction(
            payload,
            reason="The hosted model is warming up, so Ascetic used a local estimate.",
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
        return heuristic_prediction(
            payload,
            reason=f"Model prediction failed ({str(e)}), so Ascetic used a local estimate.",
        )
