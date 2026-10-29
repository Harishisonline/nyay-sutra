from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import update

from app.db import client as db_client
from app.db.models import ChatSession
from app.services import retention
from tests.conftest import FakeProvider, sign_in


async def _second_session(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    code = (await client.post("/api/v1/auth/request-otp", json={"phone": phone})).json()["dev_code"]
    res = await client.post("/api/v1/auth/verify-otp", json={"phone": phone, "code": code, "mode": "signin"})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


async def _ask(client: httpx.AsyncClient, headers: dict[str, str]) -> str:
    res = await client.post("/api/v1/query", json={"question": "My landlord cut the water supply"}, headers=headers)
    assert res.status_code == 200, res.text
    return str(res.json()["chat_id"])


async def test_delete_account_needs_a_fresh_code(client: httpx.AsyncClient) -> None:
    headers = await sign_in(client, "+919812345621")

    assert (await client.request("DELETE", "/api/v1/users/me", headers=headers)).status_code == 422
    wrong = await client.request("DELETE", "/api/v1/users/me", json={"code": "000000"}, headers=headers)
    assert wrong.status_code == 400
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 200

    code = (await client.post("/api/v1/users/me/delete-code", headers=headers)).json()["dev_code"]
    res = await client.request("DELETE", "/api/v1/users/me", json={"code": code}, headers=headers)
    assert res.status_code == 204
    assert (await client.get("/api/v1/users/me", headers=headers)).status_code == 401


async def test_retention_accepts_never_and_rejects_short_windows(client: httpx.AsyncClient) -> None:
    headers = await sign_in(client, "+919812345622")
    for days, status in ((0, 200), (7, 200), (365, 200), (3, 422), (366, 422), (-1, 422)):
        res = await client.patch("/api/v1/users/me/privacy", json={"retention_days": days}, headers=headers)
        assert res.status_code == status, (days, res.text)
    assert (await client.get("/api/v1/users/me", headers=headers)).json()["privacy"]["retention_days"] == 365


async def test_purge_follows_each_users_retention(client: httpx.AsyncClient, grounded: FakeProvider) -> None:
    never = await sign_in(client, "+919812345623")
    month = await sign_in(client, "+919812345624")
    no_history = await sign_in(client, "+919812345625")
    await client.patch("/api/v1/users/me/privacy", json={"retention_days": 0}, headers=never)
    await client.patch("/api/v1/users/me/privacy", json={"retention_days": 30}, headers=month)
    await client.patch("/api/v1/users/me/privacy", json={"save_chat_history": False, "retention_days": 365},
                       headers=no_history)
    chats = {"never": (never, await _ask(client, never)), "month": (month, await _ask(client, month)),
             "no_history": (no_history, await _ask(client, no_history))}

    async with db_client.get_sessionmaker()() as db:
        await db.execute(update(ChatSession).values(last_activity_at=datetime.now(UTC) - timedelta(days=10)))
        await db.commit()
        await retention.purge(db)

    kept = {name for name, (headers, chat_id) in chats.items()
            if (await client.get(f"/api/v1/chats/{chat_id}", headers=headers)).status_code == 200}
    assert kept == {"never", "month"}


async def test_personalisation_off_keeps_state_only(client: httpx.AsyncClient, grounded: FakeProvider) -> None:
    headers = await sign_in(client, "+919812345626", age=34, district="Pune", area="Kothrud")
    await client.patch("/api/v1/users/me/privacy", json={"use_profile_personalisation": False}, headers=headers)
    chat = (await client.get(f"/api/v1/chats/{await _ask(client, headers)}", headers=headers)).json()
    assert chat["context"]["state"] == "Maharashtra"
    assert chat["context"]["city"] is None
    assert chat["context"]["age"] is None
    assert "Kothrud" not in grounded.prompts[-1]


async def test_sessions_can_be_revoked_but_not_across_users(client: httpx.AsyncClient) -> None:
    first = await sign_in(client, "+919812345627")
    second = await _second_session(client, "+919812345627")
    stranger = await sign_in(client, "+919812345628")

    listed = (await client.get("/api/v1/users/me/sessions", headers=first)).json()
    assert len(listed) == 2
    assert sum(1 for s in listed if s["current"]) == 1
    other_id = next(s["id"] for s in listed if not s["current"])

    assert (await client.delete(f"/api/v1/users/me/sessions/{other_id}", headers=stranger)).status_code == 404
    assert (await client.get("/api/v1/users/me", headers=second)).status_code == 200

    assert (await client.delete(f"/api/v1/users/me/sessions/{other_id}", headers=first)).status_code == 204
    assert (await client.get("/api/v1/users/me", headers=second)).status_code == 401
    assert (await client.get("/api/v1/users/me", headers=first)).status_code == 200
