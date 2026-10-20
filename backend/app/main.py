from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from app.routers import auth, workspace, discovery, dataset, profiling, purpose_fitting
from app.services.storage_service import ensure_bucket_exists
import app.models  # Ensure all SQLModel tables are registered
from app.database import engine
from sqlmodel import SQLModel

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key)

cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if settings.frontend_url:
    clean_frontend_url = settings.frontend_url.rstrip("/")
    if clean_frontend_url not in cors_origins:
        cors_origins.append(clean_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    ensure_bucket_exists()
    SQLModel.metadata.create_all(engine)

app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(discovery.router)
app.include_router(dataset.router)
app.include_router(profiling.router)
app.include_router(purpose_fitting.router)