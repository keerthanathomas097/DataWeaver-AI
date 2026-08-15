from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from app.config import settings
from app.routers import auth
from app.routers import workspace
from app.routers import auth, workspace, discovery
from app.routers import auth, workspace, discovery, dataset
from app.services.storage_service import ensure_bucket_exists

app = FastAPI()

app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    ensure_bucket_exists()
app.include_router(auth.router)
app.include_router(workspace.router)
app.include_router(discovery.router)
app.include_router(dataset.router)