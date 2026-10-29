from __future__ import annotations

import httpx

from tests.conftest import FakeProvider, sign_in


async def test_profile_change_does_not_touch_existing_chat(client: httpx.AsyncClient, grounded: FakeProvider) -> None:
    headers = await sign_in(client, "+919812345611", age=34, state="Maharashtra", district="Pune", area="Kothrud")
    first = await client.post("/api/v1/query", json={"question": "My landlord cut the water supply"},
                              headers=headers)
    assert first.status_code == 200, first.text
    chat_id = first.json()["chat_id"]

    before = (await client.get(f"/api/v1/chats/{chat_id}", headers=headers)).json()["context"]
    assert before["state"] == "Maharashtra"
    assert before["city"] == "Pune, Kothrud"
    assert before["age"] == 34

    res = await client.patch("/api/v1/users/me", json={"age": 61, "state": "Goa", "district": "North Goa",
                                                       "area": "Panaji", "preferred_language": "marathi"},
                             headers=headers)
    assert res.status_code == 200

    follow = await client.post("/api/v1/query",
                               json={"question": "Can he also stop electricity?", "chat_id": chat_id},
                               headers=headers)
    assert follow.status_code == 200, follow.text

    after = (await client.get(f"/api/v1/chats/{chat_id}", headers=headers)).json()
    assert after["context"]["state"] == before["state"]
    assert after["context"]["city"] == before["city"]
    assert after["context"]["age"] == before["age"]
    assert after["context"]["language"] == before["language"] == "english"
    assert len(after["messages"]) == 4
    # The follow-up prompt carried the frozen profile, not the edited one.
    assert "Pune" in grounded.prompts[-1] and "Goa" not in grounded.prompts[-1]


async def test_new_chat_picks_up_new_profile(client: httpx.AsyncClient, grounded: FakeProvider) -> None:
    headers = await sign_in(client, "+919812345612", age=30, state="Maharashtra", district="Nagpur")
    await client.patch("/api/v1/users/me", json={"district": "Mumbai Suburban", "age": 31}, headers=headers)
    res = await client.post("/api/v1/query", json={"question": "Deposit not returned by landlord"}, headers=headers)
    chat = (await client.get(f"/api/v1/chats/{res.json()['chat_id']}", headers=headers)).json()
    assert chat["context"]["city"].startswith("Mumbai Suburban")
    assert chat["context"]["age"] == 31


async def test_chat_is_invisible_to_other_users(client: httpx.AsyncClient, grounded: FakeProvider) -> None:
    owner = await sign_in(client, "+919812345613")
    other = await sign_in(client, "+919812345614")
    res = await client.post("/api/v1/query", json={"question": "My landlord cut the water supply"}, headers=owner)
    chat_id = res.json()["chat_id"]

    assert (await client.get(f"/api/v1/chats/{chat_id}", headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/chats/{chat_id}", headers=other)).status_code == 404
    follow = await client.post("/api/v1/query", json={"question": "Follow up from someone else", "chat_id": chat_id},
                               headers=other)
    assert follow.status_code == 404
    assert (await client.get("/api/v1/chats/not-a-uuid", headers=owner)).status_code == 404
