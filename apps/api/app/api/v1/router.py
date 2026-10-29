from fastapi import APIRouter

from app.api.v1 import auth, chats, drafts, health, query, rights, users, voice

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, users, query, chats, drafts, rights, voice):
    api_router.include_router(module.router)
