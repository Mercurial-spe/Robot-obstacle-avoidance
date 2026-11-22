"""Manual smoke check for the WS stream (not part of the pytest suite)."""

import asyncio
import json
import urllib.request

import websockets


def post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f"http://127.0.0.1:8000{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read())


async def main() -> None:
    session = post("/api/sessions", {"scenario_id": "static-basic", "algorithm": "astar"})
    sid = session["session_id"]
    async with websockets.connect(f"ws://127.0.0.1:8000/api/sessions/{sid}/stream") as ws:
        initial = json.loads(await ws.recv())
        print("initial status:", initial["status"], "run:", initial["run_status"])
        post(f"/api/sessions/{sid}/commands", {"action": "start"})
        received = 0
        last = None
        for _ in range(30):
            last = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            received += 1
        print(f"received {received} snapshots in ~2s")
        assert last is not None
        print(
            "after 2s wall: sim_time=%.2f distance=%.2f run=%s traj=%d"
            % (
                last["metrics"]["sim_time"],
                last["metrics"]["distance_traveled"],
                last["run_status"],
                len(last["trajectory"]),
            )
        )
        assert received >= 20, "WS rate should be ~15 Hz"
        assert last["metrics"]["sim_time"] > 1.0, "simulation should advance in real time"
        print("WS SMOKE OK")


asyncio.run(main())
