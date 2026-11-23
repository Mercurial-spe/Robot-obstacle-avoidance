"""API behavior: scene editing (PUT /scene), plan-info, and create params."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.scenarios.presets import get_preset


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


def _create_session(client: TestClient, **overrides) -> dict:
    payload = {"scenario_id": "static-basic", "algorithm": "astar"}
    payload.update(overrides)
    response = client.post("/api/sessions", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_create_session_accepts_param_overrides(client: TestClient) -> None:
    snapshot = _create_session(client, safety_margin=0.3, v_max=0.8, seed=3)
    assert snapshot["robot_radius"] == 0.25
    # Obstacle snapshots include static entries with zero velocity.
    assert snapshot["obstacles"][0]["kind"] == "rect"
    assert snapshot["obstacles"][0]["vx"] == 0.0
    assert snapshot["obstacles"][0]["motion"] is None
    assert snapshot["apf_force"] is None


def test_create_session_unknown_scenario_returns_error_body(client: TestClient) -> None:
    """Unknown scenario is a structured 400, not a raw 500."""
    response = client.post(
        "/api/sessions", json={"scenario_id": "no-such-scenario", "algorithm": "astar"}
    )
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["error"]["code"] == "unknown_scenario"


def test_create_session_unknown_algorithm_returns_error_body(client: TestClient) -> None:
    """Unknown algorithm is a structured 400, not a raw 500."""
    response = client.post(
        "/api/sessions", json={"scenario_id": "static-basic", "algorithm": "warp-drive"}
    )
    assert response.status_code == 400, response.text
    body = response.json()
    assert body["error"]["code"] == "unknown_algorithm"


def test_create_session_rejects_out_of_range_params(client: TestClient) -> None:
    response = client.post(
        "/api/sessions", json={"scenario_id": "static-basic", "safety_margin": -0.1}
    )
    assert response.status_code == 422
    response = client.post(
        "/api/sessions", json={"scenario_id": "static-basic", "v_max": 0.0}
    )
    assert response.status_code == 422


def test_plan_info_returns_grid_and_path(client: TestClient) -> None:
    snapshot = _create_session(client)
    response = client.get(f"/api/sessions/{snapshot['session_id']}/plan-info")
    assert response.status_code == 200, response.text
    info = response.json()
    assert info["session_id"] == snapshot["session_id"]
    assert info["algorithm"] == "astar"
    assert info["grid"] is not None
    grid = info["grid"]
    assert grid["origin_x"] == 0.0 and grid["origin_y"] == 0.0
    assert grid["resolution"] == pytest.approx(0.1)
    expected_cols = int(round(20.0 / 0.1))
    expected_rows = int(round(12.0 / 0.1))
    assert grid["cols"] == expected_cols and grid["rows"] == expected_rows
    assert len(grid["blocked"]) == expected_cols * expected_rows
    assert set(grid["blocked"]) <= {0, 1}
    assert any(cell == 1 for cell in grid["blocked"]), "obstacles must block cells"
    assert info["expanded_nodes"], "A* must record expanded nodes"
    assert info["path"], "a plan must exist for the preset"
    assert info["inflation_m"] == pytest.approx(0.25 + 0.15)


def test_plan_info_unknown_session(client: TestClient) -> None:
    response = client.get("/api/sessions/does-not-exist/plan-info")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "session_not_found"


def test_scene_update_replans_and_reset_restores_preset(client: TestClient) -> None:
    snapshot = _create_session(client)
    session_id = snapshot["session_id"]
    original = get_preset("static-basic")

    # Replace the scene with an empty arena: the new path must be a straight line.
    response = client.put(
        f"/api/sessions/{session_id}/scene",
        json={"obstacles": [], "start": [2.0, 6.0], "goal": [18.0, 6.0]},
    )
    assert response.status_code == 200, response.text
    edited = response.json()
    assert edited["obstacles"] == []
    assert edited["message"] is None
    assert edited["sim_time"] == 0.0
    assert edited["path"][0] == pytest.approx([2.0, 6.0], abs=0.2)
    assert edited["path"][-1] == pytest.approx([18.0, 6.0], abs=0.2)

    # Reset must restore the ORIGINAL preset scene, discarding the edit.
    response = client.post(f"/api/sessions/{session_id}/commands", json={"action": "reset"})
    assert response.status_code == 200
    restored = response.json()
    assert len(restored["obstacles"]) == len(original.obstacles)
    assert restored["obstacles"][0]["kind"] == "rect"
    assert restored["obstacles"][0]["x"] == original.obstacles[0].x


def test_scene_update_rejected_while_running(client: TestClient) -> None:
    snapshot = _create_session(client)
    session_id = snapshot["session_id"]
    response = client.post(f"/api/sessions/{session_id}/commands", json={"action": "start"})
    assert response.status_code == 200
    response = client.put(
        f"/api/sessions/{session_id}/scene",
        json={"obstacles": [], "start": [2.0, 6.0], "goal": [18.0, 6.0]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "scene_locked"


def test_scene_update_rejects_unreachable_scene(client: TestClient) -> None:
    snapshot = _create_session(client)
    session_id = snapshot["session_id"]
    # A wall sealing the whole arena leaves no path: 400 invalid_scene, old scene kept.
    unreachable = [
        {"kind": "rect", "x": 0.0, "y": 0.0, "width": 20.0, "height": 2.0},
        {"kind": "rect", "x": 0.0, "y": 10.0, "width": 20.0, "height": 2.0},
        {"kind": "rect", "x": 9.5, "y": 0.0, "width": 1.0, "height": 12.0},
    ]
    response = client.put(
        f"/api/sessions/{session_id}/scene",
        json={"obstacles": unreachable, "start": [2.0, 6.0], "goal": [18.0, 6.0]},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_scene"
    # The previous, valid scene is still in place.
    after = client.get(f"/api/sessions/{session_id}/plan-info")
    assert after.status_code == 200
    assert len(after.json()["path"]) > 2, "old plan must survive a rejected edit"


def test_scene_update_accepts_dynamic_obstacle_specs(client: TestClient) -> None:
    snapshot = _create_session(client)
    session_id = snapshot["session_id"]
    scene = {
        "obstacles": [
            {
                "kind": "dynamic-circle",
                "cx": 10.0,
                "cy": 6.0,
                "radius": 0.8,
                "motion": {"type": "pingpong", "axis": "y", "amplitude": 4.0, "half_period_s": 3.0},
            },
            {
                "kind": "dynamic-rect",
                "x": 14.0,
                "y": 5.0,
                "width": 1.0,
                "height": 2.0,
                "motion": {"type": "polyline", "points": [[0.0, -3.0]], "speed": 1.0, "pause_s": 0.5},
            },
        ],
        "start": [2.0, 6.0],
        "goal": [18.0, 6.0],
    }
    response = client.put(f"/api/sessions/{session_id}/scene", json=scene)
    assert response.status_code == 200, response.text
    edited = response.json()
    kinds = {obstacle["kind"] for obstacle in edited["obstacles"]}
    assert kinds == {"dynamic-circle", "dynamic-rect"}
    by_kind = {obstacle["kind"]: obstacle for obstacle in edited["obstacles"]}
    circle = by_kind["dynamic-circle"]
    assert circle["motion"]["type"] == "pingpong"
    assert circle["base"] == [10.0, 6.0]
    assert circle["vx"] is not None and circle["vy"] is not None
    rect = by_kind["dynamic-rect"]
    assert rect["motion"]["type"] == "polyline"
    assert rect["motion"]["points"] == [[14.0, 2.0]], "polyline points must be absolute"
    assert rect["width"] == 1.0 and rect["height"] == 2.0
